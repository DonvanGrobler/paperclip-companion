# ADR 0012 — Provider contract and deterministic offline mock

Date: 9 October 2026. Status: provisional P2-01 implementation, issue #32.
G1 human evidence remains open; this is independent P2 exploration under plan section 4.

## Contract

AIProvider defines id, asynchronous capabilities/connect/disconnect and an async
iterable of reply strings with AbortSignal. Completion is iterator completion;
failures are ProviderError with one allowlisted code and no user/provider message
or abort reason. No caller-supplied endpoint, command, file path, model, credential
or fallback provider is accepted. Orchestration and IPC wiring remain P2-02/03.

parseChatInput accepts only prompt plus optional screenshot. Prompt must be a
nonblank string of at most 2,000 UTF-16 code units (matching the current UI), and is
trimmed. Screenshot accepts exactly image/png or image/jpeg plus 1..5 MiB of
Uint8Array bytes. The 5 MiB cap is a provisional local memory budget, not a claimed
real provider limit. Unknown fields and malformed inputs are rejected. Require
text capability and reject image input without vision; copy accepted bytes after
size/capability checks so a caller cannot mutate the snapshot.

This validates shape, type and length, **not** image decoding, capture consent,
allowed target, model authorization or provider retention. P3 must separately verify
all transmission conditions and produce valid encoded bytes. No image is sent here.
Capability alone is never sufficient authorization to capture or transmit.

## Mock lifecycle

createMockProvider defaults to text-only, with explicit optional vision capability
and one selected fixed scenario. All seven P0 fixture scenarios have executable
counterparts. Scenario selection is configuration, never inferred from a real prompt.
Responses are fixture text, not AI answers; the vision script does not inspect pixels
and cannot establish screenshot correctness or model-quality accuracy.

connect/disconnect only change local mock state; they do not simulate an authorized
real account or perform I/O. Starting iteration validates the input and occupies one
request slot. Construction alone does no work. Simultaneous requests are rejected
with BUSY. Each yielded chunk and terminal event checks abort/session generation.
Disconnect invalidates in-flight streams and releases the slot; reconnect permits a
new stream while any old iterator can only fail CANCELLED. Token ownership prevents
an old iterator's finally block from releasing a new stream's request slot. Independent
provider instances do not share state.

Consumers must finish iteration or call return (for-await break does so). A paused
consumer owns its iterator until it resumes/returns; no timers, abort listeners or
background tasks run in the mock. P2-02/03 must always dispose of iterators on UI stop,
close, retry or disconnect and perform generation checks before publishing output.

## Security, privacy, licensing and alternatives

Pure TypeScript modules with no Electron, filesystem, network, SDK or shell imports.
No logging, metrics, storage, credential handling, provider fallback or new dependencies.
The mock neither echoes prompts nor retains a request in shared provider state.
Generator lifetimes are owned by the consumer; accepted image copies are transient.
Existing synthetic fixtures are independently authored project assets. No imported
third-party code/art, dependency license or project-license change. Existing audit,
secret scan and 184-package inventory gates continue.

No extra schema package is needed for this small allowlist. The UI's current fixed
preview remains unchanged until main-process streaming/IPC integration is reviewed.
Coverage includes the new core/provider modules, not only src/main. Tests assert
all seven fixture sequences, malformed payload/capability limits, before/mid-stream
cancellation, consumer cleanup, overlapping requests, independent instances and
stale disconnect/reconnect semantics. No real provider or human Windows test is
needed for these contract-only changes; existing Windows regression CI still runs.
