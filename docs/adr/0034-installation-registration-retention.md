# ADR 0034: Retain installation and issued registrations before exchange

27 October 2026. Issue #96 / P4-02e. **Proposed** for maintainer
authentication/privacy review. Extends [ADR 0029](0029-siwc-auth-transaction.md)
and [ADR 0032](0032-windows-protected-credential-store.md). No production auth wiring.

## Decision proposed

Keep installation and issued client identifiers in a small, main-only metadata
catalog, independently of the encrypted credential envelope. An issued client ID
can exist before a successful exchange or verified account identity. Losing it
after `invalid_grant` must not force another bootstrap registration. Metadata is
not account/session authority, proof of installation ownership or permission to
infer, capture or transmit a user's content.

`openSiwcRegistrationStore` takes a trusted absolute private local directory.
Persist a fresh UUIDv4 `urn:uuid:…` host ID before returning a usable owner. This
uses the officially supported random-UUID host option, not the optional JWK
thumbprint. Production integration must establish single-instance ownership and
a private application data location first; no app entry/preload/renderer imports
this store or the auth transaction yet.

## Exact bounded metadata

The only committed file is `registrations.v1.json`: exactly version 1, hostId and
registrations. Each registration has exactly an independently generated local
UUIDv4 registrationId and its issued clientId. Retention is idempotent by client
ID; separate IDs get separate slots even when a future account label matches.
The local slot is not a provider account ID or an activation preference.

Limit the committed UTF-8 file to 16 KiB and the catalog to 32 unique client/slot
pairs. IDs have strict UUIDv4 or bounded issued-client grammar; the bootstrap
`dynamic_agent_client` is never retained. There is no eviction, migration or
silent reset at capacity. With 32 client IDs of at most 128 ASCII characters, the
writer's exact schema is also bounded below 16 KiB. Unknown versions, missing or
extra fields, duplicates, malformed UTF-8, invalid types/IDs and corrupt/oversized
files make the store unavailable without overwriting the file or rotating host.

No subject, email, account label, token, ID-token hint, code, state, nonce, PKCE
verifier, redirect/authorization URL or session grant belongs in this file.
Metadata is not secret credential material, but it remains private application
data: no telemetry, renderer bridge or logging. Encryption is reserved for the
separate credential envelope, including any retained ID token.

## Filesystem and ownership

Use exclusive `wx` staging in the destination directory, requested mode 0600,
write/flush/close, then native `linkSync` for **initial create-if-absent**. This
prevents a second initial creator from replacing an already committed host.
After an actual EEXIST collision, read and validate the canonical winner; never
adopt a stage or repair an invalid winner. A filesystem without hard-link support
fails closed; no weaker fallback. Initial staging is unlinked after the link.

For later updates, a synchronous same-directory rename replaces the complete
catalog. Failures before rename leave the old canonical bytes intact. Cleanup
owns only a stage successfully opened exclusively, and never deletes canonical
metadata. Orphans after process/cleanup failure are ignored, never restored or
promoted. No secret is written even to staging. Check final directory/file
types, reject symlinks/nonregular files, bound both stat and native read size,
validate UTF-8, close descriptors and clear owned read buffers.

The supplied directory **and its ancestors are trusted**. These checks do not
defend against a malicious same-user process racing path replacement. One owner
per process/installation must serialize updates. Compare the canonical bytes
against the owner's observed version before reads/updates; external replacement,
removal or unavailability permanently blocks that owner. This is observed-change
detection, not cross-process compare-and-swap, rollback protection or a guarantee
against an interleaving writer after the check. First-creation collision safety
does not grant concurrent-update support.

Staged fsync improves completed-write persistence, but no directory flush,
power-loss durability or filesystem-independent atomicity is claimed. Same-user
malware, backup restoration and disk loss can alter/remove identifiers. Native
Node filesystem behavior is verified separately on Linux and Windows CI; neither
is a physical power-loss test.

## Transaction ordering and retry context

Require a synchronous trusted `retainRegistration({hostId, clientId}, signal)`
capability at construction, with **no permissive production default**. After a
valid one-use state-bound callback and successful browser launch, require exactly
true before exchanging the code. False, thrown errors or a promise/nonboolean
result produce only `registration-commit-failed`, with no exchange, verification
or credential preparation. Existing unit fixtures provide explicit fakes; those
fakes are not evidence of persistence.

Reserve the transaction before reflective inspection; inspect the context once,
copy own plain/null-prototype data fields and reject accessors/extra/inherited
fields. Cancellation, timeout, account invalidation or disposal during retention
cannot proceed to exchange or publish a session. If cancellation happens after
synchronous metadata installation starts, identifiers can remain retained even
when the operation returns false. That is safe nonsecret recovery data, not a
credential commit or successful authorization. Failed replacement keeps the
previous accepted in-memory session under the existing transaction contract.

Alongside existing redirectUri/account inputs, an optional exact registration
record carries clientId and nullable idTokenHint. This permits explicit retry of
an issued but still unbound registration (`account: null`, null hint), with fresh
state/nonce/PKCE and no bootstrap/name hint. A returning callback may omit client
ID; any supplied ID must match the selected registration. A failure discards the
old code, and nothing automatically retries sign-in or token exchange.

## Returning identity hint

A nonnull hint must be an exact main-private projection containing issuer,
subject, clientId and idToken, correlated with a nonnull selected account and
registration. Reject bare token strings and cross-account/client projections.
Copy its bounded printable ID token before browser work; URL-encode it as
`id_token_hint` only at the existing fixed official authorization endpoint.
Never add access/refresh tokens or email/login_hint. `agent_name_hint` remains
initial bootstrap only.

The hint is a browser account-selection aid, not newly verified identity or an
unexpired session. A retained expired ID token may serve that hint purpose;
authentication still requires the new response's signature/issuer/audience/
nonce/expiry and selected-subject verification before credentials/authority.
The caller must derive the projection from the protected credential envelope
for the selected registration and omit it after sign-out; accepting a projection
does not prove its provenance. Refresh/logout and that production composition
remain future work. Raw authorization URLs can contain the hint and **must never
be logged, persisted, sent over renderer IPC or included in diagnostics**. The
trusted browser capability necessarily receives the private URL; avoid a
zeroization or browser-history-erasure claim.

## Sources and deferred work

Official documentation rechecked 27 October 2026:

- [Sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in):
  persist stable host first, retain issued client ID before exchange, retry with
  new code/proof after invalid_grant, and use returning client/hint context.
- [Profiles and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions):
  separate issued registrations, account-binding requirements, retained hints
  and session/logout distinctions.
- [Overview](https://developers.openai.com/siwc/token-sharing-open-source):
  supported UUID host option and optional thumbprint host binding.
- [Pinned Node 24.19.0 filesystem documentation](https://github.com/nodejs/node/blob/v24.19.0/doc/api/fs.md):
  exclusive open, link, rename, descriptor flush and platform/filesystem limits.

Only documentation/protocol facts are used; no DevKit implementation/assets,
dependency or license change. Project remains UNLICENSED. Real account/issuer
compatibility, external browser/listener/code-exchange adapters, refresh/logout,
production account selection/credential wiring, service/OD-04 review and P4-05
remain open. G1–G4, OD-02 and human backlog #79 are unchanged; capture stays off.
