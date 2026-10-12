# ADR 0017 — Windows capture and target identity

- Date: 12 October 2026
- Status: **Proposed; maintainer privacy review required** (OD-02, issue #44)
- Scope: P3-02/03 design only. No capture, native helper, hook or dependency is enabled by this ADR.

## Context and recommendation

J2/J6 require the window the user intended before opening the companion, with
selection on uncertainty. Capturing every source and discarding unwanted images
afterward already crosses that privacy boundary. A remembered numeric handle is
also insufficient proof of identity.

Propose a small, independently authored Windows helper using
Windows.Graphics.Capture (WGC), controlled exclusively by Electron main. Start
with a window-only adapter spike. Keep automatic capture as the product goal
for a proven target; ask for explicit selection when proof is unavailable.
Display capture remains planned, but must pass its separate exclusion and
multi-monitor tests before exposure. No silent window-to-display fallback.

This is an engineering proposal, not a statement that WGC or a hook supplies
atomic identity, consent, exclusion enforcement or one-shot behavior. Native
feasibility must be demonstrated before production capture integration.

## Documented API facts and alternatives

Official references were checked on 12 October 2026; no sample code was copied.

| Option                                | Documented behavior                                                                                                                                                         | Project assessment                                                                                                                                                                                           |
| ------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Electron `desktopCapturer.getSources` | Returns source arrays; default thumbnails are 150×150. Zero width or height avoids thumbnail processing. Its documented options do not include a single-window filter. [E1] | Reject nonzero-thumbnail enumeration: unrelated images can be collected before selection. Metadata-only enumeration is not foreground identity proof.                                                        |
| Electron display-media stream         | Electron documents main-side source selection with a renderer media stream. [E1]                                                                                            | Possible alternative, not technically impossible; would require a separate restricted capture surface and strict stream teardown. Do not give the chat renderer desktop media access or select `sources[0]`. |
| WGC window item                       | `CreateForWindow` creates an item for a supplied HWND; available since Windows 10 1903. [W1]                                                                                | Preferred Windows 11 spike: target-specific input without app-wide thumbnail capture. This API call is not application consent.                                                                              |
| WGC picker/frame pipeline             | The OS picker returns a capture item. Capture uses a session/frame pool, including for a snapshot; support checks, content size and HDR handling matter. [W2]               | Picker is selection only. Main must still authorize; one-shot and cleanup are our responsibilities. Preserve OS capture feedback.                                                                            |

The native helper adds build, packaging and IPC complexity. If the spike cannot
meet the boundary below, stop and revise OD-02; do not quietly substitute a
broader capture API.

## Proposed target contract

1. **Observe identity, never pixels.** On invocation retain at most one ephemeral
   candidate. A hotkey may read foreground before activating the companion.
   Mouse/tray activation requires evidence of the preceding external target;
   querying foreground after focus moves cannot recover it. `GetForegroundWindow`
   can also return null during transitions. [W3]
2. **Prove the transition or select.** A possible native approach is an
   event-only `EVENT_SYSTEM_FOREGROUND` observer, no polling or window history.
   Out-of-context hooks avoid injection, require a message loop and must handle
   reentrancy despite sequential queued delivery. [W4] This approach needs
   maintainer review and a native feasibility test. Ignore neither companion
   activation events nor intervening external focus changes. Missing, delayed,
   ambiguous tray/shell or unobserved transitions mean no automatic candidate.
3. **Bind identity, not a title.** Main owns an opaque target token, invocation
   generation and eventual submitted request ID. The helper privately retains
   native identity evidence (window, owning process lifetime, observation
   generation and selected capture item). No raw handles or candidate titles
   enter renderer authorization payloads. `IsWindow` alone is unsafe: destruction
   and handle reuse can race the check. [W5] PID/creation time also cannot prove
   that the same process has not replaced its window. The spike must demonstrate
   a binding that cannot retarget; otherwise require a new selection and reject
   automatic use. Selection is not a waiver of identity validation.
4. **Invalidate decisively.** Close/replacement, an external focus change after
   binding, unsupported virtual-desktop/session transition, lock, helper restart,
   changed display topology or unresolved geometry invalidates the candidate.
   Companion/chat focus alone does not retarget it. Minimized, unavailable,
   inaccessible or ambiguous targets are denied for the first adapter. New
   requests and retries get fresh validation; never reuse image bytes.
5. **Resolve before pixels.** Present “Choose a window” or explicit “Send text
   only” when unresolved. A cancelled picker yields no image and no automatic
   text submission. Prefer an OS picker only if its returned item can be mapped
   to trustworthy identity for app/title exclusions. That mapping is an open
   spike requirement, not a documented guarantee. Otherwise use an accessible
   metadata-only selector followed by validated target-specific binding. Do not
   build an app thumbnail gallery. Titles, if needed for selection/exclusions,
   are short-lived sensitive data, never logs or persisted history.

Target selection does not grant capture/transmission consent. At submission,
main must independently verify explicit request, current destination-bound
consent, Never/exclusions, target freshness, OS availability and vision support
as required by P3-05. Recheck after asynchronous selection and before capture
and dispatch. A renderer's assertion that these facts are true is never proof.

## Proposed capture and helper boundary

- Only an authorized request can start one bounded acquisition. Never create an
  idle capture session to track focus or warm up frames. No audio, camera,
  periodic capture, automatic recapture or fallback to another target/provider.
- Revalidate the bound item and exclusion metadata immediately before acquisition.
  Bind completion to the same request/generation. A changed title may change an
  exclusion; unknown identity or policy state denies acquisition. Do not claim
  an app can eliminate arbitrary OS races: unresolved native races block release.
- Produce at most one accepted image. WGC may generate frames internally while
  acquisition is active; discard additional callbacks and close the session,
  frame pool and device resources immediately after success, error or cancel.
  Define finite timeout, pixel/byte limits and a single concurrent acquisition
  in the adapter contract before code lands. Late frames after revocation or
  target invalidation are discarded, never dispatched.
- Validate dimensions and content bounds before conversion; never encode unused
  surface pixels. HDR/SDR conversion, resize and device loss need fixture/native
  tests. [W2] Fail instead of returning stale, clipped or wrong-display pixels.
  OS denial/protection/unusable output yields a visible no-image result. Black
  pixels alone cannot prove that content was protected or that capture was safe.
- Use a packaged fixed executable and private parent-child channel. No shell
  command construction, arbitrary executable/path selection, network listener,
  elevation, UIAccess or injected DLL. Treat helper responses as untrusted:
  bounded versioned messages, validated sizes/IDs, single request owner and
  cancellation; kill/reap an unresponsive child and reject late replies.
- Keep encoded images in bounded memory for the selected provider only. No temp
  files, thumbnail cache, clipboard, image-bearing logs, crash attachments or
  persistence. Release owned buffers and native resources on all paths. Do not
  promise forensic erasure of OS/GPU memory. The renderer receives status only;
  any later image-preview feature requires its own reviewed boundary.

For whole-display selection, disclose that other visible windows are included.
Display identity must be explicit, current and revalidated; neither primary
display nor enumeration order is an acceptable default. Exclusion enforcement
must cover every potentially included window. Where that cannot be established
before acquisition (including occlusion/topology races), display capture stays
unavailable and offers window selection. This is a staged capability limit, not
removal of the plan's multi-display requirement.

## Required evidence before integration

These are future acceptance cases, **not tests passed by this documentation**.

| IDs       | Pure/contract tests first                                                                     | Native Windows / physical proof                                                                                                |
| --------- | --------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| T-CAP-006 | Denied/unknown app or title, Never, revoked consent: zero adapter starts                      | Synthetic excluded and protected targets; no usable image escapes; protected/secure desktop behavior needs physical validation |
| T-CAP-007 | Valid invocation → companion/chat focus retains target; missing/tray ambiguity asks selection | Controlled two-window fixture, click/hotkey/tray transitions; delayed hook and reentrant event handling                        |
| T-CAP-008 | Close, reuse, changed generation/process, external focus and stale reply fail closed          | Destroy/recreate windows within the same process; verify binding cannot capture a replacement; picker identity mapping         |
| T-CAP-009 | Changed display/geometry invalidates; no first-monitor fallback                               | Synthetic pixel landmarks plus physical mixed DPI, HDR/SDR, disconnect, virtual desktops and assistant overlap                 |
| T-CAP-010 | Idle, typing, ordinary requests and metadata events: zero capture starts                      | Instrument adapter starts and verify no idle sessions/image allocations or screenshot polling                                  |
| T-CAP-011 | Unsupported, permission denial, timeout, blank/unusable result: explicit no-image state       | Device loss/resize/helper failure and OS denial; no old buffer or broader fallback                                             |
| T-CAP-013 | Cancel/revoke/quit at each await; one completion at most; stale bytes rejected                | Frame-arrival race and helper teardown; verify native resources close and parent exit reaps helper                             |
| T-IPC-001 | Forged target/request, wrong sender, oversized/malformed helper response rejected             | Fixed executable/private channel ownership, no renderer capture permission or open listener                                    |

Use synthetic windows only in CI. Native CI cannot substitute for physical DPI,
protected content or human usability evidence. Actual capture remains blocked
until policy/consent integration and the required privacy review are complete;
G3 also retains classifier evaluation and physical evidence requirements.

## Security, licensing and next slices

This docs-only change adds no data path, permissions, executable, dependency or
asset. A new helper will require a separate original-source and dependency
inventory, pinned SDK/compiler/build inputs, redistributable-license review,
binary provenance, packaging/signing review and native threat review. Existing
npm license results do not clear future native binaries. No Microsoft sample,
third-party capture package or artwork is approved for copying here.

After review: P3-02a pure target lifecycle/resolver with synthetic transitions
and no OS calls; then a bounded Windows helper feasibility spike proving stable
item identity, selection/exclusion mapping, cancellation and memory-only output.
Resolve unknowns before implementing production P3-03 or promoting any gate.

## Implementation note — P3-02a

PR #45 merged the proposal and the maintainer requested continuation on 12 October 2026. Issue #46 implements only the pure lifecycle described above; see
[P3-02a evidence](../evidence/P3-02a.md). A main-owned instance uses opaque IDs,
invocation generations and local frozen ticket identity. Each invocation allows
one bind/submission, and a completion consumes its ticket even on denial. All
invalidating events discard pending work; companion focus alone preserves it.
Retries require a new invocation. This is not native identity proof, production
integration, or final acceptance of the native technology/permissions decision.

## References

[E1]: https://www.electronjs.org/docs/latest/api/desktop-capturer
[W1]: https://learn.microsoft.com/en-us/windows/win32/api/windows.graphics.capture.interop/nf-windows-graphics-capture-interop-igraphicscaptureiteminterop-createforwindow
[W2]: https://learn.microsoft.com/en-us/windows/apps/develop/media-authoring-processing/screen-capture
[W3]: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-getforegroundwindow
[W4]: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwineventhook
[W5]: https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-iswindow
