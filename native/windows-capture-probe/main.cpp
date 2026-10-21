// Original synthetic-window feasibility probe. No external targets or app integration.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <dwmapi.h>
#include <windows.graphics.capture.interop.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <atomic>
#include <cstdio>
#include <cwchar>
#include <memory>
#include <stdexcept>

using winrt::Windows::Graphics::Capture::GraphicsCaptureItem;
static const char* stage = "argument-check";

class Apartment final {
public:
    Apartment() { winrt::init_apartment(winrt::apartment_type::single_threaded); }
    ~Apartment() { winrt::uninit_apartment(); }
    Apartment(const Apartment&) = delete;
    Apartment& operator=(const Apartment&) = delete;
};

static void require(bool condition) {
    if (!condition) throw std::runtime_error("probe assertion");
}

struct FixtureColors { COLORREF left, right; };
static constexpr FixtureColors redBlue{RGB(255, 0, 0), RGB(0, 0, 255)};
static constexpr FixtureColors greenYellow{RGB(0, 255, 0), RGB(255, 255, 0)};

// Unique, non-reused identity owned by the fixture, not inferred from an HWND.
struct FixtureState final {
    const FixtureColors colors;
    std::atomic_bool live{true};
    explicit FixtureState(FixtureColors value) : colors(value) {}
};

class FixtureClass final {
    static LRESULT CALLBACK procedure(HWND window, UINT message, WPARAM w, LPARAM l) {
        if (message == WM_NCCREATE) {
            const auto creation = reinterpret_cast<const CREATESTRUCTW*>(l);
            if (!creation->lpCreateParams) return FALSE;
            SetLastError(0);
            const auto previous = SetWindowLongPtrW(window, GWLP_USERDATA,
                reinterpret_cast<LONG_PTR>(creation->lpCreateParams));
            if (previous == 0 && GetLastError() != 0) return FALSE;
            return DefWindowProcW(window, message, w, l);
        }
        const auto state = reinterpret_cast<FixtureState*>(GetWindowLongPtrW(window, GWLP_USERDATA));
        if (message == WM_NCDESTROY && state) {
            state->live.store(false);
            SetWindowLongPtrW(window, GWLP_USERDATA, 0);
        }
        // An explicit test-only event to exercise invalidation during frame waiting.
        if (message == WM_APP + 1)
            return SetWindowTextW(window, L"Paperclip synthetic blocked");
        if (message != WM_PAINT) return DefWindowProcW(window, message, w, l);
        if (!state) return DefWindowProcW(window, message, w, l);
        PAINTSTRUCT paint{};
        const auto dc = BeginPaint(window, &paint);
        RECT area{};
        GetClientRect(window, &area);
        RECT left = area;
        left.right = area.right / 2;
        RECT right = area;
        right.left = left.right;
        const auto brush = static_cast<HBRUSH>(GetStockObject(DC_BRUSH));
        SetDCBrushColor(dc, state->colors.left);
        FillRect(dc, &left, brush);
        SetDCBrushColor(dc, state->colors.right);
        FillRect(dc, &right, brush);
        EndPaint(window, &paint);
        return 0;
    }
public:
    FixtureClass() {
        WNDCLASSW definition{};
        definition.lpfnWndProc = procedure;
        definition.hInstance = GetModuleHandleW(nullptr);
        definition.lpszClassName = L"PaperclipSyntheticFixture";
        require(RegisterClassW(&definition) != 0);
    }
    ~FixtureClass() { UnregisterClassW(L"PaperclipSyntheticFixture", GetModuleHandleW(nullptr)); }
    FixtureClass(const FixtureClass&) = delete;
    FixtureClass& operator=(const FixtureClass&) = delete;
};

class SyntheticWindow final {
    std::shared_ptr<FixtureState> identity_;
    HWND handle_{};
public:
    explicit SyntheticWindow(FixtureColors colors = redBlue, int left = 100)
        : identity_(std::make_shared<FixtureState>(colors)) {
        stage = "create-fixture";
        handle_ = CreateWindowExW(WS_EX_APPWINDOW, L"PaperclipSyntheticFixture",
            L"Paperclip synthetic fixture", WS_OVERLAPPEDWINDOW | WS_VISIBLE,
            left, 100, 320, 240, nullptr, nullptr, GetModuleHandleW(nullptr), identity_.get());
        require(handle_ != nullptr);
    }
    // Called after construction so the destructor also runs if presentation fails.
    void present() const {
        stage = "paint-fixture";
        // A hidden-console child can inherit STARTF_USESHOWWINDOW/SW_HIDE.
        // Explicitly present only our fixture without activating another app.
        require(SetWindowPos(handle_, nullptr, 0, 0, 0, 0,
            SWP_NOMOVE | SWP_NOSIZE | SWP_NOZORDER | SWP_NOACTIVATE | SWP_SHOWWINDOW) != FALSE);
        require(IsWindowVisible(handle_) != FALSE);
        UpdateWindow(handle_);
        winrt::check_hresult(DwmFlush());
    }
    SyntheticWindow(const SyntheticWindow&) = delete;
    SyntheticWindow& operator=(const SyntheticWindow&) = delete;
    ~SyntheticWindow() {
        identity_->live.store(false);
        if (handle_) DestroyWindow(handle_);
    }
    HWND handle() const noexcept { return handle_; }
    std::shared_ptr<const FixtureState> identity() const noexcept { return identity_; }
    void close() {
        // Revoke before destruction, not after delivery of an asynchronous event.
        identity_->live.store(false);
        require(DestroyWindow(handle_) != FALSE);
        handle_ = nullptr;
    }
};

