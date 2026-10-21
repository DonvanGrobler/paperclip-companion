# ADR 0022: Native synthetic pixel transport

Date: 21 October 2026. Issue #69, P3-03d. Provisional experiment for maintainer
privacy review. No external-window capture or production helper integration.

## Boundary and decision

Extend the existing original Windows probe with explicit `--transport-self-test`.
Only a fixed test launcher uses that option. Require stdin/stdout pipe handles
and binary CRT mode, read at most 1024 bytes until EOF, then parse context with
the existing Windows SDK JsonObject API. No third-party JSON library is added.
Exactly four resulting properties are accepted: sessionId, generation, requestId
and targetId. IDs are 1..128 ASCII letters/digits/underscore/hyphen; generation
is a positive integer no greater than JavaScript's safe-integer maximum. Wrong
shape/type, unknown fields and oversized/malformed input fail before creating a
window or capture session. JsonObject uses last-key semantics for duplicate JSON
names; this is a bounded value contract, not canonical JSON. Trusted parent
JSON.stringify emits unique names. Echoed IDs prove correlation, not identity,
consent, sender authentication or permission to choose an external target.

After validation, create only the same process-owned red/blue fixture. Acquire
one BGRA frame through the existing WARP path, bounded to 1024 per axis / 4 MiB.
Copy exactly ContentSize width × four bytes from each mapped RowPitch row.
No surface padding is included. An RAII Unmap guard protects all exits, including
allocation/assertion exceptions. A noncopyable owned pixel buffer overwrites
its contents on destruction. Session/frame/pool close counters must balance;
close the fixture and observe its item closure before emitting any response.
The fixture is explicitly shown with SetWindowPos/SWP_SHOWWINDOW without
activation; a hidden-console parent launch may supply an initial hidden show
state. IsWindowVisible must pass before binding, followed by paint/DwmFlush.

Write one little-endian header length, validated JSON response header and tightly
packed pixels on stdout's owned pipe. There is no PASS text in binary mode.
Errors use existing fixed stage/HRESULT diagnostics on stderr. Partial writes or
native failure exit unsuccessfully; the supervisor rejects all bytes. Preserve
ordinary --self-test, its triple process run, unsupported CLI assertions, OS
capture border and exact compiler/SDK pins. No binary/image artifact upload.

## Parent tests and output ownership

An explicit Windows-only Vitest suite launches the fixed executable/option with
private pipes, no shell/detachment and only SystemRoot in its child environment.
It uses ADR 0021's supervisor and ADR 0020's decoder. Success requires EOF plus
zero-exit close. Three sequential actual frames must have valid dimensions,
exact lengths and red/blue interior landmarks; successful bytes are cleared in
finally blocks. Assertions evaluate booleans/statuses only, never frame objects,
so assertion failures do not dump pixels. Raw rejection tests count output bytes
without retaining or printing payloads. Malformed requests and unsupported CLI
must yield no stdout. Abort after first output and a deliberately stalled stdin
must return the expected no-image code and observe child closure. Fixture
children are cleaned up even if a test fails.

The required Windows job builds the probe then runs this suite. Missing binary,
unsupported capture, native failure or timeout fails the job; no Windows skip.
The ordinary Linux unit job does not run this explicit platform suite. Native
C++ compilation/coverage is not represented by TypeScript unit coverage.

## Primary API review

Microsoft documentation reviewed 21 October 2026; no sample source copied:

- [Mapped subresource](https://learn.microsoft.com/en-us/windows/win32/api/d3d11/ns-d3d11-d3d11_mapped_subresource): RowPitch advances physical rows; copying the entire surface can include padding.
- [_setmode](https://learn.microsoft.com/en-us/cpp/c-runtime-library/reference/setmode?view=msvc-170): binary mode suppresses text translation; configure it before I/O.
- [JsonObject](https://learn.microsoft.com/en-us/uwp/api/windows.data.json.jsonobject?view=winrt-26100): SDK JSON object and duplicate-name semantics.
- [ShowWindow](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-showwindow) and [SetWindowPos](https://learn.microsoft.com/en-us/windows/win32/api/winuser/nf-winuser-setwindowpos): inherited startup show state and explicit fixture visibility without activation.
- [GetFileType](https://learn.microsoft.com/en-us/windows/win32/api/fileapi/nf-fileapi-getfiletype): PIPE distinguishes pipe/socket handles from consoles/disks. The type alone does not establish private-peer ownership.

## Security, licensing and limitations

Original source plus existing Windows SDK projections/CRT/Node/Vitest only. No
new npm package, link library, tool download, permission, network, provider,
renderer IPC, source enumeration, arbitrary target/path or persisted image.
Actual SDK/CRT imports remain subject to CI inspection. ADR 0018's native
redistribution/build obligations remain open; this is not binary release clearance.

A private stdout protocol carries pixels intentionally; diagnostic logs and
artifacts do not. Clearing owned native/parent buffers does not erase CRT, OS
pipe, allocator, driver or GPU copies. Forced termination cannot run C++
destructors; OS memory reclamation is not claimed as erasure. Blocking native calls and pipe writes are
subject to parent deadline/kill and the CI timeout. The stalled-stdin test proves
request-reader termination, not driver-hang recovery. Cancellation after output
does not test every GPU/frame-arrival race. Parent death/process-tree containment,
protected content, HDR/DPI, real target identity and policy/consent checks remain
unverified. This is bounded T-IPC-001 / partial T-CAP evidence, not G3 closure.

Next after merge and verified main: target binding/selection feasibility, then
reviewed conversion and consent/exclusion/transmission integration. G1 physical
evidence, G2 promotion, G3 and OD-02 remain open.
