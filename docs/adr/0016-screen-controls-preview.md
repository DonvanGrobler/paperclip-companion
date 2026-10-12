# ADR 0016 — Disclosure and screen controls before capture

Date: 10 October 2026 (Europe/Vienna). Status: provisional privacy/UX review,
issue #42, P3-01a. This implements the local controls preview, not destination-bound
consent or all of P3-01. OD-02 and G3 remain open.

## Decision

Add a collapsible disclosure to the existing chat, labelled screen context is
unavailable. It explains optional single-shot context, no continuous recording,
future provider/account consent, app versus provider retention, and exclusion
precedence. The existing provider line remains Offline mock, text only, no account.
There is no external privacy-policy link for a nonexistent provider. Actual provider
notices, target selection and consent must be reviewed before real sharing.

Try controls locally acknowledges only this preview. It is not labelled consent,
does not create a grant and never enters IPC or the authorization predicate. Use
text only is an equally available choice and withdraws the preview acknowledgement.
Include screen is per new message and only enabled after acknowledgement, when
Never is off and no reply is active. Never clears Include immediately; turning
Never off does not restore Include. Never is explicitly labelled for this window.
All three choices are renderer-memory UX state and reset on close or reload. They
are never written to shell settings, logs or storage. A future release must not
migrate this preview acknowledgement into permission to share a screen.

If Include is selected, Send/Enter does not invoke chatStart. Instead an inline
notice explicitly offers Send text only or Keep editing. Confirming sends the
current bounded draft to the existing offline mock and resets Include. Editing
the draft, changing scenario/controls, Clear or Retry invalidates the pending
confirmation. Keep editing preserves the draft and returns focus. Every submitted
message is labelled No screen attached, text-only preview. Retry remains text-only
and resets Include rather than borrowing a new-message screen choice.

Use text only or turning Never on also stops an active mock reply via the existing
cancel flow. No new IPC API or privileged option is added. Main still only accepts
run/prompt/scenario and constructs a text-only provider payload; injected image,
consent or screen-control fields are rejected. P3-04 classification and P3-05a
authorization remain unconnected to the application. Ordinary text-only messages
require no disclosure interaction.

## Accessibility and alternatives

Use native details/summary, buttons and labelled checkboxes with visible focus.
After acknowledgement focus moves to Include (or Never if Include is disabled);
withdrawal restores focus to Try controls locally. The fallback notice is an alert
and focuses its explicit confirmation button. No modal or focus trap is introduced.
The chat remains vertically scrollable when disclosure is expanded.

Enabling fake real consent would be misleading without a destination or capture
implementation. Silently ignoring Include would hide an important capability limit.
Adding main-owned consent persistence now would require provider/account lifecycle
and migration decisions beyond this preview. This reversible UX slice exercises the
planned controls without pretending those missing guarantees exist.

## Verification and remaining work

Unit tests cover state transitions and contradictory-state fail-closed behavior.
Native Electron tests cover keyboard acknowledgement/Include/fallback, no provider
start before explicit fallback (using the existing test-only counter), draft changes,
Never precedence, Clear/Retry, withdrawal cancellation, reload and fresh reopen.
Existing malicious IPC tests now also reject forged consent and screen options.
These tests do not prove real OS capture or real-provider consent safety.

No dependency, permission, account, network, artwork or source-license change.
Direct privacy review confirms fixed UI copy, no content logging, unchanged privileged
boundary and no saved choices. Human usability and screen-reader checks remain for
the grouped phase checkpoint. Destination-bound main-owned consent, persistent Never,
app exclusions, target UX and atomic request/capture/transmission integration remain
outstanding before full P3-01/P3-05 and G3 closure. Next resolve OD-02's capture
technology and target-selection ADR before implementing P3-02.
