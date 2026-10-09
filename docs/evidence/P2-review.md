# P2-03/04 reconciliation and G2 technical review

Issue #36. Candidate status: in review. This report separates P2 engineering
acceptance from phase promotion. G1 remains open, so G2 is not closed and P3 is not
promoted to a verified baseline. Independent P3 exploration remains allowed by
plan section 4.

## Verified starting point

PR #33 supplied the provider contract and mock. PR #35 supplied main-owned chat
streaming and restricted IPC and was merged into **main dd170915ff6415dd3492b37b076b2468a7ab572c**.
The merged tree matches PR #35's reviewed head. There were no inline comments or
change requests. Copilot's optional review failed with rate_limit; direct source
and security review was recorded instead, not relabelled as a bot approval.

Merged-main [Scaffold](https://github.com/DonvanGrobler/paperclip-companion/actions/runs/37965476792)
and [Quality gates](https://github.com/DonvanGrobler/paperclip-companion/actions/runs/37965476856)
passed before this dependent task. The four required checks are Ubuntu scaffold,
Windows scaffold, dependency-and-license-scan and secret-scan. PR #35's native
Windows run had 39 E2E passes and 167 unit passes; this is automated evidence, not
a human display or focus assessment.

## Requirements reconciled

| Requirement                                                                  | Implementation and evidence                                                                                                                             | Remaining limit                                                                        |
| ---------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| P2-01 provider interface/validation/mock                                     | `src/core/provider.ts`, `src/providers/mock.ts`, `tests/unit/provider.test.ts`; PR #33                                                                  | Synthetic contract only, no real auth or image understanding                           |
| P2-02 streaming, abort/retry, errors, provider display                       | `src/main/chat-session.ts`, renderer chat/state, `chat-stream.spec.ts`; PR #35                                                                          | Offline mock is the only selectable provider; no account or model selection claimed    |
| P2-03 provider calls in main, narrow IPC                                     | `src/main/chat-ipc.ts`, preload, sender/payload negative tests, native overlay denial; ADR 0013                                                         | Images/endpoints/credentials remain forbidden at chat IPC                              |
| P2-03 settings versioning                                                    | P1-04 preferences schema, migration/rejection/corrupt/future-version tests and native restart tests; PR #31                                             | Only shell preferences persist; not credentials or chat                                |
| P2-04 offline/auth expiry/rate limit/cancel/text/vision unsupported fixtures | `tests/fixtures/provider-cases.json`, adapter contract tests and native scripted-scenario tests; PRs #33/#35                                            | Vision success is a synthetic fixture, not production capture                          |
| G2 UI → mock conversation                                                    | Native partial text, Stop/Retry/Clear, reload/close/reopen and tray Quit regression cases                                                               | Not evidence of real-provider transport cancellation                                   |
| G2 restricted renderer                                                       | Exact window/frame/URL/count/payload rejection, isolated renderer, blocked network/navigation/popups, no generic IPC/OS bridge                          | Future capture/auth additions need their own boundary reviews                          |
| G2 all provider errors have tested user behavior                             | This issue adds exhaustive native UI acceptance for all nine provider codes plus INTERNAL; typed fixed-message expectations and reducer recovery checks | Candidate native Windows result must pass before this criterion is considered verified |
| G2 no external AI services required                                          | Offline mock, synthetic data, no account/secrets in CI                                                                                                  | Software installation and GitHub CI infrastructure use network access                  |

## Gap found and corrected

The five scripted failure scenarios already had native UI tests, but INVALID_INPUT,
NOT_CONNECTED, BUSY, TEXT_UNSUPPORTED and INTERNAL did not. Unit tests covered safe
code propagation but did not prove each message, accessibility role and recovery
control in the actual chat UI. The new matrix fills that gap.

Review also found the BUSY message told users to press Stop after the request had
already ended and Stop was disabled. The message now correctly offers a fresh
Retry. Its acceptance test was observed failing against the old text before the
one-line production fix. No state-machine or privilege expansion was needed.

The fixture is an exhaustive TypeScript Record keyed by ChatErrorCode. A future
error code requires a deliberate user-facing expectation. Native tests check the
exact independent fixture message, alert/assertive semantics (status/polite for
cancellation), preserved partial text, Stop disabled, Retry enabled, no new start
from draft editing, and one explicit fresh retry using the real mock adapter.
Clear then removes the exchange. Existing natural scripted failures remain tested.

## Test-only fault injection and security review

`tests/e2e/chat-harness.cjs` is a separate Electron test entry, patterned after the
existing tray harness. It installs a wrapper before loading the ordinary bundled
app. The real main handler runs first, including sender checks, input validation,
pacing and mock iteration. Only the second successful text chunk is replaced with
one fixed error event. Null/rejected responses are never upgraded; the fault is
consumed once and the subsequent explicit Retry uses the unchanged real mock.
Unit tests assert argument preservation, denied-call passthrough, one-shot behavior,
accepted-start counting and unrelated-handler passthrough. Native tests also issue
overlay calls while a fault is armed and require rejection.

The harness deliberately simulates errors after partial text, including classes
that normally occur before streaming, to check robust recovery. It does not claim
those paths occur naturally in the mock. It does not bypass or test production error
normalization; existing session tests separately prove safe normalization of every
code and suppression of arbitrary exception messages.

No production module imports the harness or exposes fault settings. No runtime
permission, IPC channel, logging, capture, network, account, storage, dependency or
artwork change. Only production change is corrected BUSY recovery copy. Licensing
inventory remains unchanged. G0 source-license/distribution limitations still apply.

## Verification and gates

- Baseline: `npm test` passed 167 tests.
- Test-first: new suites failed before their fixtures/harness existed; BUSY acceptance
  failed against the old production message before correction.
- Local candidate `npm run check` passed 179 unit tests, formatting, lint, strict
  types, builds and the unchanged 184-package license inventory. Measured coverage
  remains 100% lines, 99.76% statements, 98.70% branches and 98.95% functions.
- `npm audit --audit-level=high` passed with zero vulnerabilities. Production bundle
  inspection confirmed the test-only fault-control entry is absent.
- Native Windows CI and review results are recorded against the final head in issue
  #36 and its PR. Do not substitute old green runs.
- Local native Electron testing is unavailable in this container (no display/Xvfb).
  Native Windows CI owns the automatable cases; no new manual checklist is requested.
- No new human tests performed. G1 retains physical display/DPI/focus and the unresolved
  physical tray-click confirmation tracked in #28/#30. Existing passing native tray
  callbacks and the user's 18-pass rerun are preserved as their actual evidence type.

**Gate decision:** P2 implementation exists, with the exhaustive error UI criterion
under final candidate verification. G2 remains open for its candidate review and
G1 prerequisite. No phase completion or promotion is inferred solely from test code.

## Post-merge verification

PR #37 merged to main 4060ef1. Required merged-main Scaffold run 37997535888 and
Quality gates run 37997535861 passed. Final PR Windows evidence was 179 unit tests
and 42 native E2E passes. Copilot review 5473375874 completed with zero open findings
(COMMENTED, not approval); no inline findings or change requests. The maintainer
merged the PR. The technical error matrix is verified, while the review's human-gate
caveat remains: G1 is open and G2 baseline promotion has not been granted.

**Next smallest independent issue:** P3-04 deterministic screen-intent policy and a
synthetic held-out evaluation corpus, starting with fail-closed behavior and no
capture/IPC integration. Consent/target/transmission contracts and real Windows
capture validation still precede G3. Do not enable capture or real-provider egress
just because the pure classifier is implemented.
