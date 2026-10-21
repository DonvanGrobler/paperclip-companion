# ADR 0026: One-shot screen request orchestration with mocks

Date: 21 October 2026. Issue #77 / P3-05b. Provisional main-owned component for
maintainer privacy review. No production capture, real consent or provider wiring.

## Decision and scope

Compose ADR 0015's independent policy, P3-04 intent classification and ADR 0025's
consent owner in one in-memory request owner. Exercise capture and dispatch with
trusted injected mocks, including the existing PNG encoder and offline vision
provider. This independent P3 work proceeds under plan section 4; OD-02's external
window identity/exclusion mapping remains blocked, so the application stays
text-only. A validated-looking ticket does not establish native pixel provenance.

run accepts exactly run/prompt/includeScreen own data properties. Run is a positive
safe integer, prompt is nonblank and at most the existing 2000 UTF-16 budget, and
Include is boolean. Reject accessors, inherited/extra/string/symbol fields and
reflection errors without invoking getters or exposing values. Reserve the sole
active slot before parsing or callbacks, including reflective reentry. A valid
attempt consumes its run even if denied; duplicate/older runs cannot start again.
A retry needs a new explicitly submitted run. The counter is scoped to this owner,
not persistent or global. Disposal is terminal.

This is a trusted main API, **not authenticated IPC or evidence of a user gesture**.
A future validated action adapter must supply main-issued run IDs and genuine
submission provenance; no policy, consent, target or provider assertions may be
taken from renderer payloads. No existing chat IPC or preview state is changed.

## Policy, consent and capture binding

The trusted synchronous readPolicy hook supplies exactly five opaque handles
(providerId/accountId/authorizationId/targetId/policyId) and six strict booleans
(hardExcluded/neverIncludeScreen/providerAuthorized/visionSupported/targetAllowed/
permissionGranted). Handles use the existing 1–128 ASCII alphanumeric/underscore/
hyphen grammar. They are internal registry identities, not tokens, titles, URLs or
account labels. Missing or malformed facts mean unavailable, not fabricated grants.
Only plain/null-prototype data snapshots are accepted; values are copied.

The target handle must represent a validated target incarnation. The authorization
handle must match the consent owner's current session. The policy handle must
change on every relevant policy/selection/capability/permission transition, even
when the old values later return. The owning registry must also call invalidate
on observed changes for prompt cancellation. This owner cannot discover native
events or detect changes omitted by its trusted registry. Actual observation,
native identity and permission integration are outstanding.

Intent classification sees only the submitted prompt and current overriding
controls. Ordinary/ambiguous/negated/adversarial or excluded/Never requests return
a fixed text-only reason and invoke neither image hook. This component does not
send ordinary text itself; existing text chat remains separate. Intended screen
context that fails a prerequisite returns stopped, with no silent text fallback,
target/provider fallback or automatic retry.

For a screen request, retain the exact current grant, subscribe to its abort
signal and freeze a ticket containing run plus the five bound handles. Read fresh
policy and compose the complete independent authorization predicate immediately
before capture. Check grant identity/session and policy incarnation separately;
matching provider/account strings cannot revive a revoked grant. No cached
eligibility result is reusable.

The trusted capture hook receives the ticket and AbortSignal and transfers exactly
ticket/mimeType/bytes on completion. The returned ticket must be the same object,
not a copy; this is correlation, not an OS identity proof. Accept only image/png
and a non-shared, nonempty Uint8Array view within the existing 5 MiB payload budget.
Copy only its view into private dispatch storage and clear the transferred source
view. No title/path/prompt/target metadata is added to PNG bytes. This layer checks
MIME/size/ownership, not PNG decoding or metadata stripping; a future capture
adapter must use the reviewed encoder/format contract. Tests independently decode
the real synthetic PNG path.

After asynchronous capture, read current policy and recheck the original grant,
destination/session/target/policy, exclusions, Never, authorization, vision and
permission immediately before dispatch. No await separates that check from the
single dispatch invocation. Reserve dispatchStarted before calling the hook, so
reentry cannot launch a duplicate. A successful result follows dispatch completion.

Adapters are trusted capabilities: pin the ticket's actual target/destination,
honor cancellation and revalidate before any side effect following their own
internal awaits. Do not dispatch via an unbound global current provider, reconnect
to a different account or relabel old helper pixels. The owner cannot police
arbitrary code inside a hook. No such real adapter is installed by this change.

## Lifetime and cancellation

One active operation, no queue. Default deadline five seconds; trusted construction
allows 1–30000 ms. Cancel, invalidation, consent revocation, timeout or disposal
sets a fixed stopped result and aborts cooperative work. First stop reason wins.
Cancel targets only the active run. No timer, polling or request exists while idle.
Stop clears its timer; grant listeners detach when actual work completes.

The returned stopped result includes dispatchStarted. If true, some data may
already have reached the destination: do not claim cancellation retracts bytes or
that nothing was sent. A thrown dispatch also conservatively reports an attempt.
Errors expose fixed capture-failed/dispatch-failed codes, never exception text.
The future UI must map fixed outcomes to clear feedback; it is not implemented here.

Keep the active slot until outstanding capture/dispatch promises actually settle,
even after the caller receives a stopped result. Discard and clear late output.
Dispatch borrows the private view until its promise settles; do not clear it while
that borrower may still read it. Finally clear owned source/private views and
release the slot on success, rejection or cancellation. Clear recognized exclusive
source views on invalid MIME/ticket/shape/size too, without reading accessor data.
Shared or inaccessible storage is not accepted or claimed exclusively owned.

A noncooperative adapter that never settles leaves the owner busy and may retain
its bounded input. The deadline bounds result acceptance, not synchronous callback
execution, CPU, an external process or all native/provider allocations. Hard
termination needs separately reviewed supervision. The owner retains at most one
accepted source/private image pair within its payload budgets, not a history.
Capture/provider-owned copies and allocator/OS remnants are outside its cleanup;
this is not forensic erasure or a provider-retention promise.

## Review, alternatives and remaining gates

Using the classifier as authorization, caching a predicate result, accepting
renderer booleans or reusing matching account strings misses lifecycle changes.
Releasing a busy slot immediately on cancellation permits overlapping abandoned
work. Zeroing a still-borrowed image can corrupt an active upload. This design
keeps these responsibilities explicit and testable before real integration.

Direct security/privacy/license review covers submission provenance, strict data
validation, side-effect ordering, reentry, policy/consent revocation, destination/
target binding, byte ownership and fixed error/result paths. No logging, image
file/cache, telemetry, network implementation, OS permission, new IPC, credentials,
dependency, native build input or artwork is added. The lockfile and 184-package
inventory remain unchanged. Original TypeScript/tests, no copied SDK/sample code.
Existing notices and native redistribution review still apply; no legal/release
clearance or privacy-gate waiver is inferred.

Evidence: [P3-05b](../evidence/P3-05b.md). No live Windows target, physical display,
real-provider or human consent test is performed. G1 physical evidence, G2
promotion, G3 and OD-02 remain open; classifier recall remains 86.7%. After merge
and main verification, the next independent plan task is P3-06's synthetic visual
fixture/response-quality corpus, while real target/consent integration remains
blocked by the documented decisions and evidence requirements.
