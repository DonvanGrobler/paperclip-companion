# P4-02: Offline authentication acceptance plan

Prepared by P4-01 / issue #81 on 22 October 2026. **Proposed future tests, not
executed results.** [ADR 0028](../adr/0028-chatgpt-plan-integration.md) and the
dated [provider review](../research/P4-01-provider-review.md) explain the boundaries.
T-AUTH-001–003 and T-CAP-014 are acceptance mappings, not current live verification.

## Next smallest slice: P4-02a

Implement an unwired main-owned sign-in transaction contract with trusted fakes
for exchange, verification and persistence. Author original tests against these
project requirements before implementation. No production HTTP listener, browser,
discovery request, real JWT verifier, encrypted file, provider or renderer bridge.
Use synthetic account labels and ephemeral test-only credential markers; assert
fixed outcomes and side-effect counts rather than dumping private inputs.

| Case                                       | Proposed expected result                                                                                                                    |
| ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Idle, invalid submission or disposed owner | Zero browser/exchange/store work; fixed safe outcome                                                                                        |
| Start / overlap                            | One bounded active attempt; immutable registration/redirect context; no duplicate launch                                                    |
| Freshness                                  | Independently generated transaction state, nonce and PKCE material; retained only for their attempt                                         |
| Callback boundary                          | Wrong state, replay, duplicate fields, denial, wrong path/host/port or expired attempt cannot trigger exchange                              |
| Registration                               | Initial success needs an issued client ID; returning success keeps its selected registration and rejects replacement                        |
| Exchange failure / malformed grant         | No accepted account or partial credential commit; raw exceptions and callback values never escape                                           |
| Verification boundary                      | The fake verification capability must succeed before account acceptance; mismatched account or missing required validated identity fails    |
| Direct-use permission missing              | Valid identity remains distinct from inference eligibility; no provider request or manufactured scope                                       |
| Protected-commit failure                   | No connected/inference state; preserve the previous valid selected account and return only a fixed code                                     |
| Cancel / timeout / switch / disposal       | Abort cooperative work, reject late results and prevent stale callbacks or writes from reactivating the attempt                             |
| Reentry / delayed hooks                    | Reserve ownership before callbacks; only the active generation can publish results                                                          |
| Diagnostics / cleanup                      | No token, prompt, image, raw provider body or authorization URL in output/snapshots/logs; release owned private state on all terminal paths |

Keep persistence behind an atomic conditional-commit contract: a fake's success
must not stand in for safe real filesystem behavior. Any later asynchronous store
must prevent a cancelled/superseded transaction from installing credentials, not
merely suppress its UI result. Define the transaction's cancellation/commit
linearization explicitly before attaching a persistent adapter.

Run strict types/lint, focused unit tests and branch coverage with explicit deny
cases. New privacy/auth logic retains the plan's >=90% branch target. Keep test
fixture generation, request-size/time bounds and error enumeration explicit;
do not create a permissive production configuration just to inject fakes.

## Later P4-02 responsibilities

These are acceptance requirements for subsequent bounded implementation work,
not features silently included in P4-02a:

- Real OIDC validation using reviewed issuer-key/algorithm policy; signed fake
  issuer/JWKS tests for bad signature, issuer, audience, nonce, times, key rotation
  and malicious key/algorithm substitution. Parse-only or injected-verifier tests
  do not count as cryptographic verification.
- Main-only Windows credential adapter on the pinned Electron API: unavailable
  encryption, corrupt data, write failure, interrupted/atomic replacement,
  restart and native round-trip with synthetic secrets. No token through IPC or
  plaintext configuration. Review dependency licenses before adding a verifier.
- Serialized refresh, rotating-token replacement and stale-session rejection;
  transient transport failures preserve valid credentials, terminal refresh
  failures remove unusable ones. Bounded trusted clocks and response limits.
- Explicit logout and discovery-based session revocation, including already
  revoked tokens, network failure and local deletion without remote confirmation.
  No credentials survive a completed local disconnect; no queued background retry.
- Before production adapters: audit fixed destinations/TLS/redirects, callback
  listener lifecycle, browser launch, account selection, grant/session invalidation,
  privacy notice, service acceptance, branding and OD-04's implementation choice.

Later P4-03/04 tests must exercise account-specific model discovery, unsupported
vision with zero image delivery, required HTTP fields, terminal SSE events,
post-delta errors, cancellation and no automatic retry/provider change. Keep
bounded raw errors private. These do not authorize capture or resolve OD-02/G3.

## Human checkpoint stays separate

P4-05 needs explicit user-controlled sign-in with an eligible account on Windows,
real protected restart, a text request, an authorized synthetic image request,
cancel/limit/disconnect behavior and confirmed logout/revocation outcomes. Record
redacted facts rather than credentials. Real screen capture additionally needs
the deferred G3 target/consent/display evidence. No routine human checklist is
requested for P4-01 or the isolated P4-02a fakes.
