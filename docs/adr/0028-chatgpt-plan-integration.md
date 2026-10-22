# ADR 0028: Provisional ChatGPT-plan integration route

Date: 22 October 2026. Issue #81 / P4-01. **Proposed**, for OD-04 and later
maintainer provider/privacy/licensing review. No production auth or capture wiring.

## Decision proposed

Use independently authored, narrowly scoped integration against the documented
public client protocol. Start with an isolated transaction owner and fake
capabilities. Import no DevKit workspaces, examples, assets or sample code. Keep
the repository's source-license decision pending. The source/terms findings are
centralized in the dated [review](../research/P4-01-provider-review.md); this ADR
does not turn that research into service permission or a final legal decision.

The proposed owner lives in main and treats browser callback/token material as
private input, never renderer authority. Strictly bind each attempt to fresh
transaction values, its registration and selected account. A real vetted identity
verifier, trusted endpoint configuration and protected credential adapter will
need separate evidence. A successful fake verifier cannot establish OIDC safety.

Use one active sign-in attempt, bounded lifetime and terminal disposal. Cancellation
or account/authorization changes must make late completion unusable. New sign-in
does not replace the current account before successful validation and protected
commit. Provider selection, consent and request owners must see a new incarnation
on authorization change, including a switch back to the same account label.

Keep browser, token exchange, identity verification and storage behind trusted
injected capabilities in offline work. Do not ship a generic arbitrary-URL fetch,
loopback server or shell/browser capability through IPC. No real endpoint call,
browser launch, credential file, dependency or renderer method is added now.
Future production adapters must constrain destinations and redirects and keep
test endpoint injection unreachable from an untrusted renderer.

Prefer the pinned Electron release's asynchronous OS encryption behind a narrow
adapter, with no plaintext fallback. An unavailable or failing protected store
cannot be disguised as connected. Protected storage limits and actual native
round-trip/restart evidence remain explicit. Logout must stop local work and
report remote revocation separately; no persistent background retry is proposed.

## Alternatives and tradeoffs

Bundling DevKit offers ready-made behavior but imports restricted code and a
larger notice/asset/dependency review. Reusing a macOS example does not establish
Windows behavior. Independent implementation keeps those code imports out but
adds protocol, crypto, session and storage responsibility. It is not formal
clean-room work or a service-terms exemption; public documentation and the
upstream license/README were read. No upstream OAuth implementation was audited.

An API-key or local model can remain a later explicit choice under OD-06. It is
not a fallback for a denied grant, unsupported model or exhausted plan. No model,
SDK, JWT package or alternate provider is chosen by this research task.

## Gates and next work

The maintainer asked on 22 October to keep pending human review on the backlog
and continue. #79 tracks the deferred fixture provenance/licensing review; this
does not approve a distribution license or resolve OD-04. Independent offline
work is permitted by plan section 4. Production integration and real-account
authorization remain subject to their actual review and consent prerequisites.

Next smallest engineering issue: **P4-02a**, the isolated transaction/validation
contract using only fakes, as bounded by the [acceptance plan](../test-plan/P4-02-auth-contract.md).
Later slices own real verification, protected credential lifetime and explicit
refresh/logout before browser/provider wiring. P4-03/04/05, G1/G2/G3/G4 and OD-02
remain open; live capture stays disabled. No human evidence or phase promotion
is inferred from documentation or future mock tests.

Evidence: [P4-01](../evidence/P4-01.md). This ADR remains provisional after merge
until the relevant maintainer decisions and implementation evidence exist.
