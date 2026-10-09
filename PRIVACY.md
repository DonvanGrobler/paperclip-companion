# Privacy notice — local desktop preview

Draft for review, 9 October 2026. This notice describes the P1 character, tray, local chat preview and shell preferences. Authentication and screen capture are not implemented.

## What the preview does

The app displays bundled local HTML, JavaScript and CSS. The chat entry stays in renderer memory and receives a fixed local sample reply. There is no provider connection, screenshot function, microphone/camera feature or application-operated backend. It does not request your account credentials or send a question or screen image to an AI provider.

The renderer uses a nonpersistent session, denies permission requests and blocks non-bundle requests, popups, downloads and navigation. The app does not initialize analytics, an updater or a crash-reporting service. Its startup failure diagnostic is a fixed error code without user content.

Closing chat or Clear discards its current exchange. Copy writes the sample reply to
the operating-system clipboard on request; OS clipboard history or synchronization
may retain it independently. Clear does not erase clipboard data.

## Local files and development activity

The application stores only a version number, character x/y coordinates in
device-independent pixels, visible/hidden state and always-on-top preference in
`shell-preferences.json` under its Electron user-data directory. No display labels,
window titles, prompts, replies, images, provider selections or credentials are
included. This file is plain text, not a credential store. A same-directory temporary
file is used during replacement; a crash may leave one containing the same settings.
User-configured OS backups may include these files.

Tray Preferences provides Reset shell preferences. With the app closed, deleting
`shell-preferences.json` and any matching `.tmp` file also resets these preferences.
Unsupported file versions are not overwritten, even by Reset; session controls still
work. Read/write failures report fixed codes without paths or contents.

The application does not implement chat history, image storage or a token store. Electron, Chromium and the operating system may create runtime/profile files or system diagnostics; a nonpersistent renderer session is not a promise that the whole runtime writes no files. The source checkout, dependencies and build output remain on the developer's machine.

Installing dependencies and downloading Electron requires network access to software distribution services. CI runs through GitHub Actions. Those are development activities, separate from provider requests in the app. The automated desktop test uses synthetic inputs and a temporary profile that its cleanup removes. It does not record screenshot, video or trace artifacts.

Bug reports and test evidence are shared only if you choose to send or post them. Public GitHub issues/PRs are visible publicly. Prefer a short redacted excerpt and crop optional images to the non-sensitive preview window.

## Before future features are enabled

Later implementation must provide clear screen-sharing disclosure and consent, identify the selected provider, honor Never include screen and application exclusions, and prevent ambient capture. Images must stay transient in application memory. Provider retention is governed separately by that provider and cannot be represented as “nothing is stored” just because the app does not save an image.

Authentication must use the supported official flow and OS-protected credential storage with disconnect controls. Credentials must stay out of renderer state and diagnostics. Chat-history retention defaults off under the current plan. Any opt-in persistence requires its own reviewed design and clear/delete behavior.

Those are requirements for future phases, not available controls in this preview. The [development plan](DEVELOPMENT_PLAN.md) and [scaffold ADR](docs/adr/0006-scaffold-toolchain.md) define the present boundaries. Until changed and verified, do not enter or test sensitive material or real provider credentials through this project.
