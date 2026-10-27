# ADR 0030: Repair the October security-audit baseline

Date: 27 October 2026. Issue #88. **Proposed**, for maintainer security and
runtime/dependency review. This is continuous maintenance before P4-02b.

## Context and decision proposed

PR #84's offline transaction merged into `main` at `15d0b5ae`. Its reviewed tree
is intact and main's 1137 unit tests/check/build stages pass. Current audit data
reports vulnerable Electron 44.7.0 and downloader-transitive Undici 7.30.0. Both
main workflows fail audit; later native/transport/Electron steps are skipped.
The [working agreement](../../AGENTS.md) requires repairing that confirmed
baseline failure before starting dependent authentication work.

Pin **Electron 44.9.3**, within the existing 44.x runtime line. Resolve **Undici
7.30.1** inside unchanged @electron/get 5.1.0's optional `^7.24.4` range. The
vendor Electron advisory's patched 44.x floor is 44.9.1; 44.9.3 also contains
upstream security backports. Undici 7.30.1 is the vendor's patched 7.x release
for the three findings present in the reproduced npm audit.

Only those two package records and the root Electron pin change. Keep Node/npm,
all other direct versions, dependency ranges, engines, optional/dev flags,
workflow permissions, audit severity and inventory enforcement unchanged. Use
normal lockfile resolution and a clean install; no force, peer bypass, override,
audit exception or automatic inventory approval is introduced.

## Security, provenance and license review

[Electron's advisory](https://github.com/electron/electron/security/advisories/GHSA-jr5w-w6x2-84p9)
addresses the compromised-certificate mitigation and requires a patched runtime.
The affected downloader path is `electron → @electron/get → undici`; its package
is optional development tooling and does not become the app's provider transport.
The Electron runtime still needs its own upstream fixes; this issue does not
infer its embedded Node implementation is the separately installed Undici package.

Exact registry SHA-512 pins, installed manifests, MIT license files, SHA-256
notice hashes and lifecycle metadata were inspected and recorded in the
[dated review](../research/2026-10-27-dependency-licenses.json). No package path or
license declaration changes. Neither changed package has a preinstall/install/
postinstall script in its published manifest. Undici's unchanged repository
prepare script remains recorded; it is not a new registry dependency install hook.

The application remains UNLICENSED. Current renderer notices are unchanged.
Electron's embedded components and binary notice set still require artifact-level
review before redistribution. This package review does not adopt a project license,
approve fixture provenance #79, import DevKit code or resolve OD-04.

## Verification, alternatives and consequences

Reproduce the failing audit first. After version resolution, the old inventory
must fail on exactly the two changed records; update it only after review.
Require a clean locked install, full 1137-test/check/build suite, zero reported
audit vulnerabilities, unchanged 184-entry inventory, final-head security/Linux/
Windows checks and actual native/transport/repeated Electron execution. Record
candidate results and final review in the issue/PR, with actual merge/main
verification after merge. Earlier failed/skipped results remain historical facts.

Suppressing audit or assuming prior green CI remains current would propagate the
unresolved baseline. A major runtime upgrade adds unnecessary compatibility work
for these findings; reviewed fixes exist in 44.x. Closed, unmerged Dependabot
#85–#87 updates are separate routine tooling changes and are not folded into this
repair. Inventory-drift failures in future dependency PRs continue to require
explicit review; the guard is not relaxed.

The Electron runtime changes, so old physical Windows evidence stays scoped to
its tested version. Use automated Windows regression checks now and retain the
pending grouped G1/G4/release human checkpoints. No new routine human checklist,
real account, browser sign-in, provider request, capture capability, IPC or
credential file is introduced. #83 stays open until genuine repaired-main
verification. Then resume P4-02b. G1–G4, OD-02/OD-04 and deferred human reviews
remain open. Evidence: [security maintenance](../evidence/security-maintenance-2026-10-27.md).
