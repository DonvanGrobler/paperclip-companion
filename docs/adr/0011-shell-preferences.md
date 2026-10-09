# ADR 0011 — Local shell preferences and display recovery

Date: 9 October 2026. Status: provisional for maintainer review, P1-04 issue #30.

## Decision

The main process owns a version-1 settings document containing only position x/y,
visibility and always-on-top. Initial defaults are primary-display placement,
visible, always on top. Native tray Preferences offers a checkbox and Reset;
there is no new renderer IPC. Reset shows the character in its initial position.
Close still hides, chat close still destroys its exchange, and Quit exits all windows.

Store `shell-preferences.json` under app.getPath('userData'). Read at most 4097
bytes, reject documents over 4096, require integer coordinates bounded to ±1,000,000
DIP and booleans, and reconstruct only allowlisted fields. Missing files use defaults;
corrupt data uses defaults with PREFERENCES_READ_FAILED. Unknown versions remain
untouched with PREFERENCES_VERSION_UNSUPPORTED, including when Reset is used.
Version 1 is the first schema; future versions must explicitly migrate supported
predecessors rather than guessing field meanings. P2 can extend this contract.

Changes are debounced 250 ms and flushed on before-quit. Read final bounds before
shutdown; ignore shutdown-induced hide/move events so quitting a visible character
does not save hidden state. A small synchronous write to a process-specific temporary
file followed by same-directory rename avoids overlapping writes and partial JSON.
Write failures keep the session usable and emit only PREFERENCES_WRITE_FAILED.
The previous file survives a failed replacement; pending state can retry on next
change/quit. No continuous disk polling. This is not a power-loss durability promise.

Restore hidden only when tray setup succeeds; otherwise show the character so it
cannot become inaccessible. Startup uses showInactive. The topmost setting is passed
at construction. Native Show/Recover remain explicit focus-taking user actions.

## Displays

Use Electron DIP rectangles directly, without multiplying by display scale factors.
Choose the work area with greatest overlap; with no overlap use the primary display.
Clamp the entire rectangle, shrinking for unusually small work areas. Refit overlay
and open chat on display-added, display-removed and display-metrics-changed, and on
restore. Chat minimum size is lowered when necessary to fit the available area.
Recovery does not show hidden windows or explicitly request focus. Destroyed windows
are ignored and display listeners are removed when a window closes. Chat position
is not persisted, and chat does not reopen automatically.

## Security, privacy and license review

The file path is constructed only in main, never supplied by a renderer. No new
renderer privilege, permission grant, dependency or network path. The schema and
writer have no access to chat content, screenshot bytes, tokens, window titles or
monitor labels. Test prompts are synthetic. The settings file is not secret storage;
OS backup/sync can retain it and a crash can leave a temporary file. PRIVACY.md
states these limits and deletion/reset behavior. Existing sandbox, CSP and denied
network/capture/permission boundaries remain. No third-party code/art imported;
184-package license inventory and project UNLICENSED status are unchanged.

Alternatives: localStorage would mix shell state with the renderer boundary; a new
settings package is unnecessary for three values; fire-and-forget asynchronous
writes at quit could lose the latest state. Multiple independently launched instances
remain possible and share last-writer-wins preferences; single-instance routing is
not silently introduced as a purported fix for #28. Use one instance for manual tests.

## Verification and open review

Unit tests cover input validation, debounce/flush, file errors, unsupported versions,
reset, quit visibility, tray fallback and negative/small/removed display geometry.
Windows E2E covers actual native preference callbacks, restart persistence, invalid
files, both-window recovery events, and existing Quit regressions. Simulated display
events do not establish physical monitor/DPI correctness. Human Windows multi-monitor
checks, startup focus and physical tray-click evidence remain required for G1.

Primary references reviewed: [Electron screen](https://www.electronjs.org/docs/latest/api/screen/),
[BrowserWindow](https://www.electronjs.org/docs/latest/api/browser-window/) and
[app.getPath](https://www.electronjs.org/docs/latest/api/app#appgetpathname).
