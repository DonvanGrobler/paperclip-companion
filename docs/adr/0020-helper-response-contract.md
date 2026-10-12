# ADR 0020: Bounded synthetic helper response contract

Date: 12 October 2026. Issue #52, P3-03b. Provisional contract for maintainer
privacy review. No production capture, child process or app IPC is enabled.

## Context and decision

ADR 0019 established native one-frame readback from a process-owned fixture.
Before moving bytes across a process boundary, define and test the receiving
boundary independently. A pure TypeScript decoder accepts synthetic chunks for
one request. It is not imported by Electron main, preload or renderer. No new
package, copied implementation, toolchain input or runtime permission is added.

A response has a four-byte unsigned little-endian header length, 1..1024 bytes of
strict UTF-8 JSON metadata, then exactly the declared binary payload. Unknown or
missing fields fail. Version 1 includes `sessionId`, `generation`, `requestId`,
`targetId`, `status` and `byteLength`. Identifiers must match a validated snapshot
of trusted caller context. IDs are opaque ASCII tokens of 1..128 characters;
generation is a positive safe integer. IDs must never be window titles or secrets.
Matching identifiers proves correlation only, not channel authentication, policy,
consent or native target identity.

| Status     | Additional metadata                                       | Payload                                         |
| ---------- | --------------------------------------------------------- | ----------------------------------------------- |
| `frame`    | `format: bgra8`, integer `width` and `height` in 1..1024  | Exactly width × height × 4 tightly packed bytes |
| `no-image` | `code`: cancelled, unavailable, timeout or invalid-target | Zero bytes                                      |

The experimental 1024 limit is carried forward from the native fixture and is
not an MVP display-resolution limit. A later reviewed adapter must copy only
valid ContentSize rows, excluding native row padding, and handle resolution,
HDR/SDR and encoding explicitly. No PNG/JPEG, base64, path, HWND, arbitrary error
text or network destination is supported by this wire contract.

## Resource ownership and terminal behavior

Copy incoming chunks into owned buffers. Allocate at most four prefix bytes,
1024 metadata bytes and 4 MiB of pixel storage per decoder, excluding caller-owned
input, bounded JSON/string allocations and the JavaScript runtime itself.
Reject excessive aggregate bytes before copying. Validate the header before
allocating pixels. Work per push is proportional to input; there is no repeated
concatenation of the growing payload. Empty chunks do not advance the decoder.

Only `finish()` at clean end-of-stream can return one complete response. A
truncated stream, trailing byte, duplicate response, cancellation or malformed
header poisons the entire response and rejects further input. Invalid replies
return null/false without logging their contents or exposing parser exceptions.
On rejection/cancel, owned metadata and pixel buffers are overwritten and
references released. Successful pixel ownership transfers once to the caller,
which must release/clear it after use. Cancellation after transfer cannot erase
caller-owned output. This is not forensic erasure of VM, OS or GPU copies.

A future parent-child supervisor must own one active request, bind a decoder to
the launched child lifetime, use fresh session/request IDs, enforce a deadline
and maximum concurrency, cancel on policy/target invalidation or child failure,
require a successful child exit before consuming output, and kill/reap a stuck
child. This pure decoder implements none of those process/liveness guarantees.
Every capture/transmission side effect still needs independent current consent,
exclusion, target and provider checks. No stream is trusted just because it parses.

## Verification and alternatives

Synthetic tests cover every two-chunk split, byte-by-byte input, each truncation
and cancellation offset, exact size limits, stale/cross-session IDs, malformed
UTF-8/JSON, strict shapes, no-image codes, trailing/duplicate responses and owned
buffer mutation. These address T-IPC-001 and parts of T-CAP-008/011/013 only.
They do not prove authenticated pipes, native identity, driver failure recovery
or physical Windows behavior.

An unbounded JSON/base64 image reply would increase allocation and parsing risk.
A fixed binary header could reduce parsing but would prematurely fix identifier
encodings before the helper interface is proven. This small bounded JSON header
keeps synthetic contract tests explicit without adding a serialization package.
The protocol is provisional and not advertised as a stable public API.

## Security/license review and next task

Direct review: no logging, filesystem, spawning, network, provider calls, renderer
entry point or actual capture path. Original TypeScript uses existing language
built-ins; package inventory and native dependencies remain unchanged. Native
binary redistribution and SDK/runtime obligations from ADR 0018 remain open.
G1 physical evidence, G2 promotion, G3 and OD-02 external identity remain open.
After merge/main verification, test a fixed synthetic parent-child channel,
including timeout, crash, cancellation, exit/reap and late-response rejection,
before connecting any native frame transport or real target acquisition.
