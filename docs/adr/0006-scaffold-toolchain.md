# ADR 0006 — Minimal scaffold and closed shell boundary

Date: 9 October 2026. Status: Provisional implementation, pending maintainer security/dependency review.
Issue: [P0-02 / #3](https://github.com/DonvanGrobler/paperclip-companion/issues/3).

## Context and choice

P0-01 recommends an independently authored Electron scaffold. The maintainer requested continuation with P0-02. That authorizes implementation; it does not manufacture a licensing review or merge approval for PR #2. This change is stacked on that PR.

Choose npm with a committed lockfile, Node 24.19.0 and npm 11.9.0. Exact direct package versions are in package.json. Electron 44.7.0, Vite 8.3.4 and React 19.3.0 were resolved from the registry at implementation time. TypeScript 6.0.3 is the installed compatible version selected with the lint stack, rather than forcing the registry's newer TypeScript 7 line beyond the parser's peer range. A clean npm ci is the reproduction path, not npm update.

Use two small Vite build configurations, compiling the main process to CommonJS and React into bundled renderer assets. This avoids a scaffold generator importing unnecessary features and avoids introducing a development web server before its network policy is designed. npm start rebuilds, then launches Electron. There is no hot reload yet. Forge/installer tooling and signing remain later decisions under OD-05.

## Trust boundary

The main process serves a dedicated paperclip://app origin from a fixed renderer output directory. A small resource policy accepts only GET requests for index.html or one-level JS/CSS asset names. It cannot map a request to arbitrary filesystem paths. The handler returns fixed errors, correct MIME types, no-store and a restrictive CSP.

The renderer runs with sandboxing and context isolation explicitly enabled and Node/webview access disabled. There is no preload or IPC bridge because this shell needs no privileged operations. New windows, navigation, downloads, permissions and display-media requests are denied. A nonpersistent session blocks all non-bundle requests. CSP also denies connections, forms, frames and remote/inline code. No user content, provider calls, screenshot APIs, telemetry or application data retention are implemented.

This policy deliberately blocks capabilities that later phases may need. Any later opening of IPC, permissions or network access must be scoped, tested and reviewed in the relevant ADR. OS/Electron housekeeping is not a guarantee of zero files or background traffic from the runtime itself. The guarantees here concern our application behavior and renderer boundary.

## Alternatives and consequences

A Vite development server would make iteration faster but adds an HTTP/WebSocket origin and development-only CSP. It is deferred. A broad file:// loader is simpler but has a wider local-resource boundary. A ready-made desktop template is convenient but would add dependencies and defaults that need their own audit. An empty preload is unnecessary and can be introduced with the first narrow contract in P2.

Windows 11 x64 is the intended initial manual target. Windows CI smoke tests validate automated behavior on the hosted runner, not a Windows 11 human session. Linux build/unit checks provide additional feedback and do not establish Linux product support. ARM64 and Windows 10 are not claimed supported.

The scaffold includes the local checks and a small CI workflow needed to verify this issue. This is partial groundwork for P0-04, not completion of its dependency automation, secret scanning or full protected-branch gates. The app manifest remains private and UNLICENSED until the maintainer establishes the project license in P0-03; dependencies retain their own licenses.

## Primary references checked

- [Electron security guidance](https://www.electronjs.org/docs/latest/tutorial/security)
- [Electron protocol API](https://www.electronjs.org/docs/latest/api/protocol)
- [Electron session API](https://www.electronjs.org/docs/latest/api/session)
- [Electron release timeline](https://www.electronjs.org/docs/latest/tutorial/electron-timelines)
- [Vite getting started](https://vite.dev/guide/)
- [Playwright Electron API](https://playwright.dev/docs/api/class-electron)

Installed package manifests and the lockfile provide exact dependency evidence. No upstream companion-project code or art was copied.
