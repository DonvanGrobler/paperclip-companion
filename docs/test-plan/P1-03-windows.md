# P1-03 Windows chat checklist

Test the exact commit named in the P1-03 PR and report it with your Windows version
and scaling. Earlier overlay/tray passes do not cover this new chat window.

```powershell
git fetch origin
git switch --track origin/fix/quit-closes-chat
npm ci
npm run check
npm run test:e2e -- --repeat-each=3
npm start
```

If the branch already exists, switch to it and use git pull --ff-only.

- Launch leaves the character visible without opening chat or taking typing focus.
  Open chat using the character button and separately the tray menu. Repeated Open
  chat focuses the same window, including after minimizing it.
- The screen clearly says local preview, no AI connection and no screen capture.
  Empty/whitespace messages cannot send. Enter submits, Shift+Enter adds a line.
  If using an IME, confirming composition must not submit prematurely.
- Tab/Shift+Tab reaches every enabled control with a visible focus indicator.
  Use the keyboard to Send, Stop, Retry, select the scenario, Copy and Clear.
  With Narrator if available, check input labels and status/error announcements.
  Report untested accessibility checks explicitly.
- Sample reply appears after the preparation state. Stop prevents completion.
  Retry works after Stop and after Simulated error (select Sample reply first).
  Clear during preparation leaves no delayed reply and focuses the empty composer.
- Copy response pastes only the sample text into Notepad. Clear removes the
  conversation, but copied text remains on the OS clipboard as expected.
- Long text wraps and the conversation scrolls. Try resizing and your usual DPI
  scaling; labels, message field and controls remain reachable.
- Close chat using its button, native X and Alt+F4. Reopen it with an empty session.
  Character/tray remain usable. Quit from the tray exits with chat open as well.
- Offline and idle behavior stays local. No screen capture, sign-in or network
  permission prompt is expected. Do not enter sensitive data for these checks.

Automated Windows tests use synthetic text and inspect native window behavior,
keyboard submission, state changes, plain-text copying and renderer isolation.
They do not establish human screen-reader usability or real-provider success.
G1 stays open pending remaining P1 work and human evidence.

## Focused Quit follow-up (#28)

The maintainer reports all other checklist items passed; Quit left chat open.
The exact tested SHA was not restated. Do not repeat the whole checklist yet.

1. Close all prior Paperclip test instances (including hidden tray icons). If one
   is stuck, use Task Manager only for the Electron process started by this project;
   do not end unrelated Electron applications.
2. Check out the follow-up candidate above, run `npm ci`, and record `git rev-parse HEAD`.
   Launch once using `npm start` from one terminal.
3. Open chat from that instance's tray, hide the character, then select **Quit**
   from the same tray. Chat and tray must disappear and the terminal must return.
4. Relaunch and repeat with chat minimized; then repeat during sample preparation.
5. If it fails, report the SHA, which of these states failed, whether the tray icon
   disappeared and whether `npm start` returned. No prompt text or private data
   is needed. Multiple running instances are a hypothesis, not a confirmed cause.

The automated test invokes the installed tray menu callback in the main process;
it does not automate a physical click in the Windows notification area.
