#pragma once
#include <initializer_list>
#include <d3d11.h>
#include <windows.graphics.directx.direct3d11.interop.h>
#include <winrt/Windows.Graphics.DirectX.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>

using winrt::Windows::Graphics::Capture::Direct3D11CaptureFrame;
using winrt::Windows::Graphics::Capture::Direct3D11CaptureFramePool;
using winrt::Windows::Graphics::Capture::GraphicsCaptureSession;
using winrt::Windows::Graphics::DirectX::DirectXPixelFormat;
using winrt::Windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;

enum class FrameMode { success, cancelBeforeStart, cancelAfterStart, expiredDeadline, rejectFrame };
struct FrameMetrics {
    unsigned starts{}, accepted{}, pools{}, sessions{}, frames{};
    unsigned poolsClosed{}, sessionsClosed{}, framesClosed{}, cleanupErrors{};
};

// Independent no-throw cleanup attempts ensure one failure cannot skip other closes.
struct FrameScope final {
    FrameMetrics& metrics;
    Direct3D11CaptureFramePool pool{nullptr};
    GraphicsCaptureSession session{nullptr};
    Direct3D11CaptureFrame frame{nullptr};
    explicit FrameScope(FrameMetrics& value) : metrics(value) {}
    FrameScope(const FrameScope&) = delete;
    FrameScope& operator=(const FrameScope&) = delete;
    void stop() {
        if (session) {
            session.Close();
            session = nullptr;
            ++metrics.sessionsClosed;
        }
    }
    ~FrameScope() {
        try { stop(); } catch (...) { ++metrics.cleanupErrors; }
        try { if (frame) { frame.Close(); ++metrics.framesClosed; } }
        catch (...) { ++metrics.cleanupErrors; }
        try { if (pool) { pool.Close(); ++metrics.poolsClosed; } }
        catch (...) { ++metrics.cleanupErrors; }
    }
};

static void pumpFrameWait() {
    MSG message{};
    // Bound work per iteration so a busy queue cannot defeat the deadline.
    for (unsigned count = 0; count < 32 && PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE); ++count) {
        TranslateMessage(&message);
        DispatchMessageW(&message);
    }
    MsgWaitForMultipleObjectsEx(0, nullptr, 10, QS_ALLINPUT, MWMO_INPUTAVAILABLE);
}

