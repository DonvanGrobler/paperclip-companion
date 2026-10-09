# Toolchain update policy — 9 October 2026

Maintenance during P1, following the maintainer's investigation request for
PRs #16 and #17. Both standalone major upgrades were closed as deferred;
the working compiler, runtime and dependency inventory remain unchanged.

## Findings

PR #16 at 435c3df proposes TypeScript 7.0.2. npm ci fails with ERESOLVE because
pinned typescript-eslint 8.71.1 requires >=4.8.4 <6.1.0. The same installation
failure blocks the dependency job before an audit can run. This confirms the
compatibility reason for TypeScript 6.0.3 in ADR 0006. Do not use --force or
--legacy-peer-deps to mask the conflict.

Evidence: [Scaffold](https://github.com/DonvanGrobler/paperclip-companion/actions/runs/37944985688)
and [Quality](https://github.com/DonvanGrobler/paperclip-companion/actions/runs/37944985813).

PR #17 at 7e530f4 proposes @types/node 26.6.4. Install, lint, types, unit tests
and builds passed in its Linux job. The failing step is check:licenses, which
reports INVENTORY_DRIFT for @types/node and undici-types and UNRECORDED_PACKAGE
for Electron-nested copies of those packages. This does not establish a license
incompatibility; changed dependencies require review. More fundamentally, the
project targets Node 24.19.0 and intentionally uses Node 24 declarations. A Node
26 type upgrade could admit APIs absent from the supported runtime.

Evidence: [Scaffold](https://github.com/DonvanGrobler/paperclip-companion/actions/runs/37935687780)
and [Quality](https://github.com/DonvanGrobler/paperclip-companion/actions/runs/37935687809).

The out-of-date branch notice is a separate merge requirement, not the cause of
these failures. Rebasing alone does not resolve either toolchain decision.

## Narrow configuration change

Defer Dependabot major-version updates for typescript and @types/node only.
Minor/patch updates still undergo all required checks, including inventory review.
Other npm packages and GitHub Actions keep their existing update policy. No
manifest, lockfile, inventory, installed dependency or runtime permission changes.
No security advisory is waived; a needed major-version security fix requires an
explicit coordinated migration, not an automatic merge or disabled check.

Revisit this policy when the lint stack supports the proposed compiler or a Node
runtime migration is planned. Review the dependency graph and licenses together,
update inventory only after review, and require Windows and Linux checks. The
configuration must not become a permanent excuse to retain vulnerable software.

Validation: configuration inspection and npm run check; exact final CI is linked
from the maintenance PR. Native manual tests are unnecessary for this configuration
change. G0/P1 evidence and required checks are unchanged. P1-02 manual pass is
recorded separately in issue #22 and PR #23. Next product task is P1-03.

Reference: [GitHub Dependabot options](https://docs.github.com/en/code-security/reference/supply-chain-security/dependabot-options-reference#ignore).
