# ADR 0010 — Accessible local chat shell

Date: 9 October 2026. Status: provisional implementation for P1-03, issue #26.

## Scope and interaction

Open chat from the character or native tray creates one separate, normally framed
window on the primary display. Repeated activation restores/focuses that window.
It is not created on startup and is not always-on-top. Closing destroys its renderer
and in-memory exchange; the overlay/tray keep running. A failed load destroys the
partial chat window and emits only CHAT_LOAD_FAILED so another open can retry.

The UI explicitly identifies a local preview and uses a fixed sample response,
independent of the message. An explicit scenario selector demonstrates either a
reply or simulated error after a cancellable timer. This is P1 interaction preview,
not the P2 provider adapter or an AI answer. Stop, retry and clear use monotonically
increasing request IDs to discard stale completion. Timers are cleaned up. Input
is bounded to 2,000 characters, whitespace-only sends are disabled, and only the
latest exchange is retained in renderer memory. React renders text without HTML
or Markdown interpretation. Closing or Clear removes the displayed exchange.

Labels, visible keyboard focus, Enter/Shift+Enter (without intercepting IME
composition), status/error announcements, focused composer and keyboard-scrollable
conversation support basic accessibility. Native frame controls remain available.
Screen-reader, scaling and full keyboard usability still need human Windows checks.

## IPC and security review

Both windows reuse the same sandboxed web preferences and navigation/popup/webview
denials, shared nonpersistent restricted session, permission denials and CSP. The
resource policy adds one exact /chat.html route serving the same bundled index.html;
React selects the chat screen using that pathname. Query/hash/foreign URLs remain
rejected. No arbitrary resource routing or network destination is added.

The preload exposes three fixed functions, never ipcRenderer or event objects:

- close sends no arguments, accepted only from the owning window's main frame at
  its exact expected bundled URL, and calls native close.
- openChat sends no arguments, accepted only from the overlay's main frame at its
  exact bundled URL; it cannot specify a URL, path or window options.
- copyText invokes a single main handler, accepted only from the current chat's
  owning main frame and exact URL with exactly one nonempty string <=12,000 chars.
  It writes plain text only, catches clipboard failures and returns a boolean.

Copy is an explicit button action. Clipboard reading is never exposed. The OS
clipboard (and any user-enabled OS clipboard history/sync) is outside the app's
chat retention controls; Clear does not clear copied text. A compromised chat
renderer could invoke bounded clipboard writes, but cannot read it or access other
OS operations. This is the minimum new privileged capability needed for Copy.
IPC handlers are removed when their owning window/webContents are destroyed.

Prompts and replies remain in renderer memory, except explicitly copied reply text.
No logging, file storage, provider request, screenshot, credential, telemetry,
new dependency or external artwork is introduced. Existing asset provenance and
UNLICENSED status remain unchanged. No new third-party license review is needed;
the locked 184-package inventory gate is retained. No binary release clearance
or final mascot approval is implied.

## Alternatives and limits

Expanding the overlay would couple chat focus/resize behavior to the verified tray
character lifecycle. A separate framed window keeps standard OS controls. Real
provider streaming belongs to P2, so this step uses visibly labelled UI simulation.
Persisted history, automatic display removal recovery and Preferences remain later
work. P1-04/G1 and P2/G2 are not completed by this task.

References checked: [Electron IPC](https://www.electronjs.org/docs/latest/tutorial/ipc)
and [main-process clipboard](https://www.electronjs.org/docs/latest/api/clipboard).
