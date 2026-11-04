# ADR 0035: Bounded code exchange and conservative grant expiry

4 November 2026. Issue #103 / P4-02f. **Proposed** for maintainer
authentication/privacy review. Extends [ADR 0029](0029-siwc-auth-transaction.md)
and [ADR 0034](0034-installation-registration-retention.md). No production wiring.

## Decision proposed

Add a main-only `exchangeSiwcCode` capability for the documented public-client
authorization-code exchange. The application entry point, preload and renderer do
not import it. The native implementation can make an HTTPS request when invoked,
but this slice invokes it only under mocked transport with synthetic inputs. No
live issuer, browser, real account, token, inference or capture request is used.

Accept exactly six own data fields from a plain/null-prototype request: endpoint,
clientId, code, codeVerifier, redirectUri and resource. Copy and validate them
before native work; reject extra/inherited/symbol fields, accessors and reflective
exceptions. Recheck the trusted native abort signal after inspection. The only
accepted endpoint is `https://auth.openai.com/api/accounts/oauth/token`, resource
is `https://api.openai.com/v1`, and redirect is an exact
`http://127.0.0.1:<1–65535>/auth/callback`. Reject the bootstrap client ID, bound
the issued ID to 128 characters and printable code to 4096, and require the
existing transaction's 43-character base64url verifier.

Send one `POST` using `application/x-www-form-urlencoded` with exactly
`grant_type=authorization_code`, issued client ID, code, verifier, the same
redirect and fixed resource. Encode values rather than interpolating URLs. The
bounded input schema keeps the encoded body below 16 KiB, including worst-case
code escaping. No client secret, access/refresh token, cookie, Authorization
header, arbitrary destination, redirect following, retry or refresh request.

## Native transport and response

Use `node:https` with no shared agent, verified server certificates and the
standard hostname check, minimum TLS 1.2, at most 8 KiB response headers and a
10-second overall native deadline. A monotonic deadline is checked at native
setup, response/chunk processing and settlement even when the timer callback is
delayed. Request only JSON and identity encoding; send
a byte-accurate content length. Native HTTPS does not follow redirects. There is
no custom TLS trust, disabled verification, proxy fallback or renderer-controlled
network option. Normal Node trust roots are still trusted; no certificate pinning,
compromised-main-process protection or enterprise proxy compatibility is claimed.

Accept only HTTP 200, `application/json` with optional UTF-8 charset, identity or
absent content encoding, a correctly bounded Content-Length when supplied, and
nonempty valid UTF-8 JSON of at most 96 KiB including streamed bodies. Reject
other HTTP statuses/redirects, malformed headers, mismatched lengths, unexpected
text-mode chunks, overflows, stream/native errors and timeout. Non-200 bodies are
not read or exposed. Test-only limits are not provider guarantees; real issuer
compatibility remains unverified.

Project only the six local transaction fields: access_token, refresh_token,
id_token, token_type, expires_in and scope. Read only **own** parsed properties;
ignore unrelated fields and bound primitive types/lengths. Missing access or
refresh token, type or expiry becomes explicit null; missing scope becomes an
empty scope, never the requested scope. Reject duplicate top-level JSON member
names, including escaped spellings; nested extension values are ignored. Return a
frozen projection only to the trusted main caller. The OAuth bearer token type is
case-insensitive and is canonicalized to `Bearer` for the existing transaction;
other token types are not promoted to bearer. This projection is **unverified data**, not a
validated identity, session or inference permission: ADR 0029's transaction
still validates grant semantics and returned scopes, and the separately trusted
verifier must establish signature, issuer, audience, nonce and identity before
credential preparation or publication.

OpenAI's token reference also names `earliest_refresh_at`. Its semantics and
persistence are not established by this slice, and it is not forwarded through
the current six-field transaction or credential schema. Before implementing
rotating refresh or enabling production auth, review current provider guidance,
decide how to retain/use that field and test the resulting protected-record
migration. Never infer a refresh schedule from this unused projection.

## Lifetime, cancellation and private data

OAuth `expires_in` is measured from response generation, which occurs after the
request starts. The old transaction began its lifetime at response processing,
which could overstate validity by transit time. Record wall-clock and monotonic
times before calling the exchange capability; use the pre-exchange wall time as
a conservative absolute expiry, and check both wall and elapsed monotonic time
while the transaction is active. Reject already-expired responses before identity
verification, and recheck after verification and credential preparation. A clock
moving backwards during the attempt cannot by itself extend the active deadline.
This is conservative and may expire a token early; it does not create a trusted
clock, persist a monotonic deadline across restarts or address malicious clock
changes after the attempt. Future request/refresh owners must enforce expiry.

Honor cancellation before egress and during native request/response work. Clear
the timer, detach the abort listener and destroy owned streams on completion;
late responses are destroyed. Cleanup exceptions are suppressed and cannot
prevent a fixed outcome. Recheck cancellation after synchronous cleanup before
returning a grant; the owning transaction also rechecks generation/cancellation
after awaiting it. Do not promise cancellation can unsend bytes already passed to
the network or erase arbitrary native/JavaScript copies.

All errors reject with the fixed `SIWC_EXCHANGE_FAILED` value, including HTTP
errors and `invalid_grant`; the transaction maps this to `exchange-failed` and
never automatically retries the code. This deliberately sacrifices detailed
recovery diagnostics until P4-04 defines a reviewed, nonsecret classification.
No raw provider message, response, URL, token, verifier, code or header is logged,
persisted or sent to a renderer. Owned response buffers are overwritten after use,
but JS strings, TLS internals and third-party runtime copies cannot be zeroized
reliably. Token-like test data are synthetic and never sent to the internet.

## Sources and remaining review

- [Official registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
  and [token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference),
  rechecked 4 November 2026, describe the public-client fields and returned tokens.
- [OAuth 2.0 §5.1](https://www.rfc-editor.org/rfc/rfc6749#section-5.1) defines
  the token response and relative expiry semantics.

The native tests mock `https.request`; they inspect intended TLS settings and
stream behavior but do not prove a real TLS handshake, issuer behavior or
end-to-end compatibility. No OpenAI DevKit implementation/assets were copied;
no dependency, lock, inventory, source-license, credential-schema, workflow or
production IPC change. Project remains UNLICENSED. A moderate dev-tooling
dependency advisory is separately tracked in [#102](https://github.com/DonvanGrobler/paperclip-companion/issues/102).
OD-04/proposed auth and privacy decisions, G1–G4, human backlog #79, actual
provider terms/account consent, rotating refresh/logout and P4-05 remain open.
