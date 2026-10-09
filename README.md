# Paperclip Companion

An independent Windows-first desktop helper for user-initiated chat and single-shot screen context. The project is in early development and is not affiliated with or endorsed by Microsoft or OpenAI.

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

The shell loads bundled content with a sandboxed renderer and no privileged bridge. Screen capture, account authorization and application network access will require their own reviewed implementation in later phases.

## Reuse and licensing

See the [upstream inventory](docs/research/P0-01-reuse-inventory.md) and [provisional clean-scaffold decision](docs/adr/0001-desktop-runtime.md). No Microsoft Clippy art or restricted DevKit source is included. The application license is pending P0-03; the private UNLICENSED package marker prevents accidental publication and does not change dependency licenses.
