# P4-01: ChatGPT plan integration review

Reviewed: **22 October 2026**. Issue #81. Status: research for review, not a live
integration or legal clearance. [ADR 0028](../adr/0028-chatgpt-plan-integration.md)
records the provisional route; [P4-02 acceptance](../test-plan/P4-02-auth-contract.md)
defines the next offline work. No account, credential, model request or screenshot
was used. Mutable documentation must be rechecked before live wiring.

## Result and capability boundaries

The documented public-client route is a plausible fit for a personal local
Windows application. The recommendation is independently authored protocol
integration, with fake endpoints first and no DevKit code imported. This is a
technical proposal: OD-04, project licensing and service acceptance remain
maintainer decisions. A public repository alone does not establish an open-source
license. This repository has no adopted LICENSE and declares UNLICENSED.

| Area                             | Documented contract                                                                                                                                                                       | Project disposition / verification still needed                                                                                                      |
| -------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------- |
| Eligibility [S01]                | ChatGPT-plan integration is available for open-source/local personal tools; the docs identify eligible Plus/Pro accounts. Identity-only commercial integration has separate availability. | No account entitlement tested; do not equate a UI plan label with this permission or promise availability in every workspace/region.                 |
| Identity and host [S02]          | Registrations bind a user/workspace; a stable opaque host identifier represents an installation. Neither grants conversation access.                                                      | Keep registration, validated identity, host and authorization incarnation distinct. A supported UUID host ID is a provisional implementation choice. |
| Text and streaming [S06]         | Authorized account models can use the public Responses route, through terminal completion.                                                                                                | Future adapter only; current app remains an offline mock.                                                                                            |
| Image input [S07, S10]           | Images are supported when the selected model accepts them.                                                                                                                                | Availability, modality, consent and valid target must all pass. Unknown vision capability means no image.                                            |
| Tools and other modalities [S07] | This route has restricted tools/features and excludes audio/video inputs and Files uploads.                                                                                               | MVP exposes no model-driven desktop actions or hosted tools, regardless of upstream support.                                                         |
| Windows storage [S14]            | Electron provides OS-backed encryption in main; the pinned release exposes asynchronous APIs.                                                                                             | Real protected storage, restart and failure behavior still require implementation and Windows tests.                                                 |

## Sign-in contract [S03]

Use the system browser and a prepared HTTP loopback listener on
`127.0.0.1`, path `/auth/callback`. Ports can vary between attempts; keep the exact
URI within an attempt. Generate fresh state, nonce and S256 PKCE. Request
`openid profile email offline_access resource.invoke chatgpt.tokens.use.direct`
with resource `https://api.openai.com/v1`.

Initial registration uses `dynamic_agent_client`, the installation host ID and
the app's consistent name hint. Retain the issued callback client ID before code
exchange. Returning sign-in uses the saved issued ID; reject a conflicting
callback ID. Validate state even on denial. Granted token-response scopes, rather
than requested/callback scopes, determine permission.

| Operation               | Documented destination                                     |
| ----------------------- | ---------------------------------------------------------- |
| Authorization           | `https://auth.openai.com/api/accounts/authorize`           |
| Code exchange / refresh | `https://auth.openai.com/api/accounts/oauth/token`         |
| Trusted discovery [S04] | `https://auth.openai.com/.well-known/openid-configuration` |

Before accepting identity, verify the ID-token signature and issuer, issued-ID
audience, expiry and saved nonce; returning identity must match the selected
registration. Identity without the direct-use grant cannot start inference.
No client secret or partner API key belongs in this public-client flow. [S03]

The proposed implementation also follows native OAuth and OIDC validation
principles [S15]: use an external browser, bound transaction state and issuer keys.
Reject unsigned/untrusted tokens, replay, algorithm/key substitution and untrusted
key URLs. A reviewed verifier is required; decoding a JWT is not verification.
No production discovery/JWKS fetch or cryptographic integration was executed.

## Credential sessions and logout [S04, S05]

Keep each issued registration paired with its verified identity and credentials;
email is a display label, not a workspace or registration key. Serialize refresh
for a session, use its issued client ID, and replace the rotating credential set
together. The token reference currently specifies one-hour access tokens and
30-day refresh tokens renewed on successful rotation; derive expiry from the
actual response and account for `earliest_refresh_at` when supplied rather than
scheduling blindly.
Treat authentication metadata as opaque. [S04, S05]

On explicit logout, stop work and use the trusted discovery document's
`revocation_endpoint` to revoke the renewable session with the refresh token and
issued client ID. Clear local credentials even when remote revocation cannot be
confirmed, and report that distinction with ChatGPT Settings recovery. Retaining
the non-secret registration/host mapping does not retain authorization. Do not
invent a revocation URL or report remote success from local deletion. [S04]

For this project, revocation retries must remain bounded within the user-initiated
operation. No persistent retry queue or background sign-in is proposed. Account
switch, disconnect or expired authorization must invalidate old consent/session
handles and pending replies in the existing main owners. Prefer on-demand renewal
for an explicit operation; no idle renewal job is proposed.

## Models, images and HTTP requests

