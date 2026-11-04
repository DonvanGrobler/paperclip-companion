# ADR 0036: One-attempt loopback listener and bounded browser launch

4 November 2026. Issue #105 / P4-02g. **Proposed** for maintainer
authentication/privacy review. Extends [ADR 0029](0029-siwc-auth-transaction.md)
and [ADR 0035](0035-siwc-token-exchange.md). No production wiring.

## Proposed decision

Add isolated main-only capabilities to create one loopback listener and launch
the fixed authorization URL using a trusted, injected opener. Neither capability
is exposed to the renderer, preload or application entry point. The tests use
real local TCP sockets and a fake browser opener, transaction hooks and provider;
they do not open a browser or contact the provider. A future composition must
create the listener before beginning authorization, bind its callback to the
transaction owner and pass the same redirect URI to the transaction. It must
also coordinate listener closure with any user-visible transaction lifetime.

Bind only `127.0.0.1` on an operating-system-assigned port. Accept one callback
for the exact `/auth/callback` path after the transaction has armed the listener
with its fresh state. Require a numeric loopback peer, exactly one matching Host
header, GET without a body, bounded request target, valid ASCII/escapes and one
well-formed state. Compare state in constant time. Deny other requests without
consuming the attempt, so an unrelated local request cannot by itself invalidate
a valid callback. A state-matching request is single-use even if the transaction
rejects its other fields; the existing transaction independently validates the
whole callback and is the only component that can advance authorization.
The listener does not interpret a handler return value as authentication success.

Both browser replies are fixed, non-reflecting text, with no-store, restrictive
CSP, no-referrer, no-sniff and frame-denial headers. A 200 reply only tells the
user to return to the application; it is not an authentication-success claim.
Do not expose callback URLs, codes, state, hints, tokens or native error details
through logs or UI. Callback values exist briefly in main-process memory. Clearing
an owned state buffer is not a promise to erase JavaScript strings, browser
history or operating-system copies.

Bound the listener to 16 concurrent connections, 24 KiB HTTP headers, a five
second socket-idle limit and a default two-minute total lifetime (at most five
minutes). Check the monotonic deadline at startup, arming and request handling
even if the timer is delayed. Close on owner/transaction abort, timeout, explicit close, callback or
native error; destroy other sockets while allowing an accepted fixed response to
flush. Late native events must not re-establish authority. A malicious local
process can still consume connection slots or deny service; same-user malware,
a compromised browser or main process, and on-path service compromise are outside
this boundary. No DNS hostname or custom proxy is used for the listener.

The launcher reserves one attempt and accepts only the exact official HTTPS
authorize endpoint and the current transaction's explicit field set. Validate
unique fields, fixed scope/resource/response type, loopback redirect, client and
host identifiers, PKCE/state/nonce shapes and conditional registration hints.
Arm the listener before calling the trusted opener. The launcher closes it on
invalid input, failed arming, abort, exception or a ten-second launch deadline;
late opener completion cannot turn a stopped attempt into success. It cannot
retract a URL already handed to the operating system or close an external browser.
Detailed opener errors are replaced with a fixed failure. User cancellation and
the existing transaction's own timeout remain independently authoritative.

## Sources and outstanding decisions

- [Official Sign in with ChatGPT registration and sign-in](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)
  describes starting a loopback callback listener before browser authorization,
  state/PKCE and reusing the issued client ID. The exact limits and error policy
  above are proposed local choices, not provider guarantees.
- No OpenAI DevKit code or assets are copied. No dependency, license inventory,
  schema, IPC, production provider, workflow or app entry point changes. The
  project remains UNLICENSED; dev-tool advisory [#102](https://github.com/DonvanGrobler/paperclip-companion/issues/102)
  is unchanged.

Real browser/provider behavior, consent, account eligibility, identity/storage
composition, refresh/logout, P4-05, OD-04 and the authentication/privacy
decisions still require review and verification. G1–G4 and the human backlog
remain open; a merged implementation or automated review is not approval.
