# P1-01 Windows 11 overlay checks

Run against the exact P1-01 commit shown in its PR, not the G0 candidate. This change modifies window behavior, so the earlier G0 manual result does not establish these new outcomes. No provider accounts or real screenshots are needed.

1. Run `npm.cmd ci`, `npm.cmd run check`, `npm.cmd run test:e2e -- --repeat-each=3` and `npm.cmd start`. Expected automated result is six passing tests (two tests, each repeated three times).
2. Keep another ordinary app active while launch completes. Confirm the companion appears near the lower-right work area without moving keyboard focus away from the active app. It should remain above ordinary windows without hiding the taskbar.
3. Confirm the background around the original teal character is transparent, the handle/bubble text is readable, and no large foundation window is shown.
4. Drag the top handle and the character body to several positions. Confirm they move the native window. Click **Say hello** and confirm it greets then returns to idle; clicking that button must not drag the window.
5. Use Tab/Shift+Tab to reach both controls; confirm a visible focus ring, Enter/Space greeting and close operation. In Windows reduced-motion settings, confirm the character no longer floats or rotates.
6. Check 100%, 150% and 200% scaling, relaunching after changes. Check taskbar minimize/restore and native Alt+F4. Clicking the close button must also exit and return the terminal prompt.
7. Report pass/fail/not tested, Windows build, scaling, tested commit and any observed focus/drag/rendering issue. An app-only screenshot is optional.

Limits: no tray, chat, saved placement, live multi-monitor recovery or click-through behavior is promised yet. Transparent margins may receive mouse input as part of the small rectangular native window. P1-02 adds tray recovery; P1-04 adds persistent positioning and display-change handling. G1 is not complete until those tasks and their regression checks pass.
