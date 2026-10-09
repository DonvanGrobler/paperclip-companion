# Paperclip Companion

An independent Windows-first desktop helper for user-initiated chat and single-shot screen context. The project is in early development and is not affiliated with or endorsed by Microsoft or OpenAI.

## Test the current preview

The preview contains the character, tray, saved shell preferences and offline mock chat. The historical [Windows 11 G0 walkthrough](docs/test-plan/G0-windows-walkthrough.md) pins the foundation candidate. For current changes use the exact commit and checklist linked in the active PR. [G0 is verified](docs/test-plan/G0-status.md); the desktop-shell gate G1 remains open.

## Run the foundation preview

Install Node **24.19.0** and npm **11.9.0**, then from the repository directory run:

```sh
npm ci
npm start
```

The app opens a paperclip-style placeholder character with tray access and a separate local chat preview. Screen capture and real provider connections are not implemented. No third-party accounts are needed. There is no installer or signed release.

npm start rebuilds the bundled renderer and main process before launching Electron. A desktop session is required. Windows 11 x64 is the intended initial target; interactive validation is tracked separately for each feature. No Windows 10, ARM64 or Linux product support is claimed.

## Verify changes

```sh
npm run check
npm run test:e2e
npm audit --audit-level=high
```

The combined check runs formatting, lint, strict TypeScript, unit tests with coverage and production builds. The separate Electron smoke test needs a desktop session and uses a temporary profile. Builds go to dist/main and dist/renderer. There is no development web server or hot reload yet.

Read [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) and [AGENTS.md](AGENTS.md) before working. The [scaffold decision](docs/adr/0006-scaffold-toolchain.md), [Windows matrix](docs/test-plan/windows-11.md), [dependency inventory](docs/research/P0-02-dependencies.md) and [verification record](docs/evidence/P0-02.md) explain the current foundation. G0 is verified; G1 remains open.

The shell loads bundled content with a sandboxed renderer and a validated window-control bridge. Screen capture, account authorization and application network access will require their own reviewed implementation in later phases.

## Reuse and licensing

See the [upstream inventory](docs/research/P0-01-reuse-inventory.md) and [provisional clean-scaffold decision](docs/adr/0001-desktop-runtime.md). No Microsoft Clippy art or restricted DevKit source is included. The application license is pending P0-03; the private UNLICENSED package marker prevents accidental publication and does not change dependency licenses.

## Project guidance

- [Contributing](CONTRIBUTING.md) — scope, checks and review workflow.
- [Privacy notice draft](PRIVACY.md) — current behavior and future requirements.
- [License register](docs/licensing/register.md) and [MIT proposal](docs/licensing/project-license-proposal.md) — review status and third-party boundaries.
- [ADR template](docs/adr/template.md) — record technical, privacy and license decisions.

## P1-01 exploratory companion preview

This branch adds an original teal character in a compact transparent overlay. Drag its handle or body, select **Say hello** for a local greeting, and use the close button or Alt+F4 to hide to the tray. Taskbar access remains available. See the [Windows overlay checklist](docs/test-plan/P1-01-windows.md) and [art provenance](docs/licensing/P1-01-character.md). The earlier G0 walkthrough refers to the separately pinned foundation version.

### Companion tray preview (P1-02)

Use the Paperclip Companion notification icon to **Show**, **Hide**, **Recover**
(back onto the primary display), or **Quit**. Close and Alt+F4 hide to the tray;
Quit exits the application. If tray setup fails, closing the window exits normally.
Windows may put the icon under its hidden-icons arrow. Open chat is available in P1-03; Preferences offers an Always on top checkbox and Reset shell preferences. See the
[Windows tray checklist](docs/test-plan/P1-02-windows.md). The character remains
placeholder artwork, not the final nostalgic design.

### Offline mock chat (P1-03 / P2-02)

Choose **Open chat** on the character or tray. The separate window demonstrates
Send, Stop, Retry, Copy and Clear with a scripted response streamed from the
main-process mock provider. The selected provider is shown explicitly. Preview
scenarios include offline, expired sign-in, rate limit, images unsupported and
provider cancellation. Switch back to **Sample reply** and Retry to recover.
Stop preserves partial text; Retry starts a fresh response. Clear, reload, close
and Quit cancel active work. There is no automatic retry or provider fallback.
Enter sends and Shift+Enter adds a line. No AI or account is connected, no screen
is captured and nothing leaves the computer. Prompt processing is in memory only.
Only the latest exchange is retained while this window is open; closing or Clear
removes it. Copied text remains on the system clipboard and may be retained by
Windows clipboard history. Shell settings are saved separately; chat is not restored at startup.
See [streaming evidence](docs/evidence/P2-02.md) and [IPC design](docs/adr/0013-main-chat-stream.md).
Routine streaming and lifecycle checks run automatically on Windows CI.

### Saved shell preferences and display recovery (P1-04)

Position, hidden/visible state and **Always on top** survive restart. A hidden
character remains available from the tray. **Preferences → Reset shell preferences**
returns it to the primary display, visible and always on top. **Recover character**
repositions it without resetting the topmost preference. Saved positions and open
windows are fitted to connected work areas after monitor or DPI changes, without
opening a hidden character or focusing another window.

Only these shell settings are written to `shell-preferences.json` in Electron's
application user-data directory (normally `%APPDATA%/paperclip-companion` on Windows).
A temporary file is used during replacement. Chat content is never saved. If settings
are corrupt, safe defaults apply; unsupported versions are preserved and changes
remain session-only. Close the app and remove this file to start with defaults.
See [privacy](PRIVACY.md), [ADR 0011](docs/adr/0011-shell-preferences.md) and the
[Windows persistence/display checklist](docs/test-plan/P1-04-windows.md).
