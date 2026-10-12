# ADR 0019: Synthetic single-frame native feasibility

Date: 12 October 2026. Issue #50, P3-03a. Status: provisional experiment,
subject to maintainer review; no production capture or OD-02 approval.

## Context and decision

ADR 0018 proved native item construction and closure, without acquiring pixels.
Extend that same explicit self-test with an original red/blue Win32 fixture.
Only this process-owned fixture can be bound; no external handle, file, target
selection, source enumeration, renderer IPC or provider transport is introduced.

Use D3D11 WARP explicitly for reproducible synthetic CI, not as a production
backend decision. A free-threaded WGC pool holds one BGRA buffer. Poll for one
frame, close the session, validate dimensions/format and copy to a CPU-readable
staging texture. Reject changed content size, unexpected format or dimensions
over 1024 per axis (at most 4 MiB per pixel texture, not a total driver-memory cap).
Check only two interior color landmarks, then unmap and release all resources.
Keep the OS capture border and disable cursor pixels. No image encoding/output.

Polling for the frame and nonblocking readback share a five-second deadline.
This bounds polling, not native calls or driver hangs; the CI job timeout remains
the outer bound. WGC can internally produce frames while the session is active;
only one returned frame is accepted per successful request.

## Cleanup and verification

RAII independently attempts session, frame and pool Close even if another close
throws. Tests assert matching creation/close counters and no cleanup errors.
Surface/texture references die before the returned frame closes. Unmap occurs
before landmark assertions can throw. This proves attempted and successful API
cleanup on tested paths, not forensic GPU-memory erasure.

Each process checks success, cancellation before start (zero starts), cancellation
immediately after start (zero accepted frames), forced expired deadline (zero
accepted frames), rejection of an acquired frame, then fresh success. Closed
items cannot start capture. Run three processes, retain item lifetime assertions
and reject missing/unsupported CLI arguments before any native work.

These are bounded contributions to capture/cleanup acceptance tests, not full
T-CAP coverage. Forced deadline expiry does not simulate a hung driver; immediate
post-start cancellation does not prove arbitrary asynchronous cancellation races.
No resize, protected content, HDR, physical DPI/multi-monitor, external HWND reuse,
exclusion-policy mapping, consent or real-provider behavior is verified.

## API and license review

Official Microsoft documentation reviewed on 12 October 2026:

- [Screen capture](https://learn.microsoft.com/en-us/windows/apps/develop/media-authoring-processing/screen-capture): support detection, BGRA frame pools, polling, ContentSize and frame/surface lifetime. HDR needs a separate format/tone-handling decision.
- [CreateFreeThreaded](https://learn.microsoft.com/en-us/uwp/api/windows.graphics.capture.direct3d11captureframepool.createfreethreaded?view=winrt-26100): removes the DispatcherQueue dependency.
- [D3D11CreateDevice](https://learn.microsoft.com/en-us/windows/win32/api/d3d11/nf-d3d11-d3d11createdevice): explicit WARP device creation.
- [DXGI interop](https://learn.microsoft.com/en-us/windows/win32/api/windows.graphics.directx.direct3d11.interop/nf-windows-graphics-directx-direct3d11-interop-createdirect3d11devicefromdxgidevice): wrap the native device for WinRT.

Original source; no copied sample, third-party capture library, artwork, npm
package or downloaded tool. Existing exact SDK 10.0.26100.0 and MSVC 14.51.36231
pins remain. Added link inputs are Windows SDK d3d11.lib and gdi32.lib; inspect
actual imports in Windows CI. SDK/toolchain/runtime distribution obligations from
ADR 0018 remain. Test compilation is not blanket MIT or binary-release clearance.

## Consequences and next step

Production capture stays disabled. No pixels leave process memory through app
code, logs or artifacts. G1 physical evidence, G2 promotion and G3 remain open.
After this probe is merged and main verified, investigate the smallest bounded
helper/target transport contract; external target identity and policy validation
must precede enabling any real-window acquisition.
