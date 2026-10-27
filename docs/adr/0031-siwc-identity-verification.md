# ADR 0031: Verify ID-token signatures against trusted local keys

27 October 2026. Issue #90 / P4-02b. **Proposed** for authentication,
dependency/license and maintainer review. Extends the offline transaction boundary
from [ADR 0029](0029-siwc-auth-transaction.md); production integration remains unwired.

## Decision proposed

Use exact **jose 6.2.13**, a supported v6 ESM package with an MIT notice and zero
transitive dependencies, for signature/key import and JWT claim validation. Add
one main-only helper, `createSiwcIdentityVerifier`, that consumes a trusted,
normalized public JWKS JSON snapshot. Use the library's local key resolver and
`jwtVerify`; do not implement signature algorithms, choose keys from token URLs,
use a remote resolver or import an upstream OAuth/DevKit implementation.

The OpenAI [OSS sign-in guide](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
requires signature and attempt/account binding; its linked
[identity-verification guidance](https://developers.openai.com/siwc/website#6-verify-the-id-token)
uses a maintained JWT library. The verification rules were rechecked against
[OIDC Core 3.1.3.7](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)
and [RFC 8725](https://www.rfc-editor.org/rfc/rfc8725.html).
Implementation uses the pinned library API documentation; no example, key,
credential or implementation source was copied.

The issuer is fixed to `https://auth.openai.com`. Main supplies the issued client
ID and fresh nonce copied from the active transaction. The helper accepts only
own data fields in that three-field context, with a bounded issued ID and the
transaction's 43-character nonce. It verifies signature and claims before
returning an immutable projection: issuer, subject, selected audience, nonce and
expiry in milliseconds. It returns **null** on every failure; no token, complete
payload, email, raw exception, library error/cause or key is exposed or logged.
The transaction still owns replay/state/selected-account checks and protected
commit. Successful verification alone is not account selection, a fresh session,
inference permission, vision capability or capture consent.

## Conservative local profile

This is a provisional, fail-closed profile, not a claim about the currently
served OpenAI signing metadata or actual account compatibility:

- RS256 only, with unique bounded key IDs, public RSA moduli of 2048–4096 bits
  and exponent 65537. Require explicit normalized kty/kid/alg/n/e. Optional use
  must be sig; optional key_ops must be exactly verify. Reject private/symmetric,
  encryption, embedded, certificate/URL and unknown fields. Key import/math is
  the library's responsibility; our checks bound and constrain its input.
- Snapshot root must contain its own keys array, 1–8 keys, within 64 KiB UTF-8.
  Input is a string parsed locally, never an object with getters/coercion. Moduli
  must be canonical base64url. Each replacement gets a fresh local resolver;
  no ambiguous-key fallback or iteration through candidate keys.
- JWT is compact signed serialization, at most 16 KiB, with an encoded header
  at most 1024 characters. Header accepts only alg/kid and optional JWT typ.
  Unsigned/HMAC/other algorithms, access-token type, embedded jwk, jku/x5u,
  certificate chains, crit and unencoded payload options are rejected.
- Require issuer, subject, audience, nonce, issued-at and expiration. Accept the
  selected audience string or a one-item array containing only that client.
  Reject extra audiences because no additional audience trust is configured.
  If azp is present, require the same client ID. Subject remains opaque,
  case-sensitive and bounded; email/workspace labels are not identity authority.
- Require positive integral NumericDates, strict unexpired expiration, expiry
  after issuance and at most one day of lifetime. Permit five seconds of skew
  for future iat/nbf and at most ten minutes of age plus that skew. Do not grant
  an expiration grace period. Optional nbf must precede expiration. Recheck
  expiry, clock validity and substantial clock rollback after async crypto.

These are local implementation limits, not provider maxima. A future trusted
loader must verify discovery/issuer/TLS/destination/cache policy and produce the
normalized public subset without trusting JWT-supplied keys. Compatibility with
actual issuer algorithms, key metadata and time policy must be established before
production wiring; unsupported material fails closed rather than changing policy.

## Rotation, cancellation and data lifetime

`replaceKeys` revokes the prior generation before inspecting the new snapshot.
An invalid replacement leaves no usable resolver. Even an identical replacement
invalidates in-flight results; same-kid replacement cannot reuse cached old key
material. Disposal is terminal. Verification checks generation/disposal and the
caller's signal before work and after async verification. Reflection during
expected-context inspection cannot resurrect an old generation.

Native crypto cannot be forcibly interrupted. Its bounded work can settle after
abort/replacement; its result is discarded. No local timer, polling, remote fetch,
cache refresh, retry, filesystem operation or telemetry is added. Borrowed token
strings can remain in an in-flight native/library operation until it settles;
JavaScript memory erasure is not promised. Main's transaction owns its public
attempt deadline and prompt cancellation. Parallel callers must be bounded by
that owning transaction; this helper is not an exposed verification service.

A trusted snapshot signed by test keys proves validation behavior, **not actual
OpenAI key provenance**. Unknown-kid refresh and trusted key-cache lifetime are
separate production-loader work. This helper must not be wired to arbitrary
renderer-supplied snapshots or used as a complete OAuth/OIDC/session client.

## Dependency, evidence and gates

The [artifact review](../research/2026-10-27-jose-license.json) records the inspected
installed/upstream MIT notice, integrity pin and lifecycle metadata. Exactly one
production-classified package path is added; existing records are unchanged.
The inventory guard first rejected the unrecorded path, then was explicitly
updated after review. The project remains UNLICENSED. Current app entry points
import neither the helper nor jose, so current application bundles and renderer
notices are unchanged. Preserve the package's MIT notice when production wiring
bundles it; artifact-level distribution review remains required. No DevKit code,
asset or service permission is inherited from this dependency.

[Evidence](../evidence/P4-02b.md) records test-first results, independently signed
synthetic keys/tokens, transaction composition, coverage, audit and exact-head
CI/review tracking. Protected credential storage/restart is the next bounded
P4-02c slice; discovery/key loading, refresh/logout and real browser/account wiring
remain later responsibilities. Human review #79, OD-04 and G1–G4 stay open.
No real account, credential store, inference or screen capture is tested here.
