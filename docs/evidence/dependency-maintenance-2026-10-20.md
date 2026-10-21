# Dependabot repair — 20 October 2026

Issue #62. Donvan requested repair of PRs #56–#61 before resuming P3. This
maintenance slice consolidates those existing updates into one reviewed graph.
No application feature, phase gate, renderer privilege or capture behavior changes.

## Diagnosis and disposition

| Original PR | Proposed update                   | Confirmed failure / disposition                                     |
| ----------- | --------------------------------- | ------------------------------------------------------------------- |
| #56         | setup-node 7.0.0 → 7.1.0          | All four checks already passed; incorporate the reviewed commit pin |
| #57         | typescript-eslint 8.71.1 → 8.71.2 | INVENTORY_DRIFT for the coordinated lint family                     |
| #58         | @types/node 24.19.1 → 24.19.2     | INVENTORY_DRIFT for Node declarations                               |
| #59         | vitest 5.0.3 → 5.0.4              | npm ERESOLVE: coverage 5.0.3 requires vitest 5.0.3                  |
| #60         | coverage-v8 5.0.3 → 5.0.4         | npm ERESOLVE: coverage 5.0.4 requires vitest 5.0.4                  |
| #61         | prettier 3.9.9 → 3.9.10           | INVENTORY_DRIFT for Prettier                                        |

Original Ubuntu logs were inspected: jobs 116759134461, 116759156820,
116759236936, 116759283634 and 116759318347 respectively. No review/change-request
findings existed on those PRs at inspection. Originals are superseded only after
the combined replacement passes CI/review, with links preserved in their bodies.
No bypass flags, automatic inventory acceptance or disabled check is introduced.

## Scope and dependency/license review

Baseline main `a9777813b96faff0c87edf735dba215263d13bf9` contains merged PR #55.
Main runs 38833959449 / 38833959288 passed. Local baseline `npm run check` passed.

The complete graph remains 184 locked entries, with 20 changed package records,
no added/removed paths and unchanged production dependencies. All changed entries
are development-only and retain an MIT manifest declaration. Exact versions,
SHA-512 pins, dev/optional flags and license declarations are reviewed in the
updated inventory. Installed license-file SHA-256 evidence is recorded in
[the review record](../research/2026-10-20-dependency-licenses.json).

| Package family                                        | Change / review                                                                                                                 |
| ----------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| typescript-eslint and ten @typescript-eslint packages | 8.71.1 → 8.71.2; coordinated lint release, MIT files present                                                                    |
| @types/node                                           | 24.19.1 → 24.19.2; MIT file present; Node runtime remains 24.19.0                                                               |
| vitest, coverage-v8, mocker and spy                   | 5.0.3 → 5.0.4; exact peer pins aligned; MIT core plus retained bundled notices                                                  |
| prettier                                              | 3.9.9 → 3.9.10; MIT file present                                                                                                |
| nested ignore                                         | 7.0.12 → 7.0.13 resolved within the lint package’s ^7.0.5 range; LICENSE-MIT present                                            |
| obug                                                  | 2.2.1 → 3.0.0 required by Vitest's ^3.0.0 range; MIT file present; development-only major transitive update explicitly reviewed |
| tinybench                                             | 6.2.1 → 6.2.2 required by Vitest's ^6.2.2 range; MIT file present                                                               |

No changed package adds an install/postinstall lifecycle hook. Vitest's bundled
license material also declares BSD-3-Clause and ISC components; those notices
remain in its package and are not relabeled MIT. This is development provenance
review, not installer/native-binary or blanket redistribution clearance.

The setup-node upstream v7.1.0 tag was verified as commit
`949feb2413d6458794dcd2491c4babbbce0c15c1`, matching PR #56. Its upstream MIT
license and release notes were inspected. Workflow diff changes only that pin;
read-only permissions, disabled credential persistence and pinned Node/npm remain.
Existing Node download/cache network behavior is unchanged. Actions' bundled
runtime notices remain relevant to action execution and are outside the app's npm
inventory; no action code is copied into the product.

Primary evidence reviewed 20 October 2026:

- [Vitest v5.0.4](https://github.com/vitest-dev/vitest/releases/tag/v5.0.4), installed manifests and registry peer metadata: coverage requires the matching Vitest version.
- [typescript-eslint v8.71.2](https://github.com/typescript-eslint/typescript-eslint/releases/tag/v8.71.2): patch fixes and coordinated package versions.
- [Prettier comparison](https://github.com/prettier/prettier/compare/3.9.9...3.9.10): formatter patch.
- [setup-node v7.1.0](https://github.com/actions/setup-node/releases/tag/v7.1.0) and its immutable commit/license.
- [Dependabot groups](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#groups): group vitest and @vitest/* in future version updates. Major compiler/Node-type restrictions remain.

## Verification

- Combined `npm install --package-lock-only --ignore-scripts`, then clean `npm ci`: passed without force/legacy-peer-deps.
- Before inventory update, `npm run check:licenses` failed on exactly the 20 changed records; after explicit review/update it passed all 184.
- `npm ls vitest @vitest/coverage-v8 typescript-eslint @types/node prettier`: clean, matching Vitest/coverage 5.0.4, no peer conflict.
- `npm run check`: 780 tests passed, 100% lines / 99.41% branches; format/lint/types/intent/build/license passed.
- `npm audit --audit-level=high`: zero vulnerabilities.
- `git diff --check`: clean before publication.

An initial local format run caught quoting in the new Dependabot YAML and was
corrected with the formatter. No application/test source needed modification.
Final replacement CI (including native Windows and 48 Electron tests) and review
are recorded in issue/PR at the verified commit before handoff. No physical
Windows/manual or real-provider testing performed or needed for this tooling slice.

## Next and limits

Future npm update PRs still require explicit package/license review and an
inventory update. An INVENTORY_DRIFT failure before that review is intentional;
it must be resolved on the update branch before merging. Grouping fixes the
separate Vitest-peer PR problem, not permission to auto-accept future licenses.
After the maintenance PR merges and main is verified, resume native synthetic
pixel transport (P3-03). G1/G2 promotion/G3/OD-02 and redistribution gates remain
open; no real-account or external-window capture is enabled.
