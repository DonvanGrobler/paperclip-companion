# ADR 0024: Bounded memory-only PNG conversion

Date: 21 October 2026. Issue #73 / P3-03e. Provisional component for maintainer
privacy review; no production capture or transmission authorization.

## Context and decision

The helper's validated BGRA response is not a provider image payload. Implement
an independent, unwired main-owned encoder using existing Node zlib compression
and CRC32. No dependency, copied codec/sample source or native build input is
added. Electron nativeImage's raw bitmap format is platform-dependent; keep the
input channel/alpha contract explicit and verify the PNG with Electron's decoder.

Accept exactly status/format/width/height/bytes, bgra8, dimensions 1..1024 and
width × height × four bytes. Require a non-shared Uint8Array view; respect its
offset and reject extra/missing fields, invalid types/sizes or property-read
errors. Input remains caller-owned. Copy to private scanlines before asynchronous
compression; subsequent caller mutation cannot change the image being encoded.

The trusted adapter must explicitly declare straight or premultiplied alpha.
bgra8 alone does not prove this. Reject unknown modes or premultiplied samples
whose color exceeds alpha. Convert BGRA to straight RGBA, unpremultiply with
rounding when required and zero invisible RGB at alpha zero. This does not
establish arbitrary WGC alpha semantics, HDR tone mapping or color calibration.
The native fixture integration uses an explicit synthetic-only interpretation;
a production adapter must establish and version its alpha/color contract first.

Produce a new PNG with eight-bit RGBA, top-to-bottom rows and filter zero, using
only signature, IHDR, one IDAT and IEND. CRCs cover chunk type/data. Do not copy
EXIF/text/time/DPI, paths, prompts, target IDs, titles or source metadata. Use
asynchronous deflate at level one, cap compressed output at 4 MiB + 64 KiB and
total PNG at that cap + 57 bytes. The cap also accommodates uncompressible
maximum-size input; it is not a hard total-heap/native-library memory limit.

## Ownership, deadlines and denial

One encoder per trusted main capture owner, one active conversion, no queue.
Unknown/invalid input starts no compressor. Default deadline is five seconds;
trusted construction accepts 1..30000 ms. Abort/dispose/deadline settles a fixed
no-image result and rejects late output. This cannot preempt native zlib work:
retain the busy lock and private input until the completion callback. If that
callback never arrives, the owner stays unavailable with bounded retained input.
Do not clear an input that a native worker may still read or start overlapping
work. A hard execution cutoff would require a separately supervised process.

On callback, clear owned scanlines and compressed output on success/error/late
completion. A successful PNG is a separate buffer transferred once to the
caller, who must clear it after use or revocation. Caller also clears original
BGRA. Duplicate completion cannot settle again or release another operation's
lock. Throws, malformed compressor output and native errors expose fixed codes
only; no raw error values or bytes. The compressor seam is trusted test/main
code, never a renderer capability. Conversion grants no authority: future main
orchestration must recheck the request, target, consent, exclusions, destination
and vision support after every await before dispatch.

No forensic erasure guarantee is made for zlib, allocator, OS or Electron/GPU
copies. Cooperative deadlines bound output acceptance, not CPU preemption or
synchronous scanline preparation; dimensions bound preparation work. Release
performance and physical Windows evidence remain separate.

## OD-02 investigation and independent progress

Current documented WGC item properties do not expose a reverse HWND/PID getter.
A picker title is not a unique identity or trustworthy app-exclusion mapping.
SetProp was investigated as a window-lifetime marker, but Microsoft's contract
requires removing added entries before WM_NCDESTROY and subjects writes to UIPI.
The current design cannot guarantee that cleanup when a foreign app closes
independently. Delayed hooks/PID checks do not supply that missing proof. Do not
add foreign window properties, inject a DLL, elevate or waive exclusions to
force progress. This is a limit of the investigated approaches, not a claim
that every possible Windows design is impossible.

External target identity/selection remains blocked. This component is independent
P3-03 work allowed by development-plan section 4, not baseline promotion or a
replacement of the automatic-context product requirement. OD-02 needs a supported
identity/exclusion mechanism or an explicit maintainer-reviewed design revision
before real-window capture. Do not continue repeating owned-window probes as
though they resolve that foreign-window question.

## API, security and licensing review

Primary references checked 21 October 2026; no example code copied:

- [Node 24.19.0 zlib](https://nodejs.org/download/release/v24.19.0/docs/api/zlib.html): asynchronous convenience compression, output limit and CRC32. APIs/types are also checked against the installed pinned runtime and @types/node 24.19.2; no runtime upgrade is made.
- [PNG specification](https://www.w3.org/TR/png-3/): critical chunk layout, CRC, byte order, RGBA and non-premultiplied alpha. Independent original implementation, not copied sample CRC/codec code.
- [Electron nativeImage](https://www.electronjs.org/docs/latest/api/native-image): createFromBuffer PNG decoding, dimensions and toBitmap; raw bitmap format depends on platform. Decoder verification runs on the required Windows job.
- [GraphicsCaptureItem](https://learn.microsoft.com/en-us/uwp/api/windows.graphics.capture.graphicscaptureitem?view=winrt-26100): reviewed target contract; no reverse HWND/PID property documented.
- [SetPropW](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setpropw): cleanup timing and UIPI restrictions. No such call is added.

Only existing Node/Electron/zlib components are used. The npm lockfile/license
inventory and native link/compiler/SDK inputs remain unchanged; existing binary
notices and ADR 0018's unresolved native redistribution review still apply. No
new file/image output, telemetry, network, permission, external target, renderer
IPC or provider request. Synthetic test bytes/bitmaps are cleared, assertions
use booleans/metadata, and Playwright traces/screenshots/video remain disabled.

## Verification and next step

Unit tests independently parse/inflate PNGs, check chunk CRCs/absence of ancillary
metadata, full colors/row order/alpha, maximum input, strict input denial, copies,
abort/deadline/dispose, duplicate/late callbacks, exceptions and cleanup. Required
Windows native tests convert three actual fixture frames in memory and verify
landmarks. An Electron E2E test decodes a generated fixture PNG and verifies its
bitmap; existing shell regressions run unchanged. No human/private target or
provider test is inferred.

G1 physical evidence, G2 promotion, G3 and OD-02 remain open; classifier recall
remains 86.7%. Next independent slice: main-owned destination-bound consent
lifecycle with mocks, while external identity/selection remains a separate
production blocker. Any revised capture UX needs its own reviewed decision.
