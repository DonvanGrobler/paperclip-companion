# ADR 0014 — Conservative local screen-intent evidence

Date: 10 October 2026 (Europe/Vienna). Status: provisional P3-04 exploration,
issue #38. Requires maintainer privacy review. G1/G2 promotion remains open and
G3 is not passed. Capture technology and target UX (OD-02) remain undecided;
this pure policy neither chooses nor implements them.

## Decision

Implement a stateless, deterministic function taking only a bounded prompt and
explicit submitted/hardExcluded/neverIncludeScreen/includeScreen booleans. All
five own fields are required. Reject unknown fields, wrong types, inherited-only
fields, accessors, non-plain prototypes, empty input and prompts over 2,000 UTF-16
code units before normalization. Copy validated data descriptors without invoking
getters; reflective failures return invalid-input without raw exception details.
The text budget is shared with provider validation through a small constants module;
the existing provider export is preserved. This lets Node's built-in TypeScript
runner evaluate the policy without loading the provider's non-erasable class syntax
or introducing another dependency.

Return only `text-only` or `screen-context-requested` and a fixed reason code.
Never return the prompt, matched text, title, target ID or private content. No I/O,
timer, provider request, screenshot reference or retained state exists here. The
module is not imported by main, preload or renderer. No application behavior changes.

After validation, hard exclusion wins, then Never include screen, then lack of
submission. Explicit Include screen on a submitted non-excluded request expresses
intent even for a general prompt; this follows the plan's override order. It does
not prove consent, a valid target, permission, provider vision capability or account
authorization. In particular, a caller setting these booleans cannot authorize
capture. A future trusted main-process request snapshot and independent P3-05 gate
must check all those conditions immediately before any capture/transmission.

Without an explicit override, the first English heuristic accepts a small task-word
grammar with an explicit visual anchor (for example, on my screen or in this window),
or a complete direct request such as read my screen. It rejects negation broadly,
quotes/code, reported or hypothetical instructions, covert/periodic/future-action
wording recognized by the guard, and common sensitive-content indicators. Non-ASCII
or invisible/control characters are not normalized into positive matches. Other
language coverage is not claimed; unsupported input stays text-only.

These lexical guards are heuristics, not a prompt-injection detector, sensitive-app
denylist or authorization boundary. They do not prove that a string is safe to act
on. The known-sensitive words list is not exhaustive. Hard exclusions must come
from independent target/privacy policy, not from guessing sensitivity from a prompt.
The broad negation guard intentionally also misses legitimate requests, such as
questions about a button not being visible. Unknown deictic references stay text-only
and can later support an explicit Include screen suggestion, not silent capture.

## Evaluation and limits

A 240-prompt synthetic corpus has predeclared 120-item development and 120-item
evaluation partitions, each containing 30 clear, general, ambiguous and adversarial
cases. Labels describe whether a request clearly asks for current visual context,
not whether capture is authorized. The six label clarifications happened before
policy implementation. Final pre-implementation corpus SHA-256 is
`290b167ba85aab54c3d424c2d08cf854d901534abee92921f0b1a16915ff5ed2`.
No language rule or label was tuned after evaluation. Direct review subsequently
hardened non-plain/accessor input rejection without changing corpus predictions.
These are same-author curated cases,
with related phrasings across partitions, **not an independently authored, blinded
or real-user benchmark**. The evaluation partition is held out from iterative rule
fitting only. Stronger independent evaluation is required before enabling capture.

Both partitions yield 26 true positives, zero false positives, four false negatives
and 90 true negatives: 100% observed precision, 86.7% recall. The plan's 90% recall
target is **not met**. The allowed fail-closed fallback is retained and all misses
are recorded by ID in P3-04-metrics.json. Neither a perfect observed precision on a
small synthetic sample nor a green CI run is G3 approval.

`npm run evaluate:intent` reports corpus version/hash, counts, target flags and
missed IDs, never prompt text. It fails on false positives. Full `npm run check`
also verifies corpus integrity and the recorded prediction baseline, so deteriorated
recall cannot silently pass by predicting text-only for everything. Baseline changes
require explicit review; the 90% target has not been lowered or marked satisfied.

## Alternatives and future work

A remote/LLM classifier would itself transmit prompt content and add latency,
service dependence and nondeterminism. Broad keyword matching would mistake quotes
or generic questions for capture requests. A more capable local language model or
parser remains a later option, not an implicit new dependency. The small auditable
baseline provides measurable misses without enabling a privacy-sensitive feature.

Before runtime use: independent consent/onboarding, target tracking and validation,
permission/capture policy, provider authorization, no-persistence handling and Windows
physical validation. Before any refinement based on observed evaluation misses, move
those cases into regression development and establish a new unseen evaluation set.
Do not keep calling a tuned-to partition held out. No dependencies, third-party assets,
licenses, account flows, permissions, storage or network paths are changed here.
