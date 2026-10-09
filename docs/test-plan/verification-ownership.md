# Verification ownership and autonomous progress

Agreed direction from Donvan on 9 October 2026: the coding agent owns routine
verification and checks GitHub PRs before dependent work. Avoid repeated manual
handoffs for behavior that can be tested automatically. This changes who executes
checks and when human checks are grouped; it does not fabricate evidence or waive
phase promotion requirements.

| Area                             | Agent-owned verification                                                                                                  | Human-only remainder                                                                                                    |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Build, dependencies and security | Format, lint, strict types, coverage, builds, dependency/license and secret scans                                         | Explicit licensing/product decisions where required                                                                     |
| Windows shell lifecycle          | Native Electron creation, close/hide/reopen, actual tray callbacks, Quit, restart preferences, corruption/future versions | Physical notification-area behavior when a user-reported mismatch remains                                               |
| Layout and focus                 | Negative/small/removed work-area math, real native bounds, simulated display events, keyboard flows                       | Real mixed-DPI hardware/unplug, startup behavior in other apps, subjective readability and screen-reader usability      |
| Mock chat and IPC                | Deterministic streaming, abort/retry, malicious payloads, stale replies, privilege boundaries                             | No human checkpoint needed for pure contracts; later overall UX review                                                  |
| Screen context (P3)              | Intent corpus, fake captures, permission denial, synthetic images, no idle capture, target-validation contracts           | Correct real Windows target selection, protected windows, physical displays and clear consent behavior before G3 closes |
| Provider authorization (P4)      | Fake auth endpoints, protocol/contracts, errors, redaction, capability checks                                             | User-controlled real account authorization, actual text/vision request and logout                                       |
| Final artwork and release        | Provenance checks, automated UI/packaging tests, clean-runner smoke                                                       | Nostalgia/design approval and real install/update/uninstall acceptance                                                  |

## Before proceeding past a PR

1. Fetch current main and inspect predecessor PR metadata and review discussion.
   Verify the work actually reached main, not only a formerly stacked branch.
2. Inspect all review comments and change requests. Fix valid findings with tests;
   document a reason if a finding does not apply. A failed bot review is recorded
   as failed, never silently treated as approval. A direct source/security review
   can supply the engineering review, subject to any separate required reviewer.
3. Require successful required checks on the latest PR head. Do not reuse a green
   run from before a merge conflict resolution or subsequent code change.
4. After merge, inspect main CI and relevant source before dependent development.
   Stop dependent work for confirmed engineering regressions. Reproduce, repair,
   and rerun the affected and required checks first.
5. Preserve exact evidence: candidate SHA, run IDs, command results, review outcome,
   unresolved findings and manual limits. Report review checks still running.

Do not stack new work on unresolved engineering findings. Independent contract or
mock work can proceed while a specific physical test remains unperformed, under
plan section 4's exploration rule. Keep G1/G3/etc. open until their actual evidence
exists. Do not promote a baseline or enable unverified capture/real-provider flows.

## Current checkpoint

P1-04 PR #31 is merged. Its required PR checks and main 1ac70d7 checks passed.
See [pre-P2 review](../evidence/P1-review-before-P2.md). The human display/focus
checks are grouped in the existing P1-04 checklist. #28's physical tray-click report
remains explicitly unconfirmed despite passing native callback tests in Windows
CI and Donvan's local 18-test rerun. Do not repeatedly ask Donvan to rerun those same
automated tests. G1 remains open; independent P2-01 contract/mock work can continue.

P2 streaming PR #35 is now merged into main dd17091 with all required merged-main
checks green. [P2 review](../evidence/P2-review.md) maps the already implemented
P2-03/04 work and the remaining exhaustive native error acceptance in #36. G1
physical evidence is still pending, so G2 baseline promotion remains open. No
repeated routine manual checklist is needed for the mock/error matrix.
