# Paperclip Companion

An independent Windows-first desktop helper for user-initiated chat and single-shot screen context. The project is in early development and is not affiliated with or endorsed by Microsoft or OpenAI.

## Test the current preview

The app is currently on an unmerged review branch. Follow the [Windows 11 G0 walkthrough](docs/test-plan/G0-windows-walkthrough.md) to clone the exact CI-verified commit, run the checks and return the [results form](docs/test-plan/G0-results-template.md). The [G0 checklist](docs/test-plan/G0-status.md) separates your manual evidence from the engineering work still pending.

## Run the foundation preview

Install Node **24.19.0** and npm **11.9.0**, then from the repository directory run:

```sh
npm ci
npm start
```

The app opens a simple desktop window. Chat, the character, tray access, screen capture and provider connections are not implemented yet. No third-party accounts are needed. There is no installer or signed release.

npm start rebuilds the bundled renderer and main process before launching Electron. A desktop session is required. Windows 11 x64 is the intended initial target; interactive Windows validation is still pending. No Windows 10, ARM64 or Linux product support is claimed.

## Verify changes

```sh
npm run check
npm run test:e2e
npm audit --audit-level=high
```

The combined check runs formatting, lint, strict TypeScript, unit tests with coverage and production builds. The separate Electron smoke test needs a desktop session and uses a temporary profile. Builds go to dist/main and dist/renderer. There is no development web server or hot reload yet.

Read [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md) and [AGENTS.md](AGENTS.md) before working. The [scaffold decision](docs/adr/0006-scaffold-toolchain.md), [Windows matrix](docs/test-plan/windows-11.md), [dependency inventory](docs/research/P0-02-dependencies.md) and [verification record](docs/evidence/P0-02.md) explain the current foundation. G0 remains open.

The shell loads bundled content with a sandboxed renderer and a validated, close-only window bridge. Screen capture, account authorization and application network access will require their own reviewed implementation in later phases.

## Reuse and licensing

See the [upstream inventory](docs/research/P0-01-reuse-inventory.md) and [provisional clean-scaffold decision](docs/adr/0001-desktop-runtime.md). No Microsoft Clippy art or restricted DevKit source is included. The application license is pending P0-03; the private UNLICENSED package marker prevents accidental publication and does not change dependency licenses.

## Project guidance

- [Contributing](CONTRIBUTING.md) — scope, checks and review workflow.
- [Privacy notice draft](PRIVACY.md) — current behavior and future requirements.
- [License register](docs/licensing/register.md) and [MIT proposal](docs/licensing/project-license-proposal.md) — review status and third-party boundaries.
- [ADR template](docs/adr/template.md) — record technical, privacy and license decisions.

## P1-01 exploratory companion preview

This branch adds an original teal character in a compact transparent overlay. Drag its handle or body, select **Say hello** for a local greeting, and use the close button or Alt+F4 to quit. Taskbar access remains available. Chat, tray controls and saved placement are later tasks. See the [Windows overlay checklist](docs/test-plan/P1-01-windows.md) and [art provenance](docs/licensing/P1-01-character.md). The earlier G0 walkthrough refers to the separately pinned foundation version.

### Companion tray preview (P1-02)

Use the Paperclip Companion notification icon to **Show**, **Hide**, **Recover**
(back onto the primary display), or **Quit**. Close and Alt+F4 hide to the tray;
Quit exits the application. If tray setup fails, closing the window exits normally.
Windows may put the icon under its hidden-icons arrow. Chat and Preferences menu
items are explicitly disabled until their planned implementation. See the
[Windows tray checklist](docs/test-plan/P1-02-windows.md). The character remains
placeholder artwork, not the final nostalgic design.
