#pragma once

struct FixtureMetadata final {
    DWORD process{}, thread{};
    wchar_t title[129]{};
    FixtureMetadata() = default;
    FixtureMetadata(const FixtureMetadata&) = delete;
    FixtureMetadata& operator=(const FixtureMetadata&) = delete;
    ~FixtureMetadata() { SecureZeroMemory(title, sizeof(title)); }

    bool read(HWND window, const std::shared_ptr<const FixtureState>& identity) {
        // This check is valid ONLY for our own same-thread fixture lifetime.
        // PID/thread/title equality is explicitly not external identity proof.
        if (!identity->live.load()) return false;
        thread = GetWindowThreadProcessId(window, &process);
        if (process != GetCurrentProcessId() || thread != GetCurrentThreadId() ||
            !IsWindowVisible(window) || IsIconic(window)) return false;
        const int length = GetWindowTextW(window, title, 129);
        // Reject the ambiguous truncation boundary as well as empty/failed reads.
        return length > 0 && length < 128 && identity->live.load();
    }
    bool allowed() const noexcept {
        return std::wcscmp(title, L"Paperclip synthetic blocked") != 0;
    }
    bool matches(const FixtureMetadata& other) const noexcept {
        return process == other.process && thread == other.thread &&
            std::wcscmp(title, other.title) == 0;
    }
};

// A controlled selector lease, NOT a production resolver or external-window API.
class FixtureSelection final {
    const HWND window_;
    const std::shared_ptr<const FixtureState> identity_;
    const unsigned long long generation_;
    FixtureMetadata selected_;
    std::unique_ptr<Binding> binding_;
    FrameMetrics metrics_;
    bool consumed_ = false;
public:
    FixtureSelection(const SyntheticWindow& window, unsigned long long generation)
        : window_(window.handle()), identity_(window.identity()), generation_(generation) {
        stage = "selection-metadata";
        if (generation_ == 0 || !selected_.read(window_, identity_) || !selected_.allowed()) return;
        // Same-thread fixture ownership is the identity proof in this experiment.
        // No asynchronous selector or foreign HWND is accepted here.
        binding_ = std::make_unique<Binding>(window);
    }
    FixtureSelection(const FixtureSelection&) = delete;
    FixtureSelection& operator=(const FixtureSelection&) = delete;
    const FrameMetrics& metrics() const noexcept { return metrics_; }

    bool acquire(unsigned long long generation, const FixtureColors& expected,
        FrameMode mode = FrameMode::success) {
        if (consumed_) return false;
        consumed_ = true;
        stage = "selection-validation";
        if (generation != generation_ || generation_ == 0 || !binding_ ||
            !identity_->live.load() || binding_->closed()) return false;
        FixtureMetadata current;
        if (!current.read(window_, identity_) || !current.allowed() || !current.matches(selected_)) return false;
        const bool captured = captureOne(*binding_, mode, metrics_, nullptr, expected);
        // captureOne pumps messages. Discard if metadata/lifetime changed while waiting.
        FixtureMetadata after;
        return captured && !binding_->closed() && after.read(window_, identity_) &&
            after.allowed() && after.matches(selected_);
    }
};

// Acceptance cases use only fixtures created on this thread. Never external HWNDs.
static void expectSelectionIdle(const FixtureSelection& selection) {
    const auto& metrics = selection.metrics();
    stage = "selection-idle";
    require(metrics.starts == 0 && metrics.accepted == 0 &&
        metrics.pools == 0 && metrics.sessions == 0 && metrics.frames == 0);
}

static void expectSelection(FixtureSelection& selection, unsigned long long generation,
    const FixtureColors& expected, bool success) {
    const auto before = selection.metrics();
    const bool captured = selection.acquire(generation, expected);
    const auto& after = selection.metrics();
    stage = "selection-result";
    require(captured == success);
    require(after.starts - before.starts == (success ? 1u : 0u));
    require(after.accepted - before.accepted == (success ? 1u : 0u));
    require(after.poolsClosed == after.pools && after.sessionsClosed == after.sessions &&
        after.framesClosed == after.frames && after.cleanupErrors == 0);
}

