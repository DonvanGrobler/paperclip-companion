// Original synthetic-window feasibility probe. No frame acquisition or app integration.
#define WIN32_LEAN_AND_MEAN
#define NOMINMAX
#include <windows.h>
#include <windows.graphics.capture.interop.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <atomic>
#include <cstdio>
#include <cwchar>
#include <memory>
#include <stdexcept>

using winrt::Windows::Graphics::Capture::GraphicsCaptureItem;

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

class SyntheticWindow final {
    HWND handle_{};
public:
    SyntheticWindow() {
        handle_ = CreateWindowExW(WS_EX_TOOLWINDOW, L"STATIC",
            L"Paperclip synthetic fixture", WS_OVERLAPPEDWINDOW | WS_VISIBLE,
            100, 100, 320, 240, nullptr, nullptr, GetModuleHandleW(nullptr), nullptr);
        require(handle_ != nullptr);
    }
    SyntheticWindow(const SyntheticWindow&) = delete;
    SyntheticWindow& operator=(const SyntheticWindow&) = delete;
    ~SyntheticWindow() { if (handle_) DestroyWindow(handle_); }
    HWND handle() const noexcept { return handle_; }
    void close() {
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
        const auto factory = winrt::get_activation_factory<GraphicsCaptureItem,
            IGraphicsCaptureItemInterop>();
        winrt::check_hresult(factory->CreateForWindow(window.handle(),
            winrt::guid_of<GraphicsCaptureItem>(), winrt::put_abi(item_)));
        const auto flag = closed_;
        subscription_ = item_.Closed(winrt::auto_revoke,
            [flag](const auto&, const auto&) noexcept { flag->store(true); });
        const auto size = item_.Size();
        require(size.Width > 0 && size.Height > 0);
    }
    Binding(const Binding&) = delete;
    Binding& operator=(const Binding&) = delete;
    bool closed() const noexcept { return closed_->load(); }
    // Member destruction revokes the callback before releasing the item/flag.
};

static void awaitClosed(const Binding& binding) {
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

int wmain(int argc, wchar_t** argv) {
    // Reject all external targets/options before initializing WinRT or creating windows.
    if (argc != 2 || std::wcscmp(argv[1], L"--self-test") != 0) return 2;
    try {
        Apartment apartment;
        {
            SyntheticWindow first;
            Binding original(first);
            require(!original.closed());
            first.close();
            awaitClosed(original);

            SyntheticWindow replacement;
            Binding fresh(replacement);
            require(original.closed());
            require(!fresh.closed());
            replacement.close();
            awaitClosed(fresh);
            require(original.closed());
        }
        std::puts("PASS native item creation, close notification, replacement isolation, teardown");
        return 0;
    } catch (...) {
        // Deliberately omit exception text, titles, handles and other native metadata.
        std::fputs("FAIL native capture-item probe\n", stderr);
        return 1;
    }
}
