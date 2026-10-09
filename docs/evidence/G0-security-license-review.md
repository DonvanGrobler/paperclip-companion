# G0 security and licensing review

Date: 9 October 2026. Reviewer: development assistant, explicitly delegated by Donvan Grobler in this session. Issue #18. Reviewed main commit `c8b53a78bfb41c06f53241b4d518f487432b2418` after PR #13 merged. This is a scoped engineering/provenance review of the foundation, not approval of a future provider, capture feature or installer.

## Security findings

No high/critical application security finding was identified in the reviewed scaffold. Inspection covered all application source, resource-policy denial tests, Electron wiring tests, the native smoke test, dependency/secret workflows and fixture provenance.

| Boundary                | Evidence / finding                                                                                                                                                                                                       |
| ----------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Renderer privileges     | Sandbox and contextIsolation explicitly enabled; Node, worker Node and webviews disabled. No preload, IPC bridge, credential access or shell interface exists.                                                           |
| Resource loading        | Only normalized custom-origin index.html and single-level JS/CSS assets map to bundled files. Other hosts, credentials, query/fragment, methods and extensions fail closed. No URL becomes an arbitrary filesystem path. |
| Network and permissions | Session filter denies non-bundle requests; CSP denies connections, frames, images, fonts and forms. Permission checks/requests, display media, downloads, navigation, webviews and popups are denied.                    |
| Sensitive data          | No provider, capture, input history or authentication implementation. Startup errors use a fixed code. Nonpersistent renderer session; no claim that Electron/OS housekeeping writes nothing.                            |
| CI                      | Read-only permissions, commit-pinned Actions, checksum-verified Gitleaks CLI, full-history redacted scan and synthetic detection self-test. No pull_request_target or developer secrets.                                 |
| Main branch enforcement | **Blocking process finding:** GitHub reports protected=false, enforcement_level=off, empty check contexts and no rulesets. Jobs run, but GitHub does not require their success before merging.                           |

`npm run check` passed 59 unit tests, format/lint/types/builds and 184 inventory records. `npm audit --audit-level=high` reported zero vulnerabilities. Gitleaks scanned 24 fetched commits with no findings. These results are bounded checks, not proof of absence of all vulnerabilities.

Final main CI passed: [Scaffold 37935514295](https://github.com/DonvanGrobler/paperclip-companion/actions/runs/37935514295), [Quality gates 37935514234](https://github.com/DonvanGrobler/paperclip-companion/actions/runs/37935514234). Existing [manual Windows](G0-windows-11-e353a45.md) and [Windows automated rerun](G0-windows-11-8935e46.md) remain applicable because runtime source and lockfile match the tested candidates.

## Licensing and provenance findings

Reviewed all 184 lockfile declarations and distribution roles. The installed Linux authoring graph has 161 package directories, of which 152 have root license/notice files whose paths and SHA-256 are recorded in [notice evidence](../licensing/G0-installed-notices.json). Nine have no standalone root notice: @electron-internal/extract-zip, @humanfs/types, the two Linux rolldown bindings, esrecurse, imurmurhash, natural-compare, std-env and tinyrainbow. Several identify license/author in README or source headers; none are considered fully cleared for redistribution solely from metadata. Optional uninstalled platform binaries were not inspected locally.

The current renderer bundles React, React DOM and scheduler. Their installed MIT license texts are preserved in [THIRD_PARTY_NOTICES.md](../../THIRD_PARTY_NOTICES.md). This is the concrete notice gap addressed by this review. Electron/Chromium and build-tool binary notices remain P6 artifact-level work, before any installer distribution. Development-only MPL tooling is not relabeled MIT; assess its own source/notice obligations if it is redistributed. References: [MIT text](https://opensource.org/license/mit), [Mozilla MPL FAQ](https://www.mozilla.org/en-US/MPL/2.0/FAQ/).

The authored source, schematic fixtures and pixel glyphs have repository provenance. No Microsoft Clippy imagery, OpenAI DevKit code, upstream character art or third-party font was imported. Prior-art source evidence stays outside the shipped application. Gitleaks CLI and optional Pillow authoring tooling have separate recorded licenses and are not bundled in the app.

Disposition: **foundation development provenance review completed**, with no identified prohibited reuse in the current application. This does not clear a Windows binary redistribution or establish copyright non-infringement of future artwork. Project MIT adoption remains a separate maintainer decision; root metadata remains private/UNLICENSED, accurately reflecting no grant adopted yet. The plan schedules final project license/notices for P6, so this is not misrepresented as an already MIT-licensed release.

## Gate disposition and next action

G0 is an actual tracked gate in **issue #18**, and remains **blocked only on required-check enforcement under the recorded G0 checklist**. The delegated security/provenance review and main-candidate test review are complete. Maintainer repository settings must require `scaffold-ubuntu-latest`, `scaffold-windows-latest`, `dependency-and-license-scan` and `secret-scan` on main. Follow [setup instructions](../test-plan/P0-04-quality-gates.md), then verify failed required checks prevent merging. The connector cannot write repository administration settings. No requirement was removed just to close the gate.

P1-01 can proceed as exploratory development under DEVELOPMENT_PLAN section 4, while G0 remains open; no phase-baseline promotion is claimed. New overlay code/art gets its own review and Windows checklist.

## Resolution — 9 October 2026, after branch protection was saved

The maintainer enabled branch protection. A fresh GitHub branch response reports `protected: true`, `enforcement_level: everyone`, and exactly the four required GitHub Actions contexts. Existing Dependabot PR #16 has failed required checks and GitHub reports `mergeable_state: blocked`, despite a conflict-free merge (`mergeable: true`). No failing code was merged or bypass attempted. See the [recorded API evidence](G0-branch-enforcement.json). The detailed administration endpoint remains inaccessible (403), so unexposed flags are not claimed verified.

This resolves the earlier process finding. **G0 passed** at foundation baseline `c8b53a78bfb41c06f53241b4d518f487432b2418`; issue #18 is closed. Existing main CI, delegated review and Windows evidence remain unchanged. Root license adoption and actual binary-distribution notices remain pre-release work. This documentation-only update requires formatting/link validation, not repeated Windows usability testing.
