# P1-02 Windows tray checklist

Issue #22. Record the tested commit, Windows build and display scaling with results.
Use the PR branch feat/p1-02-tray. G0 and prior P1-01 results remain historical;
these changed lifecycle checks require new Windows validation.

```powershell
git fetch origin
git switch --track origin/feat/p1-02-tray
npm ci
npm run check
npm run test:e2e -- --repeat-each=3
npm start
```

If the branch already exists, switch to it and fast-forward with git pull --ff-only.

- Launch: one character and one Paperclip Companion notification icon (check the
  Windows hidden-icons arrow). Startup does not unexpectedly take typing focus.
- Right-click icon: Show, Hide, Recover, Quit are available. Open chat and
  Preferences are disabled and labeled as forthcoming.
- Hide removes the character; Show and left-click restore the same window and
  let its buttons work. Repeat several times; no duplicate windows or icons.
- Close button and Alt+F4 hide; tray Show restores. Quit exits when visible and
  when hidden, removing the icon. Relaunch for each Quit scenario.
- Move the character, then Recover: it returns fully inside the primary display.
  Try after changing display scaling or disconnecting a secondary display.
- Use Win+B and keyboard navigation to reach the tray and its menu; confirm that
  Show/Recover/Quit are reachable. Check icon visibility on light and dark taskbars.
- Restart Windows Explorer while the app is open: check tray reappearance and
  Show/Hide/Quit. Report any lost-icon behavior rather than treating it as passed.
- Offline/idle: no provider, capture or network activity introduced.

Automated Electron tests exercise real close/hide, application activation recovery
and quit. They do not click Windows notification-area menus. Unit tests invoke the
actual menu callbacks with mocked Electron objects, including tray-failure fallback.
Do not report these as manual Explorer/keyboard validation. G1 remains open pending
chat, persistence/display recovery, accessibility and Windows evidence.
