# P0-04 quality gates and repository setup

## Local reproduction

Use the pinned Node/npm versions and run `npm ci`, `npm run check`, `npm audit --audit-level=high` and, on Windows, `npm run test:e2e -- --repeat-each=3`. The 42 unit cases include 11 inventory-gate cases. Coverage thresholds apply to the two application main-process modules, not a claim of full UI or script coverage.

`npm run check:licenses` checks all 184 locked package entries against the inventory. On a deliberate upgrade, inspect the changed packages and their license text/provenance, update the inventory with version, license, dev/optional and integrity fields, and describe the review in the PR. Missing/unknown declarations need a review decision and deliberate policy change. Do not weaken the gate or regenerate the baseline automatically to pass an upgrade.

Secret scanning uses the official Gitleaks CLI 8.30.1. The Linux x64 download URL and checksum are in `.github/workflows/quality.yml`. On a machine with that verified CLI and full clone, run `gitleaks git . --log-opts="--all" --no-banner --redact=100`. The workflow first checks detection on a synthetic key marker. No real credentials are needed and no scan findings artifacts are uploaded.

## Required check configuration

The following names should be required by the main branch ruleset once the workflows have run:

| Check                         | Coverage                                                                      |
| ----------------------------- | ----------------------------------------------------------------------------- |
| `scaffold-ubuntu-latest`      | Format, lint, strict types, unit coverage, builds and license inventory       |
| `scaffold-windows-latest`     | Same checks plus three independent Electron smoke launches                    |
| `dependency-and-license-scan` | Locked dependency audit, high/critical findings fail; metadata inventory gate |
| `secret-scan`                 | Full fetched Git history, pinned Gitleaks and detection self-check            |

A maintainer with repository administration access must configure an active main branch ruleset requiring pull requests and these status checks, restrict bypass/force pushes, and verify that an intentionally failing required check prevents merging. The current connector has no repository administration access, so enforcement is **not configured or verified by this task**. Record a ruleset link or redacted settings evidence and the blocked-merge result before marking this G0 row complete. Avoid creating a deliberately broken commit on main.

Review and enable Dependabot alerts/security updates and GitHub secret scanning/push protection where available under repository security settings. Their state is not inferred from the committed workflows. `.github/dependabot.yml` configures weekly npm and GitHub Actions update proposals after it reaches the default branch; it does not enable auto-merge. The separate pinned CLI download is updated deliberately with version, release digest and provenance together.

## Limits and final candidate

These jobs use contents-read permissions and run on PRs, including the stacked development branches. Native Windows CI uses the hosted runner, not the maintainer's Windows 11 desktop. The human Windows report remains attached to e353a45, while the corrected E2E needs its own Windows 11 result.

The inventory is declared package metadata, not final asset/runtime clearance. Original-code license adoption and Electron/Chromium notices remain review items. P0-05 will add fixture validation; P2 will add actual provider contracts. No empty contract job is claimed passed. Full G0 closure requires final-candidate checks, reviews, branch enforcement evidence and the remaining fixture work.
