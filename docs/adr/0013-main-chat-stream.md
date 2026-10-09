# ADR 0013 — Main-owned mock streaming and bounded chat IPC

Date: 9 October 2026. Status: provisional implementation for issue #34 (P2-02,
with necessary P2-03 IPC integration). Maintainer review remains required.
G1 physical display evidence remains open; this is exploration under plan section 4.

## Decision and alternatives

The renderer displays the selected **Offline mock · Text only** provider and sends
only a positive, monotonically increasing run number, a nonblank prompt of at most
2,000 UTF-16 code units, and one of six fixed scenario names. The main process maps
those names to existing mock fixtures and owns connect, iteration, abort and
disconnect. Image-success fixtures remain contract tests only. The unsupported-image
scenario is a scripted error; it neither accepts an image nor captures a screen.
No provider selection other than the mock is available or persisted yet.

Three invoke operations are exposed by named preload functions: chatStart,
chatNext and chatCancel. There is no generic channel, event object, callback,
endpoint, model, path, account, provider instance or OS API exposed. Each handler
requires the exact current chat window, its main frame, the exact bundled chat URL
and exactly one argument. Main validates all payload fields; unknown fields,
images, unsafe/replayed run numbers and overlapping starts are rejected. The overlay
has the same minimal preload bundle but is denied all three chat operations.

Pull-based streaming allows one outstanding next operation and one active request,
so the main process does not buffer unbounded push events for an unresponsive
renderer. Each pull has one 500 ms abortable mock delay to make streaming/Stop
observable; this is fixture pacing, not an AI latency claim. There is no idle timer
or automatic retry. Responses are nonempty strings with a 12,000-character total
limit matching the clipboard budget. Main returns only chunk, complete, or fixed
error-code records. Provider exception messages and abort reasons are never returned
or logged. All provider error classes have fixed user-facing recovery text.

The alternative of keeping the P1 renderer timer would not exercise provider
orchestration. A generic send/on bridge or renderer-owned adapter would broaden the
trust boundary unnecessarily. Push subscriptions would need additional buffering,
unsubscription and stale-event control without benefit for this small local mock.

## Cancellation, lifecycle and retention

Stop and Clear invalidate the UI generation and cancel its main request. Retry
clears any partial response and starts one fresh request only after explicit user
action. Old chunks/completions cannot overwrite another run. Cleanup aborts pacing,
returns the iterator and disconnects the mock, including when stopped between
chunks. Pending asynchronous work checks request identity before returning data.
Native destruction, renderer failure, document reload and application before-quit
also reset the session. IPC handlers and app listeners are removed on destruction.
Reload resets run numbering; object identity prevents an old request from publishing
into a new document that reuses its numeric run. Sender checks are repeated after
awaiting a chunk. React renders replies as text, with no HTML or markdown execution.

Prompt text now crosses into transient main-process memory. Latest prompt/reply
remain visible in renderer memory only until replacement/Clear/close. No chat history,
provider choice, prompt, response, image or credential is written to disk. Clipboard
retention is still controlled by the OS. Existing versioned shell preferences remain
unchanged. OD-03 remains provisionally resolved by the plan's default-off history;
adding opt-in persistence requires a separate reviewed design.

## Review and limits

T-IPC-001 tests wrong window, subframe, URL, destroyed window, extra arguments,
malformed payloads, extra/image/endpoint fields and oversized inputs. Controller
regressions cover busy/replay, overlapping pulls, stop/reset during asynchronous
work, iterator cleanup, cumulative output budget, all error codes and raw-error
redaction. Native Electron tests cover partial text, Stop/Retry/Clear, every scripted
failure, reload/close/reopen, isolation, and existing tray Quit while preparing.

Direct source review found no capture, network, account, logging or persistence path
added by this change. Only bundled mock code is reachable. No new dependency, copied
upstream code, artwork or licensing change; the existing 184-package inventory and
security scans remain required. Provider SDKs, real transport cancellation/timeouts,
authentication and image transmission must be reviewed in their later phases. This
mock-only controller is not evidence of real-provider safety or human Windows UX.

References: Electron [IPC](https://www.electronjs.org/docs/latest/tutorial/ipc),
[security](https://www.electronjs.org/docs/latest/tutorial/security/) and
[ipcRenderer](https://www.electronjs.org/docs/latest/api/ipc-renderer) guidance,
reviewed 9 October 2026; ADR 0012 for the adapter contract.
