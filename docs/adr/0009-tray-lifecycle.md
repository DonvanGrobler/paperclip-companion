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
P1-03/P1-04 implement them. The optional global shortcut is deferred. Tray operations themselves need no renderer bridge. The close button uses the
fixed companionWindow.close action through a sandboxed preload. Main accepts
no arguments and checks the owning webContents, exact main-frame identity and
exact bundled document URL before calling BrowserWindow.close. Destroying the
webContents removes its handler. No raw IPC or Electron object reaches React. No new dependency, permission, capture,
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

## Native-close correction

Windows CI at b1e2465 and ad5d7da found renderer window.close destroyed the window
instead of taking the cancellable native path. Moving setup earlier did not solve
it. Electron's WebContents::CloseContents implementation emits its own close event
and then destroys the webContents. Therefore the renderer close control must use
the narrow bridge above. Native Alt+F4 still uses the ordinary close handler.
The E2E test now asserts the actual native close event was prevented, the window
is retained and hidden, activation reopens it and quit exits while hidden.

Source inspected: [Electron CloseContents](https://github.com/electron/electron/blob/main/shell/browser/api/electron_api_web_contents.cc).
This revises the initial no-IPC implementation choice; it grants only control over
the application's own close action, with wrong-sender/frame/URL/payload tests.
