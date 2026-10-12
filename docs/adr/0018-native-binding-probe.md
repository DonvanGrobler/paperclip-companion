# ADR 0018 — Isolated native capture-item lifetime probe

Date: 12 October 2026. Issue #48, P3-02b. Status: provisional native feasibility
slice for maintainer review; no production capture authorization.

## Decision and boundary

Implement an original C++/WinRT console self-test using the installed Windows SDK,
without a third-party capture addon. Build/test inside the existing required
Windows scaffold job so failure cannot be silently ignored. Keep the runtime
application unchanged. The executable accepts only `--self-test`, creates its own
synthetic windows and binds WGC items to those windows. It cannot accept an
external target. It starts no frame pool/session and produces no image bytes.

The first native question is whether item creation and close notification work on
our runner. Microsoft documents `CreateForWindow` as targeting one HWND and
`GraphicsCaptureItem.Closed` as notifying target closure, including some window
replacement cases. These facts support a lifetime experiment, not proof of atomic
identity or race-free authorization. See the official
[interop API](https://learn.microsoft.com/en-us/windows/win32/api/windows.graphics.capture.interop/nf-windows-graphics-capture-interop-igraphicscaptureiteminterop-createforwindow)
and [Closed event](https://learn.microsoft.com/en-us/uwp/api/windows.graphics.capture.graphicscaptureitem.closed?view=winrt-26100),
checked 12 October 2026. No sample implementation was copied.

The test rejects silent failure: unsupported item creation, missing close events,
invalid size and build problems fail the required job. A three-second event wait
is bounded; the job timeout bounds blocking native calls. Object destruction
revokes subscriptions before item release. Shared callback state prevents a
late callback from referring to destroyed stack memory. No sensitive native
metadata or exception text is printed. RAII also releases WinRT initialization
on errors. No production fallback is introduced if the experiment fails.

## Toolchain and licensing review

Use installed MSVC 14.51-family x64 tools, SDK **10.0.26100.0**, dynamic CRT (`/MD`),
SDK C++/WinRT projections, `windowsapp.lib` and `user32.lib`. The SDK version is
fixed; the compiler family is selected and its exact installed patch is logged.
The hosted image itself is mutable, so this is not a release-reproducibility claim.
SDK/toolset absence fails rather than downloading an unreviewed replacement.
The official [runner inventory](https://github.com/actions/runner-images/blob/main/images/windows/Windows2025-VS2026-Readme.md)
was inspected before choosing the SDK; compiler patch compatibility still needs
the native CI result. No npm dependency, copied SDK header/library, or new GitHub
Action is added. Built binaries remain transient and are not published.

The independently authored source follows the repository's current source-license
status; this change grants no broader distribution rights. Microsoft's
[C++/WinRT license](https://github.com/microsoft/cppwinrt/blob/master/LICENSE)
is MIT, but that does not license the entire Windows SDK, compiler or runtime.
Microsoft's [redistribution guidance](https://learn.microsoft.com/en-us/cpp/windows/redistributing-visual-cpp-files)
requires reviewing applicable terms and permitted redistributables. No SDK, CRT
installer or helper executable is cleared for distribution by this experiment.
Before bundling: inventory the exact SDK projections/runtime imports, retain
applicable notices, verify SDK/VS license terms and runtime deployment rights,
pin exact build inputs, and review signing/provenance. npm's license scanner does
not cover native build inputs. This separate inventory is intentionally explicit.

## Alternatives and remaining evidence

An npm native addon would add dependency/provenance and Electron ABI surface
before proving the required API behavior. A full image-capture helper would mix
identity, graphics, IPC and privacy failures. This probe isolates build/item
lifetime first; it is one bounded step of the planned helper feasibility work.

No claim of external-window identity, reused-HWND safety, pixel isolation,
foreground hook ordering, selection-to-exclusion mapping, private helper IPC or
Windows 11 physical validation follows from passing. The next owned-window
one-frame/cleanup probe must be separately scoped/reviewed. Production capture
still requires consent, exclusion and transmission integration and OD-02/G3
evidence. Existing G1/G2 promotion limits remain.
