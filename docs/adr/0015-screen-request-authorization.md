# ADR 0015 — Independent screen-request eligibility

Date: 10 October 2026 (Europe/Vienna). Status: provisional privacy/security review,
issue #40, P3-05a. This is the pure contract slice of P3-05, not a complete live
transmission gate. G1/G2 promotion and G3 remain open. OD-02 (capture platform and
target UX) is not decided here.

## Decision and scope

Add a pure `evaluateScreenAuthorization` predicate separate from screen-intent
classification. It accepts a complete main-owned snapshot and returns only an
eligibility boolean and a fixed reason code. It is not imported by main, preload,
renderer or providers. No capture, transmission, consent storage, account flow,
permission request or user-visible behavior is enabled.

The snapshot must come from trusted main-process state, **never directly from
renderer IPC, model output, screenshot content or a website**. Shape validation
does not authenticate facts. In particular, a caller can forge a valid-looking
record; this function is not an IPC security boundary or an executable capability.

All fields are required own data properties on a plain or null-prototype record.
Unknown string/symbol keys, accessors, inherited fields, wrong types and reflective
errors fail closed. Validation copies primitive descriptor values without invoking
getters. Booleans are strict; consent revisions are nonnegative safe integers.
Identifiers are 1–128 ASCII letters, digits, underscores or hyphens, with no trimming
or coercion. These are internal opaque handles, not provider-native IDs, email
addresses, titles, tokens or URLs. A future adapter maps external identities into
main-owned handles; this grammar does not impose a provider API format.

After validation, the first applicable denial wins in this order:

1. Hard exclusion, then Never include screen.
2. No submission, cancellation, consumed request or mismatched active request.
3. No screen intent, including ordinary/ambiguous text-only requests.
4. Missing/revoked consent or a revision other than `SCREEN_CONSENT_VERSION` (1).
5. A different provider or account than the request selected, or consent bound to
   another provider/account.
6. Provider authorization unavailable or vision unsupported.
7. Target identity/generation changed, target blocked/unavailable/protected, or
   OS capture permission unavailable.

Only agreement on every prerequisite yields `eligible: true`. Intent/Include alone
cannot bypass any check. Target allowance must be determined independently of prompt
wording and include exclusion/protected-target validation. A target handle must
identify a validated target incarnation, not only a recyclable native window ID.
Missing target/account/consent handles yield invalid-input and denial; callers must
not fabricate placeholder grants to make validation succeed.

## Freshness and one-shot obligations

Eligibility is **not a reusable permit**. The function deliberately has no clock,
I/O, retained state, callbacks or cache. It cannot verify provenance, prevent replay,
consume a request, abort transport or release image memory. Tests of changed snapshots
prove policy re-evaluation only, not a race-free orchestrator.

Before any future runtime integration, the main-process orchestrator must:

- Bind a submitted request to its selected provider/account and validated target
  incarnation. Obtain consent, opt-outs, capabilities and authorization from their
  owning services, not renderer assertions.
- Rebuild/re-evaluate current facts immediately before capture and transmission,
  and after asynchronous work. Reject cancelled, superseded or already consumed
  requests, invalidated targets, opt-out changes and revoked consent.
- Independently enforce atomic one-shot lifecycle transitions so concurrent/repeated
  evaluations cannot cause duplicate captures or transmissions. No cached `eligible`
  result authorizes a later action. Bind captured bytes to the request and target
  that actually produced them; never relabel old bytes for a different target.
- Treat account/provider switch, logout and authorization-session replacement as
  invalidating in-flight work, even if the same account later reconnects. Do not
  silently fall back to another destination. The pure ID comparisons alone do not
  detect switch-away-and-back; lifecycle invalidation remains mandatory.
- Fail visibly rather than silently sending an image or silently dropping intended
  context. Offer an explicit text-only continuation where appropriate. Do not claim
  that cancellation can retract bytes already delivered to a provider.
- Release image references on success, failure, cancellation and teardown, never
  persist them, and check the provider payload's separate size/MIME contract.

Those side-effect, lifecycle and image-binding tests remain outstanding P3 work.
This contract must not be wired to screenshots as though those obligations passed.

## P3-01 disclosure requirements (draft, not implemented UI)

Before accepting consent, show the selected provider and account in the real UI,
explain target selection and show the applicable provider privacy-policy link.
Resolve actual provider terms in P4; do not invent a retention guarantee here.
Proposed core copy, to be reviewed with the eventual controls:

> Screen context is optional. When you submit a screen-related question or choose
> Include screen, Paperclip Companion can capture one permitted window or display
> and send it with your question to the provider and account shown here. It does
> not record your screen continuously. The app does not save screenshot files, but
> the provider handles received content under its own privacy and retention rules.
> Never include screen and application exclusions override screen requests. You
> can withdraw consent and continue using text-only chat.

Require an explicit affirmative choice, with an equally clear text-only choice.
Do not preselect consent or treat opening chat, typing or Include as onboarding
consent. Persisting consent is a separate versioned-settings change, not part of
this issue. Re-consent is required for a changed disclosure revision or destination;
withdrawal must invalidate in-flight work. Include is per request; Never is an
independent overriding control. Final target UX and capture feedback await OD-02
and P3-01/02/03 integration and human review.

## Alternatives, review and limits

Using the classifier as permission conflates language interpretation with consent
and destination security. A renderer-owned allow flag crosses the privilege boundary.
A cached token or integrated capture pipeline would add lifecycle responsibilities
before target technology is selected. The isolated predicate is the smallest
testable step toward the specified P3-05 gate, with its missing guarantees explicit.

All tests use synthetic opaque handles. No prompts, tokens, images or window titles
enter this function or leave its result. No dependency, artwork, lockfile, license,
OS permission, storage or network change. Direct source review is engineering
evidence, not legal clearance or live Windows/provider validation. P3-04's unchanged
86.7% recall and non-independent evaluation limitations remain documented; this
contract does not improve the classifier or close G3.