Discover the active account's catalog with its own bearer token at
`GET https://api.openai.com/v1/models`. The SIWC document describes a `models`
array: display entries with `visibility: list`, retain server ordering, show
`display_name`, and submit the selected `slug`. Refresh on account changes. The
document does not establish a vision flag in that catalog; visibility/name alone
must not enable screenshots. No model or entitlement is hardcoded here. [S06]

Send inference to `POST https://api.openai.com/v1/responses`. A partial text delta
or successful HTTP status is insufficient: success needs `response.completed`.
Handle failure, incomplete results and a stream ending early separately. A usage
failure can arrive after text has started. Do not use ChatGPT backend endpoints.
Disable automatic inference retries; the user explicitly retries. [S06]

The preview HTTP contract requires `store: false`, `stream: true` and array input.
Use developer instructions rather than explicit system-message items. Supply
needed context in the request; omit HTTP `previous_response_id`. Current
unsupported parameters include `temperature`, `top_p`, `max_output_tokens`,
`background`, `conversation`, `metadata` and `prompt`; the complete changing list
is in S07. Do not copy a generic SDK/default request body unchanged. [S07]

The image guide documents inline Base64 data URLs and Responses `input_image`
items. Proposed P4-03 transport uses one already-authorized in-memory PNG, keeping
the existing 5 MiB local byte budget and separately bounding encoded request size.
It adds no image URL hosting or Files API upload. General image-guide examples
do not override SIWC's endpoint/preview restrictions. [S07, S10]

`store: false` is a request contract, not a promise that OpenAI retains no data.
This review does not establish the selected account's image retention/training
treatment or a privacy notice adequate for release. Those remain live-use review
items; do not silently substitute generic API-key policy assumptions.

## Failure and usage behavior [S08, S09]

Admission failures can have a `detail` response rather than a standard error
object. The error guide distinguishes authorization/policy denials, usage limits,
temporary availability and unsupported capabilities. A limit can be app-specific;
do not infer reset time or remaining plan allowance. Remote disconnection has no
current push notification; stop on confirmed invalid credentials, while temporary
infrastructure errors alone must not erase them. Do not rotate accounts or
silently change providers/billing. [S08]

Our future adapter must map bounded allowlisted statuses/codes into safe local
outcomes. Raw response bodies, callback URLs, provider exception text and tokens
must not enter UI diagnostics or logs. The existing ProviderError union is small;
any new recovery states require their own reviewed contract and tests. Retry
suggestions never schedule a second image request automatically.

The UX guidance calls for recognizable sign-in, visible ChatGPT-plan use and
access to ChatGPT Usage settings, including on usage limits. Its example paid
plans and credits are illustrative, not features to add to this free hobby app.
No branding assets are adopted by this review. [S09]

## Windows and version verification [S14]

The application pins Electron **44.7.0**. Its version-specific safeStorage docs
and installed declarations expose `isAsyncEncryptionAvailable`,
`encryptStringAsync` and `decryptStringAsync`. Prefer a narrow main-owned adapter
after app readiness; unavailable encryption, decryption failure or storage errors
must fail closed. No plaintext fallback. Inspect actual result/rotation behavior
and test synthetic credential round-trips before using real tokens.

Windows uses DPAPI, which protects against other users but not arbitrary software
running under the same logon. Do not promise protection from same-user malware.
Latest documentation describes deprecation beginning in Electron 45; that is not
the pinned 44.7 API baseline and does not justify an incidental upgrade. No actual
credential-store execution is claimed. The DevKit's macOS paste example does not
validate our Windows app. Linux/macOS real-provider support is outside this task.

## Code licenses, service terms and deferred decisions

The DevKit remains at inspected commit
`0a36fefeb913055c8c7a1a29b63d82b96b2e841a` (7 October 2026). Root and
`packages/local/LICENSE` share Git blob
`f27a6ee381e19380b09a4267a703525e678a6761`: Noncommercial License v1.0. It limits
use/redistribution by purpose, requires license/notices and modification markings,
and excludes branded assets and service access. Free price or nonprofit status
alone does not settle permission. Independent interface use is distinguished from
modifying the Work; that does not remove restrictions from copied portions. No
SDK/example/source/font/icon code is imported, and no legal conclusion about a
combined distribution or future commercialization is made. [S11]

SIWC terms separately require the app's own identity, supported authorization,
secure local token custody, user-controlled requests and permission/disclosure.
They prohibit pooling, limit circumvention and serving someone else through one
user's plan, require a no-charge SIWC path, and reserve access enforcement.
They incorporate Terms of Use and Service Terms and reference Usage Policies;
branding and a legally adequate privacy notice also matter. Reading these pages
does not accept them for the maintainer or establish product compliance. [S12]

S13 records incorporated policy references and the regional-terms pointer.
Deployment-specific applicability and legal obligations remain human review.
Preview availability is not guaranteed by Service Terms; Usage Policies include
privacy and misuse constraints. An independent implementation avoids importing
restricted SDK material, but still needs applicable service permission. [S13]

