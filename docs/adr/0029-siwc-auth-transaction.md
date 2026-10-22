# ADR 0029: Isolated sign-in transaction and conditional commit

Date: 22 October 2026. Issue #83 / P4-02a. **Proposed** for maintainer
privacy/authentication review. Implements the bounded offline slice from
[ADR 0028](0028-chatgpt-plan-integration.md), with no production wiring.

## Decision proposed

Keep one main-owned transaction in `src/main/siwc-auth-transaction.ts`. Its trusted
capabilities open a supplied authorization URL, exchange a code, verify identity
and prepare a protected credential candidate. This issue supplies only test fakes.
Nothing imports this owner from the application entry point, preload or renderer.
No network client, listener, real browser launch, token file or new dependency is
introduced. Fixed official destinations are contract values, not executed calls.

`begin` accepts a prepared canonical loopback redirect and either a selected
registration/identity or an initial-registration choice. It reserves the active
attempt before inspecting that input or invoking hooks. Each attempt gets three
independent random 32-byte values for state, nonce and PKCE; S256 binds the
verifier. The redirect, selected registration and identity are copied. Initial
registration uses the bootstrap ID only in the authorization URL; exchange needs
the issued callback ID. A returning callback may omit that ID, but cannot replace
it. The issued ID is retained within the active attempt, not a durable catalog.

Callbacks must match the exact prepared URI, fresh state and one-use attempt.
Reject duplicate/unknown fields, alternate loopback representations, fragments,
raw whitespace/control characters, malformed escapes, unbound errors and expiry.
A callback arriving synchronously during browser launch is buffered; exchange
waits for successful launch. Replay and overlap cannot trigger a second exchange.

The exchange hook returns a **normalized local record**, not arbitrary provider
JSON: exactly `access_token`, `refresh_token`, `id_token`, `token_type`,
`expires_in` and `scope`. Absent access/refresh tokens use explicit null; absent
access also requires null expiry and permits null token type. A valid ID-only result can remain signed in
with inference disabled. Full inference scopes without an access token are
malformed. Refresh can be absent; refresh/reconnect behavior is a later slice.
Only returned scopes count, never requested or callback scopes. This owner
requires both `resource.invoke` and `chatgpt.tokens.use.direct` for its internal
inference flag. It never invokes inference, including when that flag is true.

The trusted verifier must return an already verified local identity projection:
issuer, subject, audience, nonce and numeric expiry. The owner checks that those
facts match this attempt and the selected account. This is structural correlation,
**not signature/JWKS verification**. A permissive fake cannot establish actual
OIDC security. A real verifier must prove signature, algorithm, issuer, audience,
nonce, clock and key-policy behavior separately before production use.

## Storage and cancellation ordering

`prepareCredentials(record, signal)` may asynchronously stage a candidate; it
**must not install or activate credentials**. It returns two synchronous closures:

- `commit()` atomically installs the prepared record and returns true. False or
  throw must preserve the previous installed record. It cannot defer writes,
  return a promise or call arbitrary external callbacks.
- `discard()` releases staging on every completion, including late cancellation
  and successful commit. It must not remove the installed record. Cleanup errors
  are private and cannot change an accepted result.

The owner rechecks the generation and expiry after preparation, with no await
before commit. **Entry into synchronous commit is the linearization point.** A
cancellation before entry wins and prevents installation. A later cancellation
returns false: it cannot undo an already claimed atomic commit. Invalidation or
disposal still revoke in-memory authority, including synchronous reentry after
the claim, and cannot reactivate a stale candidate. An invalidation ordered after
a commit is not a promise that committed credentials were never installed.

Real Windows encryption, durable atomic replacement, failure/rollback and restart
are **not proved** by this fake contract. The eventual adapter must demonstrate
those semantics. If its final installation must be asynchronous, redesign with a
reviewed conditional/serialized commit protocol before attaching it; checking
`isCurrent` only after a stale write is insufficient. This slice's invalidation
and disposal are not logout, revocation or credential deletion.

An unsuccessful replacement preserves the prior accepted authorization. A
successful replacement changes an opaque main-generated incarnation, even for
the same client and subject, and aborts the prior grant. Registry changes must
call `invalidate`, including switch-away/back. Grant identity and its abort signal
are local authority; neither a copied object nor provider labels recreate it.
The owner blocks reentry during publication/abort/cleanup transitions. Disposal
is permanent, including from an abort or reflective callback.

## Bounds, privacy and tradeoffs

Default attempt lifetime is 120 seconds; configuration is bounded to 1–300,000 ms.
A monotonic deadline and timer stop public work, including uncooperative hooks.
There is no timer while idle or after termination. Callback URI ports are 1–65535;
its scheme/host/path remain fixed. Local client/host IDs are at most 128 characters,
subjects 255, callback text 16 KiB, each callback field/scope 4096 characters and
each token 16 KiB. Access lifetimes are positive integral seconds, at most one day.
These are local fail-closed limits, not advertised provider maxima.

Only own data fields in narrow plain/null-prototype records are accepted; no
getters, coercion or private reflective exceptions escape. Public operation
outcomes contain fixed status/reason values and an inference boolean. Main-only
current grants contain identity/correlation facts and a signal, never credentials.
They are not renderer payloads or a user-consent proof. There is no diagnostic
hook, console output, token snapshot or authorization-URL log.

Termination drops owner references, clears the deadline and aborts cooperative
work. A late prepared candidate is discarded. Hooks borrow private inputs and
must stop/release them on abort or settlement; JavaScript strings cannot be
reliably erased, and this owner cannot force a hung/malicious trusted adapter to
release its own retained data. No memory-zeroization guarantee is claimed.

Synchronous atomic publication makes cancellation ordering explicit but constrains
future store design. Narrow normalized records simplify bounds while requiring
a reviewed production mapping, including optional fields and refresh scheduling
metadata. Durable issued-registration retention/retry hints, real verification,
protected storage, refresh/logout, listener/browser wiring and production account
selection remain separate P4-02 work; this is not a complete SIWC client.

## Alternatives, gates and review

An async `save()` followed by a UI-generation check can leave stale credentials
on disk. Accepting unverified callback identity or requested scopes can authorize
the wrong account. Both are rejected. A vetted protocol library remains possible
after OD-04/dependency/licensing review; no DevKit implementation was imported.

The [provider review](../research/P4-01-provider-review.md) supplies the dated
primary-source contract; official sign-in and permission recovery pages were
rechecked for this task. [Acceptance plan](../test-plan/P4-02-auth-contract.md)
T-AUTH-001–003/T-CAP-014 mappings and [evidence](../evidence/P4-02a.md) remain
explicitly offline. OD-04 is proposed, the source license stays UNLICENSED and
human review #79 stays on the backlog. G1–G4, real-account acceptance and live
capture remain open. Merge does not approve production authentication or terms.