// Only called by the explicit synthetic self-test. Never a production capture API.
static bool captureOne(const Binding& binding, FrameMode mode, FrameMetrics& metrics) {
    if (binding.closed() || mode == FrameMode::cancelBeforeStart) return false;
    stage = "capture-supported";
    require(GraphicsCaptureSession::IsSupported());
    const auto size = binding.item().Size();
    require(size.Width > 0 && size.Height > 0 && size.Width <= 1024 && size.Height <= 1024);

    stage = "d3d-device";
    winrt::com_ptr<ID3D11Device> device;
    winrt::com_ptr<ID3D11DeviceContext> context;
    // Explicit software device for this CI probe, not a production backend decision.
    winrt::check_hresult(D3D11CreateDevice(nullptr, D3D_DRIVER_TYPE_WARP, nullptr,
        D3D11_CREATE_DEVICE_BGRA_SUPPORT, nullptr, 0, D3D11_SDK_VERSION,
        device.put(), nullptr, context.put()));
    const auto dxgi = device.as<IDXGIDevice>();
    winrt::com_ptr<IInspectable> projected;
    winrt::check_hresult(CreateDirect3D11DeviceFromDXGIDevice(dxgi.get(), projected.put()));
    const auto graphicsDevice = projected.as<IDirect3DDevice>();

    FrameScope resources(metrics);
    stage = "frame-pool";
    resources.pool = Direct3D11CaptureFramePool::CreateFreeThreaded(graphicsDevice,
        DirectXPixelFormat::B8G8R8A8UIntNormalized, 1, size);
    ++metrics.pools;
    resources.session = resources.pool.CreateCaptureSession(binding.item());
    ++metrics.sessions;
    resources.session.IsCursorCaptureEnabled(false);
    // Keep the OS capture indicator; never request borderless capture.
    stage = "start-frame";
    resources.session.StartCapture();
    ++metrics.starts;
    if (mode == FrameMode::cancelAfterStart) return false;
    const auto deadline = GetTickCount64() + (mode == FrameMode::expiredDeadline ? 0 : 5000);
    stage = "await-frame";
    while (GetTickCount64() < deadline && !binding.closed()) {
        resources.frame = resources.pool.TryGetNextFrame();
        if (resources.frame) { ++metrics.frames; break; }
        pumpFrameWait();
    }
    resources.stop();
    if (!resources.frame || binding.closed()) return false;
    if (mode == FrameMode::rejectFrame) return false;

    stage = "frame-bounds";
    const auto content = resources.frame.ContentSize();
    require(content.Width == size.Width && content.Height == size.Height);
    winrt::com_ptr<ID3D11Texture2D> texture;
    auto access = resources.frame.Surface().as<Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess>();
    winrt::check_hresult(access->GetInterface(__uuidof(ID3D11Texture2D), texture.put_void()));
    D3D11_TEXTURE2D_DESC description{};
    texture->GetDesc(&description);
    require(description.Width >= static_cast<UINT>(content.Width) &&
        description.Height >= static_cast<UINT>(content.Height) &&
        description.Width <= 1024 && description.Height <= 1024 &&
        description.Format == DXGI_FORMAT_B8G8R8A8_UNORM &&
        description.SampleDesc.Count == 1 && description.MipLevels == 1 && description.ArraySize == 1);
    description.Usage = D3D11_USAGE_STAGING;
    description.BindFlags = 0;
    description.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
    description.MiscFlags = 0;
    winrt::com_ptr<ID3D11Texture2D> readback;
    winrt::check_hresult(device->CreateTexture2D(&description, nullptr, readback.put()));
    context->CopyResource(readback.get(), texture.get());

    stage = "readback";
    D3D11_MAPPED_SUBRESOURCE mapped{};
    HRESULT result = DXGI_ERROR_WAS_STILL_DRAWING;
    while (GetTickCount64() < deadline && !binding.closed()) {
        result = context->Map(readback.get(), 0, D3D11_MAP_READ, D3D11_MAP_FLAG_DO_NOT_WAIT, &mapped);
        if (result != DXGI_ERROR_WAS_STILL_DRAWING) break;
        context->Flush();
        pumpFrameWait();
    }
    if (result == DXGI_ERROR_WAS_STILL_DRAWING) return false;
    winrt::check_hresult(result);
    // Inspect only valid ContentSize landmarks, never padding or unrelated pixels.
    bool colors = false;
    if (mapped.pData && mapped.RowPitch >= static_cast<UINT>(content.Width) * 4) {
        const auto row = static_cast<const unsigned char*>(mapped.pData) +
            static_cast<size_t>(content.Height / 2) * mapped.RowPitch;
        const auto left = row + static_cast<size_t>(content.Width / 4) * 4;
        const auto right = row + static_cast<size_t>((content.Width * 3) / 4) * 4;
        colors = left[2] > 200 && left[1] < 40 && left[0] < 40 &&
            right[0] > 200 && right[1] < 40 && right[2] < 40;
    }
    context->Unmap(readback.get(), 0);
    stage = "synthetic-landmarks";
    require(colors);
    if (binding.closed()) return false;
    ++metrics.accepted;
    return true;
}

static void testSingleFrame(const Binding& binding) {
    for (const auto mode : {FrameMode::success, FrameMode::cancelBeforeStart,
        FrameMode::cancelAfterStart, FrameMode::expiredDeadline, FrameMode::rejectFrame, FrameMode::success}) {
        FrameMetrics metrics;
        const bool captured = captureOne(binding, mode, metrics);
        const bool expected = mode == FrameMode::success;
        stage = "frame-cleanup-assertions";
        require(captured == expected && metrics.accepted == (expected ? 1u : 0u));
        require(metrics.starts == (mode == FrameMode::cancelBeforeStart ? 0u : 1u));
        require(metrics.frames == (expected || mode == FrameMode::rejectFrame ? 1u : 0u));
        require(metrics.poolsClosed == metrics.pools && metrics.sessionsClosed == metrics.sessions &&
            metrics.framesClosed == metrics.frames && metrics.cleanupErrors == 0);
    }
    std::puts("PASS one-frame landmarks, pre/post-start cancel, expired deadline, rejected-frame cleanup, fresh capture");
}
