# ADR 0008 — Original placeholder and minimal overlay

Date: 9 October 2026. Status: P1-01 exploratory implementation, pending real Windows desktop review. Issue #20. G0 #18 remains open for branch enforcement.

## Decision and scope

Replace the large foundation window with a 280 x 340 device-independent-pixel frameless transparent overlay. Place it inside the primary display work area; retain taskbar presence and native Alt+F4 until tray recovery arrives in P1-02. Use always-on-top for ordinary desktop windows, not a screen-saver/fullscreen escalation. `showInactive()` displays the companion without explicitly taking focus. Disable resizing/maximizing/fullscreen and native shadows; the renderer draws its own small panel surfaces.

Native CSS drag regions cover the top handle and character stage. Buttons opt out of dragging. No drag IPC, global mouse tracking, click-through hook, screen capture or OS automation is introduced. Close invokes the ordinary window close path. Greeting is local React state with a cleaned-up timeout; reduced-motion preference stops both animations. No messages are sent.

The SVG geometry is original code authored for this project: a teal rounded wire, a cream inset face panel and an amber check badge. It uses no imported image, sprite sheet, custom font, Microsoft character proportions/reference tracing, logo or copied animation. The placeholder's source is src/renderer/main.tsx and styles.css, with provenance in docs/licensing/P1-01-character.md. No trademark clearance or final-art approval is implied.

## Security and behavior review

The custom-origin resource policy, restrictive CSP, session filters, permission denials, navigation/popups/webviews blocks and sandbox settings are unchanged. SVG is inline declarative geometry, not a fetched image or script. No preload/IPC bridge or new dependencies are added. No capture/provider/history/credentials exist. The local close control does not allow arbitrary OS actions.

A transparent native window may retain rectangular hit-testing outside its painted pixels. Automatic click-through is intentionally deferred because it requires careful interaction/recovery design. Native drag, focus behavior, taskbar restore, transparency, DPI and close must be checked on Windows 11. Initial bounds are clamped, but live display removal and saved-position recovery belong to P1-04; no G1 promotion follows from this issue alone.

## Alternatives and validation

Using copied Clippy sprites was rejected by the plan. A new renderer-to-main bridge solely for drag/close is unnecessary. A tray-only frameless window would risk losing access before P1-02, so taskbar access remains.

Tests cover normal, negative-origin and small-display initial bounds; actual Electron options and security wiring; native visibility and topmost/resizable state; greeting transition, reduced motion, drag/no-drag CSS and close-button process exit. See docs/test-plan/P1-01-windows.md for manual steps.

Primary references checked: [Electron custom window styles](https://www.electronjs.org/docs/latest/tutorial/custom-window-styles), [custom window interactions](https://www.electronjs.org/docs/latest/tutorial/custom-window-interactions), and [security guidance](https://www.electronjs.org/docs/latest/tutorial/security/).