class Binding final {
    std::shared_ptr<std::atomic_bool> closed_ = std::make_shared<std::atomic_bool>(false);
    GraphicsCaptureItem item_{nullptr};
    GraphicsCaptureItem::Closed_revoker subscription_{};
public:
    // Only accepts a fixture created by this process, never an arbitrary HWND.
    explicit Binding(const SyntheticWindow& window) {
        stage = "activation-factory";
        const auto factory = winrt::get_activation_factory<GraphicsCaptureItem,
            IGraphicsCaptureItemInterop>();
        stage = "create-item";
        winrt::check_hresult(factory->CreateForWindow(window.handle(),
            winrt::guid_of<GraphicsCaptureItem>(), winrt::put_abi(item_)));
        const auto flag = closed_;
        stage = "subscribe-closed";
        subscription_ = item_.Closed(winrt::auto_revoke,
            [flag](const auto&, const auto&) noexcept { flag->store(true); });
        stage = "item-size";
        const auto size = item_.Size();
        require(size.Width > 0 && size.Height > 0);
    }
    Binding(const Binding&) = delete;
    Binding& operator=(const Binding&) = delete;
    bool closed() const noexcept { return closed_->load(); }
    const GraphicsCaptureItem& item() const noexcept { return item_; }
    // Member destruction revokes the callback before releasing the item/flag.
};

#include "single-frame.h"

static void awaitClosed(const Binding& binding) {
    stage = "await-closed";
    const auto deadline = GetTickCount64() + 3000;
    while (!binding.closed() && GetTickCount64() < deadline) {
        MSG message{};
        while (PeekMessageW(&message, nullptr, 0, 0, PM_REMOVE)) {
            TranslateMessage(&message);
            DispatchMessageW(&message);
        }
        MsgWaitForMultipleObjectsEx(0, nullptr, 10, QS_ALLINPUT, MWMO_INPUTAVAILABLE);
    }
    require(binding.closed());
}

#include "transport.h"
#include "selection.h"

int wmain(int argc, wchar_t** argv) {
    // Reject all external targets/options before initializing WinRT or creating windows.
    if (argc != 2) return 2;
    const bool transport = std::wcscmp(argv[1], L"--transport-self-test") == 0;
    const bool selection = std::wcscmp(argv[1], L"--selection-self-test") == 0;
    if (!transport && !selection && std::wcscmp(argv[1], L"--self-test") != 0) return 2;
    try {
        if (transport) return transportSelfTest();
        if (selection) return selectionSelfTest();
        stage = "initialize-apartment";
        Apartment apartment;
        FixtureClass fixtureClass;
        {
            SyntheticWindow first;
            first.present();
            Binding original(first);
            stage = "original-live";
            require(!original.closed());
            testSingleFrame(original);
            first.close();
            awaitClosed(original);
            FrameMetrics denied;
            require(!captureOne(original, FrameMode::success, denied));
            require(denied.starts == 0 && denied.accepted == 0);

            SyntheticWindow replacement;
            replacement.present();
            Binding fresh(replacement);
            stage = "replacement-isolation";
            require(original.closed());
            require(!fresh.closed());
            replacement.close();
            awaitClosed(fresh);
            require(original.closed());
        }
        std::puts("PASS native item creation, close notification, replacement isolation, teardown");
        return 0;
    } catch (const winrt::hresult_error& error) {
        std::fprintf(stderr, "FAIL native capture-item probe: %s HRESULT=%08X\n",
            stage, static_cast<unsigned int>(error.code().value));
        return 1;
    } catch (...) {
        // Deliberately omit exception text, titles, handles and other native metadata.
        std::fprintf(stderr, "FAIL native capture-item probe: %s\n", stage);
        return 1;
    }
}
