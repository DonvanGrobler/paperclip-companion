# P1-04 Windows persistence and display checklist

Use one Paperclip instance; close previous test launches and their tray icons first.
Record the candidate SHA, Windows build, displays and scaling. Report unavailable
hardware checks as not performed.

```powershell
git fetch origin
git switch --track origin/feat/p1-04-preferences
git rev-parse HEAD
npm ci
npm run check
npm run test:e2e -- --repeat-each=3
npm start
```

If the local branch exists, switch to it and `git pull --ff-only`.

1. Move the character. In tray Preferences turn Always on top off. Quit and relaunch.
   Position and topmost setting must return, chat must not open, and startup must not
   steal typing focus from Notepad. Toggle topmost on and confirm it works again.
2. Hide the character, Quit from the tray and relaunch. Character must stay hidden;
   Show character must bring it back. Quit while visible and relaunch; it must stay
   visible. Close/Alt+F4 should still hide while the tray is available.
3. Preferences → Reset shell preferences returns to primary-display placement,
   visible and always on top. Relaunch and confirm. Recover character repositions
   without changing the topmost preference.
4. Move character and chat onto a secondary display, including one left of the
   primary if available. Unplug that display. Both must be reachable on a remaining
   screen without a hidden character becoming visible. Repeat after saving a
   secondary-display position and quitting, then restart with that display absent.
5. Change scaling (for example 100%, 150%, 200%), resolution, primary display and
   taskbar position. Check both windows, drag targets, menu, keyboard focus and chat
   controls remain reachable. Test chat minimized during a display change, then restore.
6. With chat visible, minimized, and preparing a reply in separate launches, physically
   click tray Quit. All windows and that tray icon must disappear; npm start returns.
   This supplies the remaining #28 physical-menu check if it passes.
7. Optional file recovery check with the app closed: back up only shell-preferences.json
   in `%APPDATA%/paperclip-companion`, replace its contents with invalid JSON and
   relaunch. Defaults must be usable. Delete the test file or restore your backup
   after closing. Never post unrelated profile files or personal paths.

Report each item pass/fail/not performed plus SHA. The app still provides fixed local
preview replies; no provider login, screenshot or sensitive input is needed. Tests
in CI invoke actual menu callbacks and simulate display notifications; they do not
replace this physical-display and notification-area check. G1 is not closed by CI.
