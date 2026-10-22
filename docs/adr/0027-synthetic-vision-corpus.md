# ADR 0027: Synthetic visual corpus and future quality evaluation

Date: 21 October 2026. Issue #79 / P3-06. Provisional for maintainer
privacy/provenance review. No production capture or real-provider integration.

## Context and decision

Plan section 5.4 needs at least twenty synthetic image/question pairs with grounded
observations and repeated real-model evaluation in P4. P0's six schematic images
include two policy-denied scenarios; counting those as images delivered to a
vision model would contradict the no-image expectation. Mock scripted responses
cannot establish a real model-quality score.

Reuse the four eligible P0 images and author sixteen distinct schematic PNGs,
each paired with one question and explicit visible observations, helpful next
steps, unknowns and forbidden claims. Keep four no-image controls separately:
excluded target, ambiguous target, permission denied and unsupported vision.
Those controls specify expected feedback and zero image delivery, not model
grades or proof that the production policy/UI is implemented. A synthetic screen
label never grants real capture authorization.

Pin every PNG's SHA-256 and the entire question/rubric manifest, not just file
names. The catalog is `vision-v1` with baseline `not-run`. The unit suite checks
exact membership, distinct eligible images, references, annotations, uncertainty
and hostile-text coverage, dimensions, CRCs, bounded PNG structure/decompression
and absence of ancillary chunks. A corrupt private copy fails without dumping
pixels. Actual Electron main decodes every image and checks dimensions and opaque
BGRA landmarks on Windows CI. Neither decoder is the authoring tool.

Optional authoring uses already available Python/Pillow 12.3.0 and the project's
original P0 glyph geometry. Guard the historical generator's six calls with
`if __name__ == '__main__'` so the new generator can load those glyphs without
rewriting historical images. Add one original exclamation-mark glyph locally for
REF!/VALUE!. No outside font, copied asset or desktop input is used. The covered
field contains no hidden identifier; EXAMPLE.INVALID is literal synthetic text,
not a network destination. Generators do not update expected hashes.

## Evaluation, alternatives and limits

The [protocol](../test-plan/P3-06-vision-quality.md) supplies five separately graded
dimensions: visible accuracy, helpfulness, calibrated limits, no fabricated/unsafe
actions and hostile-text resistance. Only questions/images go to the future
authorized model, never answer annotations. Run each in a fresh conversation;
repeat complete runs and report individual results/variance. No automatic judge,
provider request, fake auth or model output is added now. The recommended 85%
substantive threshold is provisional for review; unsafe actions/privacy failures
cannot be compensated by other correct answers. Non-hostile cases do not inflate
the hostile-text denominator.

Reusing a single image for twenty questions would satisfy a count without the
intended range. Including blocked images in that count contradicts policy. Real
desktop screenshots add private data and cannot be regenerated. Pixel-glyph
schematics provide deterministic original inputs, but this same-author corpus is
not blinded/independent, representative of all apps or a physical Windows/DPI
test. A future broader evaluation remains necessary. Synthetic feedback and
prompt-injection expectations do not implement runtime capture or model safety.

## Privacy, licensing and remaining gates

Direct review covers authored text and pixels, answer-key isolation, withheld
image conditions, no automatic provider/target fallback, intentional hostile
text and the test decoder's output/cleanup. Only fixed public synthetic assets
are committed or decoded; no production screenshot persistence exception is
introduced. Test evaluation returns booleans; traces/screenshots/video remain
disabled. Buffers are cleared where owned; native/transport copies can remain
until collected. This is not forensic erasure or a provider-retention promise.

No production import, renderer/IPC change, network code, auth credential, OS
permission, telemetry, screenshot collection or dependency is added. Lockfile,
184-package npm inventory and shipped app code stay unchanged. Pillow is an
optional authoring tool already documented by P0; it is not bundled or required
in app/CI. New text/geometry/one punctuation glyph are original assistant-authored
project material, with the same pending original-code licensing decision as the
existing fixtures. No Microsoft/SDK/UI/font material is copied; no MIT adoption,
legal opinion or binary redistribution clearance is inferred.

P3-05b merged at adfaf605 with the exact reviewed green candidate tree, but GitHub
has no merged-main push run for that SHA; #77 retains that evidence gap. This
independent fixture task proceeds under plan section 4 with fresh complete PR CI,
not by relabeling the absent run as passed. G1 physical evidence, G2 promotion,
G3 real consent/target/native integration and 86.7% intent recall, and OD-02 remain
open. Production capture remains disabled. Next independent plan task after merge
verification: P4-01 current official provider/auth documentation and licensing
research; no real-account sign-in or phase promotion is authorized by this ADR.

Evidence: [P3-06](../evidence/P3-06.md). Maintainer privacy/provenance review remains
required before merging; no new routine human Windows checklist is requested.
