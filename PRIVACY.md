# Privacy notice — foundation preview

Draft for review, 9 October 2026. This notice describes the P0 foundation shell. It is not a claim that planned chat, authentication or screenshot features already exist. Review and update it before enabling those features.

## What the preview does

The app displays bundled local HTML, JavaScript and CSS. It has no chat entry, provider connection, screenshot function, microphone/camera feature or application-operated backend. It does not request your account credentials or send a question or screen image to an AI provider.

The renderer uses a nonpersistent session, denies permission requests and blocks non-bundle requests, popups, downloads and navigation. The app does not initialize analytics, an updater or a crash-reporting service. Its startup failure diagnostic is a fixed error code without user content.

## Local files and development activity

The application does not implement chat history, image storage or a token store. Electron, Chromium and the operating system may create runtime/profile files or system diagnostics; a nonpersistent renderer session is not a promise that the whole runtime writes no files. The source checkout, dependencies and build output remain on the developer's machine.

Installing dependencies and downloading Electron requires network access to software distribution services. CI runs through GitHub Actions. Those are development activities, separate from provider requests in the app. The automated desktop test uses synthetic inputs and a temporary profile that its cleanup removes. It does not record screenshot, video or trace artifacts.

Bug reports and test evidence are shared only if you choose to send or post them. Public GitHub issues/PRs are visible publicly. Prefer a short redacted excerpt and crop optional images to the non-sensitive preview window.

## Before future features are enabled

Later implementation must provide clear screen-sharing disclosure and consent, identify the selected provider, honor Never include screen and application exclusions, and prevent ambient capture. Images must stay transient in application memory. Provider retention is governed separately by that provider and cannot be represented as “nothing is stored” just because the app does not save an image.

Authentication must use the supported official flow and OS-protected credential storage with disconnect controls. Credentials must stay out of renderer state and diagnostics. Chat-history retention defaults off under the current plan. Any opt-in persistence requires its own reviewed design and clear/delete behavior.

Those are requirements for future phases, not available controls in this preview. The [development plan](DEVELOPMENT_PLAN.md) and [scaffold ADR](docs/adr/0006-scaffold-toolchain.md) define the present boundaries. Until changed and verified, do not enter or test sensitive material or real provider credentials through this project.