| Deferred item                                           | Tracking / effect                                                                                                                             |
| ------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| Original code/fixture licensing and provenance          | #79 human review kept on Backlog by the maintainer on 22 October; P0's source-license decision remains unresolved. CI/merge do not adopt MIT. |
| OD-04 implementation and provider terms                 | ADR 0028 is provisional. Review before production SIWC wiring/distribution; offline protocol work may continue.                               |
| Real account, protected credentials, text/vision/logout | P4-05 human checkpoint plus P4-02/03/04 automation; no live result yet.                                                                       |
| Real target/consent/physical displays and recall        | OD-02/G1/G2/G3 remain open; production capture disabled, intent recall 86.7%.                                                                 |

## Sources actually fetched

All web references were fetched on **22 October 2026**. They are mutable current
documents, not immutable protocol guarantees. No page or SDK sample is copied
into the project. The pinned GitHub license/version evidence is separate.

| ID  | Primary source                                                                                                                                                                                                                                                                                                                                                                                      | Review purpose                                                                                                                                      |
| --- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| S01 | [SIWC quickstart](https://developers.openai.com/siwc/quickstart), [cookbook eligibility](https://developers.openai.com/cookbook/articles/sign-in-with-chatgpt#usage-policy-and-terms)                                                                                                                                                                                                               | Eligibility and identity versus plan usage                                                                                                          |
| S02 | [OSS overview](https://developers.openai.com/siwc/token-sharing-open-source)                                                                                                                                                                                                                                                                                                                        | Client/workspace/host boundaries                                                                                                                    |
| S03 | [Registration](https://developers.openai.com/siwc/token-sharing-open-source/sign-in)                                                                                                                                                                                                                                                                                                                | Endpoint, callback, grant and identity contract                                                                                                     |
| S04 | [Accounts and sessions](https://developers.openai.com/siwc/token-sharing-open-source/profiles-and-sessions)                                                                                                                                                                                                                                                                                         | Refresh, discovery-based revocation, account separation                                                                                             |
| S05 | [Token reference](https://developers.openai.com/siwc/token-sharing-open-source/token-reference)                                                                                                                                                                                                                                                                                                     | Response fields, rotation and documented lifetimes                                                                                                  |
| S06 | [Models and inference](https://developers.openai.com/siwc/token-sharing-open-source/models-and-inference)                                                                                                                                                                                                                                                                                           | Catalog schema, public route, terminal events                                                                                                       |
| S07 | [Preview limitations](https://developers.openai.com/siwc/token-sharing-open-source/preview-limitations)                                                                                                                                                                                                                                                                                             | Required/unsupported fields and modalities                                                                                                          |
| S08 | [Errors](https://developers.openai.com/siwc/token-sharing-open-source/errors-and-recovery)                                                                                                                                                                                                                                                                                                          | Admission, usage and disconnection recovery                                                                                                         |
| S09 | [UI/UX](https://developers.openai.com/siwc/ui-ux-guidelines)                                                                                                                                                                                                                                                                                                                                        | Plan-use disclosure and usage controls                                                                                                              |
| S10 | [Images and vision](https://developers.openai.com/api/docs/guides/images-vision)                                                                                                                                                                                                                                                                                                                    | Inline image format only; general examples have a broader scope                                                                                     |
| S11 | [DevKit LICENSE](https://github.com/openai/sign-in-with-chatgpt-devkit/blob/0a36fefeb913055c8c7a1a29b63d82b96b2e841a/LICENSE), [local LICENSE](https://github.com/openai/sign-in-with-chatgpt-devkit/blob/0a36fefeb913055c8c7a1a29b63d82b96b2e841a/packages/local/LICENSE), [README](https://github.com/openai/sign-in-with-chatgpt-devkit/blob/0a36fefeb913055c8c7a1a29b63d82b96b2e841a/README.md) | Same pinned revision as P0; license unchanged. README blob 15eb8a72c94e8bb3afba3b809dc4639777bb9fd4                                                 |
| S12 | [SIWC terms](https://openai.com/policies/sign-in-with-chatgpt-terms/)                                                                                                                                                                                                                                                                                                                               | Code-license/service-access separation                                                                                                              |
| S13 | [Terms of Use](https://openai.com/policies/row-terms-of-use/), [Service Terms](https://openai.com/policies/service-terms/), [Usage Policies](https://openai.com/policies/usage-policies/)                                                                                                                                                                                                           | Incorporation and policy boundaries; Terms of Use effective 1 January 2026 links distinct EEA/Swiss/UK terms; Service Terms updated 16 October 2026 |
| S14 | [Electron 44.7 safeStorage](https://github.com/electron/electron/blob/v44.7.0/docs/api/safe-storage.md), [latest docs](https://www.electronjs.org/docs/latest/api/safe-storage)                                                                                                                                                                                                                     | Versioned Git blob 30d76a8b9bd888f988d95be3feb0927a12037d49 plus installed electron.d.ts API inspection; no runtime proof                           |
| S15 | [RFC 8252](https://www.rfc-editor.org/rfc/rfc8252.html), [OIDC Core 3.1.3.7](https://openid.net/specs/openid-connect-core-1_0.html#IDTokenValidation)                                                                                                                                                                                                                                               | Native browser/PKCE and identity-validation principles; no sample code copied                                                                       |
