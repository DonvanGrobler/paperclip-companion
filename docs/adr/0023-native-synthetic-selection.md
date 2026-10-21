# ADR 0023: Native synthetic target selection and metadata binding

Date: 21 October 2026. Issue #71, P3-02c. Provisional feasibility evidence for
maintainer privacy review; OD-02 and production capture remain unresolved.

## Decision and boundary

Add explicit `--selection-self-test` to the existing original Windows probe.
Only process-owned, same-thread synthetic fixtures can be selected. Two windows
have the same title, process and thread metadata, but distinct red/blue and
green/yellow landmarks. Bind an explicitly chosen fixture directly to its WGC
item; never resolve a title back to a window or enumerate thumbnails. The
expected colors come from the test independently of the selected item, so
accidental retargeting fails the pixel check. Original red/blue checks remain,
with a stricter color tolerance shared by both palettes.

Each fixture has a unique shared lifetime object installed as its own window
user data during WM_NCCREATE. Revoke it before explicit destruction and on
WM_NCDESTROY. A selection retains this identity object and its capture item;
it does not recover identity from a numeric handle. Owning the fixture on the
calling thread makes this controlled observation-to-binding sequence possible.
This proof does **not** transfer to a foreign window or an asynchronous picker.

Read only the chosen fixture's PID/thread and at most 128 title characters into
a 129-wide-character buffer. Accept 1..127 characters; reject empty/failure and
the truncation boundary. Metadata buffers clear on ordinary destruction. A
fixed synthetic blocked title exercises denial; this is not the application's
real exclusion policy. Require current-process/current-thread ownership,
visibility and non-minimized state. Before acquiring pixels, require matching
nonzero generation, an unconsumed selection, a live identity/item, unchanged
metadata and an allowed title. Consume even failed acquisition attempts. Never
fall back to another window. Selection creates an item, but no frame pool,
capture session or pixel buffer.

The existing one-frame routine pumps messages while waiting. Recheck lifetime,
item and metadata after acquisition before returning success. A controlled
WM_APP event changes the fixture's title after StartCapture. That test permits
one native candidate to be read, but requires the selection to discard it and
close all resources. This differs from invalidity detected **before** start,
which must create zero capture starts. No image is returned or transported by
this mode; pixels remain in the existing bounded staging/readback path.

## Automated acceptance and API review

Run three selection self-test processes in the required Windows native build
step, retaining the original triple self-test and 19 transport cases. Test
both same-title windows, one-use/generation rejection, blocked/empty/oversized
metadata, rename, hide/minimize, immediate closure and same-process replacement,
and post-start metadata invalidation. A fresh replacement selection must work;
the old one must remain unusable without waiting for WGC's asynchronous Closed
event. Resource counters must balance. Reject extra CLI arguments before native
initialization. Diagnostics remain fixed labels/statuses/numeric HRESULT only.

Official Microsoft documentation reviewed 21 October 2026; no sample source copied:

- [CreateForWindow](https://learn.microsoft.com/en-us/windows/win32/api/windows.graphics.capture.interop/nf-windows-graphics-capture-interop-igraphicscaptureiteminterop-createforwindow) targets the supplied HWND. It is not an identity/consent guarantee.
- [GraphicsCaptureItem](https://learn.microsoft.com/en-us/uwp/api/windows.graphics.capture.graphicscaptureitem?view=winrt-26100) documents DisplayName and Size, creation methods and Closed. The reviewed contract supplies no reverse HWND/PID getter. Treating a picker title as a unique identity would be an unsupported inference; picker-to-exclusion mapping remains open.
- [GetWindowTextW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowtextw) can truncate and returns zero for multiple cases. Same-process retrieval sends WM_GETTEXT and can block on an unresponsive owner; this experiment owns the responsive procedure on the same thread.
- [GetWindowThreadProcessId](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getwindowthreadprocessid) reports ownership, not an immutable window identity.
- [SetWindowLongPtrW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowlongptrw), [WM_NCCREATE](https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-nccreate) and [WM_NCDESTROY](https://learn.microsoft.com/en-us/windows/win32/winmsg/wm-ncdestroy) define our own window's user-data and creation/destruction handling. Clear last error before the ambiguous zero return, retain default message handling, and revoke the fixture lifetime at destruction.
- [IsWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-iswindow) explicitly warns about destruction and recycled foreign handles. PID/thread/title checks do not close that race. No IsWindow-based authorization is introduced.
- [SetWinEventHook](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwineventhook) documents asynchronous out-of-context delivery and possible reentrancy. A delayed notification cannot establish atomic external binding; no hook is installed by this slice.

## Security, licensing and remaining decisions

Original source, existing SDK/CRT and link libraries only. No dependency or
inventory change, downloaded code, asset, global hook, external target, shell,
network, elevation, listener, renderer IPC, provider or app capture integration.
Titles/handles and pixels never reach logs, files, protocol output or artifacts.
The original transport mode still uses its private pipe and clears owned bytes.
Compiler/SDK pins and warnings as errors remain; inspect actual imports in CI.
ADR 0018's SDK/toolchain/CRT redistribution, provenance and packaging review
remain required before shipping a helper; npm license checks do not clear them.

These tests do not force recycled HWND values, prove foreign-window identity,
observe real foreground transitions, implement a selection UI, establish OS
picker mapping, or verify physical DPI/HDR/protected capture. The unique lifetime
object is available only because this process owns the fixture. External
observation-to-binding identity remains a production blocker, including for
explicit selection. A picker is not a consent or exclusion-policy waiver.
No forensic OS/GPU erasure or process-tree containment claim is made.

This is partial T-CAP-006/008/010/011 and native input-boundary evidence. G1
physical evidence, G2 promotion and G3 remain open. Next: resolve/document a
supported external identity/selection mechanism before a real-window adapter,
then reviewed in-memory conversion and consent/exclusion/transmission integration.
