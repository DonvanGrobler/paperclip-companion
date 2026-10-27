# ADR 0033: Fixed issuer discovery and bounded signing-key reuse

27 October 2026. Issue #94 / P4-02d. **Proposed** for maintainer
authentication/privacy review. Extends [ADR 0031](0031-siwc-identity-verification.md)
and the isolated [transaction](0029-siwc-auth-transaction.md). No production wiring.

## Decision proposed

Add `createSiwcTrustedIdentityVerifier` in main. Its only verification output is
the existing immutable five-field identity or null. It owns discovery, an
in-memory public key cache and the existing maintained-library verifier. It does
not expose a key snapshot, account session, storage hook, inference permission or
renderer bridge. App entry points/preload/renderer do not import it.

Extract the existing compact token/header/context grammar into a shared main-only
parser, retaining all prior signature/claim/key limits. Validate and copy the
original expected issuer/audience/nonce before any transport call. An unverified
bounded header supplies only a key lookup ID; no claim/header can choose an
issuer, URL, algorithm policy or account. Signature and claims still require
`jose` verification. No parse-only result establishes identity.

## Fixed origin and native transport

The only two request destinations are exactly:

- `https://auth.openai.com/.well-known/openid-configuration`
- `https://auth.openai.com/.well-known/jwks.json`

Use an original `node:https` reader with GET, TLS certificate validation forced
true, the standard hostname checker, minimum TLS 1.2 and no shared global agent.
Set only fixed JSON Accept and identity Accept-Encoding headers. There is no
browser cookie jar, authenticated header, request body, client certificate,
proxy/redirect machinery, configurable issuer or general URL-fetch capability.
The reader independently enforces the exact allowlist. URL spelling variants,
userinfo, custom ports, query/fragment, HTTP and other hosts/paths are denied;
native HTTPS does not follow redirects. Normal Node trust roots remain the trust
basis; this is not custom certificate pinning or isolation from a compromised
main process/runtime.

Accept only HTTP 200, JSON/JWK-set JSON with UTF-8 or no charset, and no content
encoding except identity. Limit native response headers to 8 KiB and body bytes
to 64 KiB, including streaming without Content-Length. Validate a supplied
length against both the bound and actual bytes. Reject empty, malformed UTF-8,
oversized, compressed, truncated or errored streams. Destroy owned requests and
responses on denial, completion and abort, including late response callbacks.
The reader has its own five-second deadline; the owning verification also limits
the entire discovery/key/crypto operation to five seconds. No idle timer remains.
Return only bounded text/freshness or null; raw native exceptions are private.

## Metadata and key profile

Require the discovery object's own issuer, authorization_endpoint,
token_endpoint, jwks_uri and id_token_signing_alg_values_supported. Issuer and
all three endpoints must exactly match the fixed documented values; authorization
and token paths remain `/api/accounts/authorize` and `/api/accounts/oauth/token`.
Require RS256 in a bounded array of supported algorithm names (at most 16).
Ignore unrelated metadata and never follow its other URLs. Invalid metadata
cannot trigger a JWKS request.

The downloaded JWKS must already match ADR 0031's strict normalized public
profile: one keys root, 1–8 unique bounded RSA signing keys, explicit RS256,
2048–4096-bit canonical modulus/exponent 65537, permitted use/key_ops only. Reuse
the existing validator rather than duplicate cryptographic checks. Do not relax
the profile, infer missing key parameters, accept certificates/URLs/private
parameters, choose another algorithm or silently filter unsupported material.
Actual OpenAI metadata/key compatibility remains **unverified**; if its served
shape differs, change this provisional profile only after explicit source and
security review. Synthetic issuer-shaped documents do not prove live provenance.

## Cache, request budget and failure behavior

Cache only when both responses permit a positive, unambiguous Cache-Control
max-age. Subtract valid Age, cap each at 300 seconds and use the smaller metadata
and JWKS lifetime, conservatively measured from the start of their load.
No-store/no-cache, missing/ambiguous/malformed max-age, invalid Age or zero
freshness means **current verification only**, with no reusable cached verifier.
No Expires heuristic, ETag/304, stale-if-error, disk cache or background refresh.
Recheck cache freshness after asynchronous signature work and before delivery.
Expired key objects can remain in memory until next access/invalidation/disposal,
but cannot verify a new identity after their lifetime.

One verification is active at a time; overlapping calls fail closed. A missing
cache, expired cache or unknown kid may start at most **one discovery/JWKS pair**
for that call. All load starts, including failure/cancel, consume one global
30-second cooldown. Repeated unknown IDs cannot grow a negative cache or trigger
loops. Known-key signature/claim failure never triggers refresh; same-kid material
rotation therefore waits for normal expiry. Invalidation retains the cooldown.

Starting a permitted load retires old keys before awaiting new data. Failure
cannot restore them. There is no automatic retry, provider fallback, silent
algorithm change or stale acceptance. Fresh cached known keys can be reused
without requests; no-store/very short server freshness may cause a visible
verification failure during cooldown. This conservative tradeoff and all size,
time/destination/profile bounds are local policy, not provider promises.

## Cancellation, reentry and private data

Reserve work before inspecting reflective inputs or trusted hooks. Invalidation
and terminal disposal retire the generation and key resolver. A native caller
signal or timeout settles null promptly and aborts downstream work. Recheck
generation, ownership, monotonic deadline/cache lifetime and disposal after
awaits and after abort cleanup. Block reentrant verification during cleanup;
late transport/crypto cannot publish an old identity/cache or release newer work.

The existing verifier still checks wall-clock token validity; the wrapper uses a
monotonic clock for request/cache bounds and denies rollback/non-finite values.
No token, nonce, authorization code, account label or credential is transmitted
in these public metadata requests, written to disk or sent to diagnostics. No
console/error-body hook, IPC or trace is introduced. Native crypto/uncooperative
trusted doubles may settle late; discard results, release owned buffers where
practical and make no JavaScript/native memory-erasure guarantee.

## Sources, review and remaining work

Rechecked on 27 October: official OpenAI
[OSS sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
and linked [discovery/verification guidance](https://developers.openai.com/siwc/website),
[OIDC Discovery 4.3/7](https://openid.net/specs/openid-connect-discovery-1_0.html),
and pinned Node 24.19.0 [HTTPS](https://github.com/nodejs/node/blob/v24.19.0/doc/api/https.md),
[HTTP](https://github.com/nodejs/node/blob/v24.19.0/doc/api/http.md) and
[TLS](https://github.com/nodejs/node/blob/v24.19.0/doc/api/tls.md) APIs. Source
blobs respectively `b08e53d59956e3ffa5225b8f40a7646e74de617f`,
`26921a97590454b32544220b4a68ca85fe99496f`,
`d4cbc9688fef06d76ddf50fc86ca55849f124c55`. No upstream/DevKit implementation copied.

[Evidence](../evidence/P4-02d.md) separates independent synthetic RSA validation
and mocked native transport contracts from actual server/TLS/account evidence.
No real OpenAI discovery/JWKS/account request runs in development or CI. No new
dependency, source license or binary release clearance; project stays UNLICENSED.
Maintainer auth decisions/OD-04, human backlog #79 and G1–G4 remain open.
Durable registration, browser/listener/code exchange, refresh/logout, production
provider wiring and eligible-account P4-05 checks remain separate. No new manual
checklist; actual key provenance/compatibility must precede production acceptance.
