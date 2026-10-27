# Security-audit repair — 27 October 2026

Issue [#88](https://github.com/DonvanGrobler/paperclip-companion/issues/88).
Status: **In review**, repair candidate only. Continuous maintenance before
P4-02b; [ADR 0030](../adr/0030-security-patch-baseline.md) records the decision.

## Confirmed predecessor and baseline failure

PR [#84](https://github.com/DonvanGrobler/paperclip-companion/pull/84) merged into
`main` on 27 October at `15d0b5ae474ec57648a087840a7492342f28090a`. Its tree
`8239cfa67d320064fe39b05b1e2097af9a1dbd2f` equals reviewed head
`c6c2757b6ed73145663be51705880c4e7cfae23a` exactly, with the expected parents.
Final-head review 5616722291 remains COMMENTED with no code findings; comments,
empty threads and absence of change requests were rechecked. Maintainer merge
of that provisional offline component does not resolve OD-04 or actual auth gates.

Actual main push runs
[Scaffold 40480224509](https://github.com/DonvanGrobler/paperclip-companion/actions/runs/40480224509)
and [Quality 40480224400](https://github.com/DonvanGrobler/paperclip-companion/actions/runs/40480224400)
**failed** at `npm audit --audit-level=high`. Main check/unit/build stages passed;
Windows native/transport/Electron steps were **skipped after audit**, not passed.
Secret job 122108376833 passed. Inspected dependency job 122108376926 identifies
the exact findings below; Windows job 122108376640 and Ubuntu 122108377070 also
failed audit. Prior 22 October candidate green results stay dated evidence.

Clean local checkout from current main reproduced `npm audit --json` **exit 1**
with two aggregate high-severity vulnerable packages. Local baseline
`npm run check` passed **1137 units / 30 files** and all stages. This is a
security-advisory baseline failure; no auth-source regression was identified.
#83 remains open and P4-02b waits for genuinely verified repaired main.

## Vendor evidence and bounded repair

Primary sources fetched/read on 27 October:

| Package / finding                                        | Reviewed source / patched floor                                                                                                    |
| -------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| Electron compromised intermediate certificate mitigation | [GHSA-jr5w-w6x2-84p9](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9), patched 44.x floor **44.9.1** |
| Undici EventSource retained-memory denial of service     | [GHSA-4qv8-2p9j-2685](https://github.com/nodejs/undici/security/advisories/GHSA-4qv8-2p9j-2685), patched 7.x floor **7.30.1**      |
| Undici mixed-case integrity algorithm bypass             | [GHSA-f72v-6w45-q472](https://github.com/nodejs/undici/security/advisories/GHSA-f72v-6w45-q472), patched 7.x floor **7.30.1**      |
| Undici excessive encoding-chain unhandled error          | [GHSA-xjj6-f33q-929c](https://github.com/nodejs/undici/security/advisories/GHSA-xjj6-f33q-929c), patched 7.x floor **7.30.1**      |

Reviewed release notes:
[Electron 44.9.3](https://github.com/electron/electron/releases/tag/v44.9.3)
contains upstream security backports;
[Undici 7.30.1](https://github.com/nodejs/undici/releases/tag/v7.30.1)
contains the relevant security fixes. Registry version/license/engine/integrity
metadata and installed artifacts were checked. The available stable 44.x patch
keeps the current major runtime. This is point-in-time advisory evidence, not a
claim that an audit enumerates every embedded Electron/Chromium vulnerability.

Exact package changes:

- Electron **44.7.0 → 44.9.3**, exact direct development pin.
- Undici **7.30.0 → 7.30.1**, optional development dependency of unchanged
  `@electron/get@5.1.0`, within its existing `^7.24.4` range.

Lockfile inspection confirms exactly those two changed non-root package records,
no added/removed paths, and unchanged dependency ranges, engines, license,
dev/optional flags and all other direct pins. There is no new runtime provider
transport; the installed downloader library is distinct from Electron's embedded
network stack. Node 24.19.0 / npm 11.9.0 remain pinned.

Closed, unmerged Dependabot PRs #85–#87 propose separate Vitest, Playwright and
lint changes. They are not part of this security repair. Future dependency PRs
still require review of their own changed graph and inventory; automatic
inventory approval or check suppression is not introduced.

## License review and verification

Both installed published-package MIT files were read. Exact tarball SHA-512
pins, notice SHA-256 hashes, manifest engines and lifecycle metadata are in the
[changed-package review](../research/2026-10-27-dependency-licenses.json).
Neither artifact declares preinstall/install/postinstall. Undici's prepare script
is unchanged from 7.30.0, as checked against registry metadata; it is not a newly
introduced registry-install lifecycle hook. Existing current-renderer notices
are unchanged. Electron binary notices/SBOM/release clearance remain separate.
The project remains UNLICENSED; no DevKit or third-party asset was imported.

Commands and observed results on Linux:

| Command / check                                                                            | Result                                                                                                                                         |
| ------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm install --save-dev --save-exact electron@44.9.3 --package-lock-only --ignore-scripts` | Pass; only the exact Electron pin/record changed                                                                                               |
| `npm update undici --package-lock-only --ignore-scripts`                                   | Pass; only the compatible Undici record additionally changed                                                                                   |
| `npm ci --ignore-scripts`                                                                  | Pass; clean locked install, 161 local packages; all 184 cross-platform entries retained in lock/inventory                                      |
| `npm run check:licenses` before reviewed inventory update                                  | **Exit 1**, exactly Electron/Undici INVENTORY_DRIFT; expected enforcement                                                                      |
| `npm run check` after explicit review/update                                               | **Pass**, 1137 units / 30 files, 99.40% lines / 98.88% branches; format, lint, strict types, intent evaluation, both builds and inventory pass |
| `npm ls electron undici @electron/get`                                                     | Pass; exact intended versions, no invalid dependency                                                                                           |
| `npm audit --audit-level=high`                                                             | **Pass**, zero reported vulnerabilities after the patch                                                                                        |
| `git diff --check` and explicit graph/inventory review                                     | Clean; no unrelated application/test/workflow/security-policy changes                                                                          |

No vendor-version mirror test or exploit reproduction was added. The existing
audit/inventory failures provide meaningful before/after evidence; unchanged
application tests check regressions. New local evidence documents receive format
and relative-link verification before publication. Exact final candidate CI and
review are tracked in issue/PR to avoid a new unverified evidence commit.

## Limits and next step

Local native Windows/Electron and real-provider/manual tests: **not run** on this
Linux host. Required Windows CI owns native probes, 19 transport tests and the
54 repeated Electron cases on the patched runtime. Those must actually execute
after a passing audit. This evidence does not relabel earlier skipped main steps,
claim physical display/DPI testing or extend old human results to Electron 44.9.3.
Pending grouped human checkpoints stay open; no new routine checklist is requested.

No app source, renderer privilege, IPC, credential file, browser sign-in, provider
request, capture permission or ambient work changes. Human review #79 stays
Backlog, OD-04 proposed, G1–G4/OD-02 open, and production auth/capture unwired.
After the repair merges, inspect actual main push checks before closing #88/#83
engineering verification or starting P4-02b's reviewed verifier/signed local
fixtures. Candidate-only success is not merged-main verification or G4 completion.
