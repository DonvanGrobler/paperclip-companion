# P0-02 Windows visibility follow-up

Issue [#7](https://github.com/DonvanGrobler/paperclip-companion/issues/7), 9 October 2026. Status: In review.

The [maintainer's Windows 11 report](G0-windows-11-e353a45.md) verifies manual behavior at e353a45 but reports a failed automated native visibility assertion. The shell deliberately starts hidden and shows on `ready-to-show`; a rendered DOM alone does not synchronize that native event. This is the working explanation, not a claim to have reproduced the race locally.

The smoke test now obtains the BrowserWindow for its actual Playwright page and polls `isVisible()` for at most 10 seconds before probing security boundaries. It never calls `show()` or relaxes the final `visible: true` assertion after blocked navigation. A permanently hidden window still fails. [Playwright polling assertions](https://playwright.dev/docs/test-assertions#expectpoll) support bounded retries of non-DOM state.

Windows CI runs three independent launches using `npm run test:e2e -- --repeat-each=3`; these are repetitions, not automatic retries of failures. All three must pass.

## Verification

- Baseline `npm run check`: exit 0, 31 tests, 100% coverage of both main-process modules, renderer and main builds passed.
- Changed tree `npm run check`: exit 0, same 31 tests and coverage, format/lint/types/builds passed.
- Local native Electron E2E: not run; this environment has no X server or Windows desktop.
- Windows CI: exact-head run linked from the focused PR; only a completed green run establishes automated evidence.
- Windows 11 E2E rerun: pending the maintainer's result on the corrected commit.
- Application source and dependency lockfile unchanged. No new capture, network, IPC, permissions, assets or license decisions.

Manual tests do not need repeating for this test-only fix. G0 stays open until its remaining engineering, review and final candidate requirements are met. Next smallest issue: P0-04 quality gates.
