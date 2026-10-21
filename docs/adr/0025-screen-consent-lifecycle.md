# ADR 0025: Main-owned destination-bound screen consent

Date: 21 October 2026. Issue #75 / P3-01b. Provisional privacy component for
maintainer review; no production consent, capture or transmission integration.

## Context and decision

ADR 0015's pure predicate compares a snapshot but cannot invalidate a previous
choice when an account switches away and back. ADR 0016's renderer preview is
deliberately not consent. Add an independent, unwired main-owned lifecycle with
one current destination, one pending presentation and one grant, all in memory.
This is independent P3 work under development-plan section 4 while external
target identity/exclusion mapping remains blocked by OD-02. It does not promote
the phase baseline or resolve that blocker.

The trusted main registry supplies exactly four own data properties:
providerId, accountId, authorizationId and disclosureVersion. Handles are bounded
1–128 ASCII letters/digits/underscores/hyphens, matching the existing policy's
internal handle grammar. They are not credentials, email addresses, provider-native
IDs, window titles, user-facing labels or endpoint URLs. The authorizationId is
a main-owned session incarnation: mint a fresh handle after disconnect/reconnect
or authorization-session replacement, even for the same account. Publish null
immediately on authorization loss/logout; do not wait for another request. The
component cannot observe those external events or authenticate registry facts.

Only the compiled SCREEN_CONSENT_VERSION is supported. Missing, unknown, inherited,
accessor, malformed or unsupported fields, extra string/symbol/non-enumerable
keys and reflective errors fail closed, clearing the destination and any consent.
Property descriptors are copied without invoking data accessors. Plain and
null-prototype records are accepted; no coercion or trimming. Repeated identical
valid context preserves the current choice/grant. A mismatch revokes before a new
choice can be offered. A new app/disclosure build starts without any grant; no
persistent consent is restored. No independent mutable disclosure version can
diverge from the pure policy.

## Choice and revocation

present returns a frozen copy of the current context. It replaces any earlier
unaccepted presentation and returns null if consent is already granted, no
destination exists, a transition is active or the owner is disposed. accept
requires the exact latest object from this owner, once. Copies, serialized
records, preview acknowledgements, other-owner objects, stale choices and replays
are rejected by identity without inspecting their fields. An accepted immutable
grant contains the context and a cancellation signal, but not its controller.

Object identity is an internal lifecycle capability, **not proof of a human
gesture or an IPC authentication mechanism**. These methods must never be exposed
directly to a renderer, model or website. The eventual adapter must display the
actual destination/account, current disclosure and applicable provider privacy
policy, and bind a validated explicit affirmative action to this main-owned
presentation. Text-only/withdraw must remain equally clear. That IPC/UX work and
human consent validation are separate; the existing preview remains unchanged.

Destination/account/session/revision change, invalid context, disconnect,
withdrawal and disposal drop the old grant and pending presentation before
synchronously aborting the old signal. An old grant stays invalid after switching
back or granting fresh consent to the same destination. isCurrent compares the
exact retained grant object; matching copied fields cannot revive it. Withdrawal
retains the destination but requires a new choice. Disposal is permanent; a new
owner cannot accept the previous owner's objects.

During invalidation, reads yield no current grant and presentation/acceptance/
destination updates are rejected. In particular, an abort callback cannot create
a replacement grant inside the revocation transition. Withdrawal and terminal
disposal are still honored during reflective/abort callbacks. Destination updates
that return false must be treated as unavailable by a future trusted caller;
there is no queued update or callback-based registry synchronization here.

No timer, background task, queue, I/O or provider/capture callback is owned by this
component. It retains only the current bounded context/choice/grant and controller,
not a history. Callers must release their own references/listeners after use.
Cancellation is cooperative: it cannot preempt arbitrary work, force another
component to erase buffers or retract bytes already received by a provider.

## Orchestration obligations and alternatives

A future main orchestrator must hold the exact grant, subscribe to its abort
signal, and recheck isCurrent after every await and immediately before each
capture/transmission side effect. It must independently obtain current provider
authorization/vision, request submission/cancellation/single-use state, target
incarnation/exclusions, Never and OS permission. Projecting consent fields into
evaluateScreenAuthorization does not replace the identity/freshness check.
Consent alone is not a request permit; this owner neither starts work nor owns
images. The orchestrator still needs atomic one-shot transitions and must clear
discarded image buffers on every completion/error/cancellation path. Do not
silently switch destinations or send text-only when screen context was intended.

Using renderer flags would promote preview state into authority. Comparing only
provider/account strings would revive old work after a switch away and back.
Persisting grants would add migration, revision and real-account decisions before
the required provider/consent UX exists. This in-memory component avoids those
changes while making the lifecycle testable with mocks. Real-account auth remains
P4; no sign-in method or provider terms decision is implemented here.

## Security, permissions and licensing review

| Path                       | Review and boundary                                                                                                     |
| -------------------------- | ----------------------------------------------------------------------------------------------------------------------- |
| Destination input          | Trusted main facts only; exact bounded primitive copies; invalid input revokes rather than retaining a previous grant   |
| Choice/grant output        | Main-only immutable context and AbortSignal; no renderer export or serialization-based acceptance                       |
| Revocation                 | Internal state cleared before notification; reentrant grant/update rejected; terminal disposal wins                     |
| Pending asynchronous work  | Mock tests prove stale-grant rejection; no claim that the component itself supervises capture or dispatch               |
| Sensitive content          | No prompts, pixels, auth tokens, URLs or window titles required; no logs/errors containing input values                 |
| Storage/egress/permissions | No files, settings migration, network, new IPC, capture calls, OS permission or telemetry                               |
| Dependencies/art/source    | Original TypeScript/tests; existing AbortController API, no SDK/sample copying, package, artwork or native build change |

The npm lockfile and 184-package license inventory are unchanged. Existing
application/dependency notices and the unresolved native redistribution review
remain; this is not legal or release clearance. Direct engineering review and
synthetic tests are not real-account or physical Windows consent evidence.

## Verification and next step

Tests cover absent consent, immutable copied facts, identity-only latest choice,
replay/foreign/preview rejection, idempotent snapshots, every destination/revision/
disconnect change, withdrawal, restart/disposal, strict malformed input,
reflective errors, synchronous and reentrant cancellation, delayed mock completion
after switch-back/renewed consent, and composition with independent policy denials.

Evidence: [P3-01b](../evidence/P3-01b.md). Next smallest slice after merge: compose
this owner with one-shot main request orchestration using mock capture/provider
only. Real consent UI, persistent Never/exclusions, target identity/UX and live
capture remain outstanding. G1 physical evidence, G2 promotion, G3 and OD-02 stay
open; intent recall remains 86.7%. The app still sends text only to the offline mock.
