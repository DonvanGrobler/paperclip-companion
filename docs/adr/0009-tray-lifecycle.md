# ADR 0009 — Tray lifecycle and explicit recovery

Date: 9 October 2026. Status: provisional implementation for P1-02, issue #22.

The native main-process tray offers Show character, Hide character, Recover character
and Quit. Click and application activation restore/focus the existing window.
Startup still uses showInactive; only explicit activation takes focus. Recover
resets bounds to the current primary display work area. Automatic display-change
handling and saved positions remain P1-04.

Close and Alt+F4 hide while a tray has been successfully constructed and configured.
Before app quit, a flag permits ordinary window closure; will-quit destroys the
retained icon. If tray construction/menu setup throws, destroy any partial tray,
report only TRAY_UNAVAILABLE, show the window and retain ordinary close-to-exit.
Taskbar presence remains as an additional recovery route. Electron cannot confirm
that Windows is actually displaying the notification icon; Explorer restart and
notification overflow therefore require manual checks.

Open chat and Preferences are disabled and explicitly marked as forthcoming until
P1-03/P1-04 implement them. The optional global shortcut is deferred. No renderer
bridge is needed for tray operations. No new dependency, permission, capture,
provider, persistence, network access or credential data path is introduced.
Existing sandbox, CSP and all denial handlers remain in force.

The 16px monochrome wire glyph in src/main/tray.ts was independently authored as
pixel geometry for this task. It contains no imported artwork or traced character.
BGRA gray pixels avoid byte-order color ambiguity and become a native image without
file I/O. It is a provisional utility icon, not approved final mascot art. The
project's existing UNLICENSED status is unchanged; distribution clearance remains
separate. Higher-DPI/icon polish remains subject to Windows review and P5.

Alternative: quit on every close would defeat normal tray operation. Hiding before
tray setup succeeds could strand the application, so listeners are installed last.
Full chat/preferences windows here would prematurely expand this small issue.

Primary references checked: [Tray](https://www.electronjs.org/docs/latest/api/tray)
and [nativeImage](https://www.electronjs.org/docs/latest/api/native-image).