static int selectionSelfTest() {
    stage = "initialize-apartment";
    Apartment apartment;
    FixtureClass fixtureClass;
    {
        SyntheticWindow first;
        SyntheticWindow second(greenYellow, 460);
        first.present();
        second.present();
        FixtureMetadata firstMetadata, secondMetadata;
        stage = "selection-same-title";
        require(firstMetadata.read(first.handle(), first.identity()));
        require(secondMetadata.read(second.handle(), second.identity()));
        require(firstMetadata.matches(secondMetadata));
        require(first.identity() != second.identity());

        FixtureSelection selectedFirst(first, 1), selectedSecond(second, 2);
        expectSelectionIdle(selectedFirst);
        expectSelectionIdle(selectedSecond);
        expectSelection(selectedFirst, 1, redBlue, true);
        expectSelection(selectedSecond, 2, greenYellow, true);
        // Consumed selections cannot acquire again, even with unchanged metadata.
        expectSelection(selectedFirst, 1, redBlue, false);
        expectSelection(selectedSecond, 2, greenYellow, false);

        FixtureSelection stale(first, 3), invalid(first, 0);
        expectSelection(stale, 4, redBlue, false);
        expectSelection(stale, 3, redBlue, false);
        expectSelection(invalid, 0, redBlue, false);
    }
    std::puts("PASS same-title distinct targets, metadata-only selection, generation denial, one-use acquisition");

    enum class Denial { blockedBefore, emptyBefore, oversizedBefore, blockedAfter,
        renamedAfter, hiddenAfter, minimizedAfter, replacedAfter };
    for (const auto denial : {Denial::blockedBefore, Denial::emptyBefore, Denial::oversizedBefore,
        Denial::blockedAfter, Denial::renamedAfter, Denial::hiddenAfter,
        Denial::minimizedAfter, Denial::replacedAfter}) {
        SyntheticWindow target;
        target.present();
        stage = "selection-fixture-mutation";
        if (denial == Denial::blockedBefore)
            require(SetWindowTextW(target.handle(), L"Paperclip synthetic blocked") != FALSE);
        if (denial == Denial::emptyBefore)
            require(SetWindowTextW(target.handle(), L"") != FALSE);
        if (denial == Denial::oversizedBefore) {
            wchar_t title[150]{};
            std::fill_n(title, 149, L'x');
            require(SetWindowTextW(target.handle(), title) != FALSE);
            SecureZeroMemory(title, sizeof(title));
        }
        FixtureSelection selection(target, 10);
        expectSelectionIdle(selection);
        stage = "selection-fixture-mutation";
        if (denial == Denial::blockedAfter)
            require(SetWindowTextW(target.handle(), L"Paperclip synthetic blocked") != FALSE);
        if (denial == Denial::renamedAfter)
            require(SetWindowTextW(target.handle(), L"Paperclip renamed fixture") != FALSE);
        if (denial == Denial::hiddenAfter) {
            ShowWindow(target.handle(), SW_HIDE);
            require(IsWindowVisible(target.handle()) == FALSE);
        }
        if (denial == Denial::minimizedAfter) {
            ShowWindow(target.handle(), SW_SHOWMINNOACTIVE);
            require(IsIconic(target.handle()) != FALSE);
        }
        if (denial == Denial::replacedAfter) {
            target.close();
            // Do not wait for the asynchronous WGC Closed notification. The owned
            // lifetime is already revoked, even if Windows recycles a handle.
            SyntheticWindow replacement(greenYellow);
            replacement.present();
            expectSelection(selection, 10, redBlue, false);
            FixtureSelection fresh(replacement, 11);
            expectSelectionIdle(fresh);
            expectSelection(fresh, 11, greenYellow, true);
        }
        expectSelection(selection, 10, redBlue, false);
    }
    std::puts("PASS blocked/empty/oversized/changed metadata, hidden/minimized targets, closed replacement: zero starts");
    {
        SyntheticWindow target;
        target.present();
        FixtureSelection selection(target, 20);
        stage = "selection-post-start-mutation";
        require(PostMessageW(target.handle(), WM_APP + 1, 0, 0) != FALSE);
        // Fault injection pumps that owned-window event immediately after StartCapture.
        // Require a native candidate, so this proves the final metadata check
        // rejects an acquired frame rather than passing on an unrelated timeout.
        require(!selection.acquire(20, redBlue, FrameMode::dispatchFixtureEvent));
        const auto& metrics = selection.metrics();
        stage = "selection-post-start-discard";
        require(metrics.starts == 1 && metrics.accepted == 1);
        require(metrics.poolsClosed == metrics.pools && metrics.sessionsClosed == metrics.sessions &&
            metrics.framesClosed == metrics.frames && metrics.cleanupErrors == 0);
        FixtureMetadata after;
        require(after.read(target.handle(), target.identity()) && !after.allowed());
        expectSelection(selection, 20, redBlue, false);
    }
    std::puts("PASS metadata change after capture start discards candidate and closes native resources");
    return 0;
}
