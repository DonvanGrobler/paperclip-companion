# ADR 0021: Synthetic helper process lifecycle

Date: 12 October 2026. Issue #54, P3-03c. Provisional, unwired transport for
maintainer privacy review. Production capture and renderer integration stay off.

## Decision and boundary

Add a main-side supervisor around ADR 0020's bounded decoder. The supervisor
accepts a trusted launch capability, not an executable, shell command or renderer
argument. Only tests provide that capability in this slice: the current absolute
Node executable and a fixed repository-owned synthetic script, private stdio
pipes, no shell/detachment, and only SystemRoot on Windows in its environment.
No inherited NODE_OPTIONS, prompt, credential, HWND or image argument is supplied.
The fixture creates no descendants, captures nothing and writes no files.

Each explicit run validates the caller's opaque request/target/generation and
creates a fresh UUID session ID. Only those four fields are serialized to stdin
and stdin is ended. Responses arrive on that child's stdout through the existing
bounded decoder. Any stderr, child/stream error, nonzero/signalled exit, invalid
response or cancellation prevents image delivery. Diagnostic contents are never
logged or returned. No timers or child process exist while idle.

One child may be active per supervisor. A complete response is insufficient for
success: require stdout end and child close with zero exit and no signal. Abort
or dispose clears decoder storage and terminates the child. Dispose also forbids
future runs. Deadline defaults to five seconds, with a one-second close grace;
configuration is bounded to 1..30000 and 1..5000 milliseconds respectively.

A termination signal is not proof of exit. Wait for close before unlocking the
supervisor. If grace expires first, resolve a fixed no-image failure but retain
ownership/listeners and reject new work until close is observed. Later output is
discarded and cannot turn failure into success. After an observed exit, do not
send another kill signal. Remove listeners/timers after closure. No retry or
fallback is automatic. Successful pixel ownership transfers to the caller once.

## API evidence and limitations

The [official Node child-process documentation](https://nodejs.org/api/child_process.html),
reviewed 12 October 2026, distinguishes exit from close: close follows process
termination and stdio closure. It also cautions that signalling does not prove
termination and does not necessarily kill descendants. The implementation uses
those established events; behavior is verified against the repository's pinned
Node 24 runtime in Linux/Windows CI. No Node 26-only API is used.

These tests prove observed synthetic child closure, not an OS process sandbox.
No arbitrary launch input, listening socket or independently connecting peer is
introduced, but a compromised parent or helper is not authenticated by echoed
IDs. A future packaged launcher must fix executable provenance/environment and
ensure no descendants. Parent crash/forced termination and process-tree cleanup
need separate Windows Job Object or equivalent evidence before production use.
This slice handles orderly dispose, not death of the parent process itself.
If kill fails, no OS-level erasure or eventual reap is claimed; ownership remains
blocked and no new pixels are accepted. A stalled parent event loop can delay
JavaScript deadlines. Consent and native target validation are still independent
requirements before any capture/transmission side effect.

## Verification, security and license review

Controlled event tests cover busy/no-idle behavior, EOF versus close, fresh IDs,
stale/late output, all stream errors, spawn/write failures, cancellation, disposal,
crash/signal, missing EOF, truncation, timer bounds and unsuccessful/unconfirmed
kill. Actual fixed child tests exercise pipes, fragmented success, retry after
close, malformed/stale/extra output, stderr, crash, no-image, timeout and
post-output cancellation/disposal. Tests require observed close and clean up
fixture children even if an assertion fails. T-IPC-001 and partial
T-CAP-008/010/011/013 only; no real native screenshot or physical Windows claim.

Original TypeScript/fixture source uses existing Node built-ins. No package,
license inventory, native compiler/link input, third-party sample or asset change.
No production import, network or new data-retention path. Native redistribution
review from ADR 0018 remains open. Main-owned launch authority must never cross
the renderer boundary. G1 physical evidence, G2 promotion, G3 and OD-02 stay open.

Next after merge/main verification: transport the native probe's synthetic pixels
through this boundary. External-window capture remains a separate target-identity,
consent/exclusion and image-conversion integration task.
