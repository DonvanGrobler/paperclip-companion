# Synthetic fixture corpus

These are fabricated schematic screens and scripted responses, never captures of a real desktop. They contain no user data, provider credentials, Microsoft artwork, logos, copied UI assets or bundled fonts. They are initial P0 test inputs, not the full P3/P4 capture or live-model evaluation corpus.

`screens.json` pairs six PNG files with fixed prompts, expected visible observations, authorization expectations and SHA-256 hashes. Each PNG is 640 x 360 RGB and uses independently specified pixel glyphs in `generate-screens.py`. The multiple-window case is a labeled schematic, not a real multi-monitor layout test. The sensitive-app case describes a deny expectation; the fixture itself does not implement access control. Hostile text in the prompt-injection screen is untrusted test data and must never become an application instruction.

`provider-cases.json` contains fixed event sequences for text success, image success, offline, expired authorization, rate limit, unsupported vision and cancellation. Events have no timing, random IDs or external endpoints. These are data records for future adapter tests, not a production mock-provider implementation. P2 will define the executable provider contract and integrate it into the UI.

## Validate and regenerate

Normal development/CI needs only `npm run check`. Fixture tests check PNG signatures/dimensions/hashes, exact corpus membership, image references, terminal event structure and policy expectations. PNG changes require deliberate manifest updates and visual review; CI never rewrites expected hashes.

Optional asset authoring uses Python 3 and **Pillow 12.3.0**, already available in the authoring environment. Pillow is not an app/npm/CI dependency. With that version installed, run `python tests/fixtures/generate-screens.py` from the repository root. Same-environment repeated generation was byte-identical. PNG compression bytes may vary across Python/zlib builds; committed images and hashes are authoritative. Inspect any regenerated changes before updating the manifest. Do not replace these with private screenshots.

## Provenance

Created independently for this repository on 9 October 2026 through code authored by the development assistant at the maintainer's request. Text, geometry, color choices and glyph bitmaps are explicitly present in the generator. No external font is loaded. Source/output follow the project's pending original-code licensing decision; no MIT adoption is implied.

The optional Pillow authoring tool is MIT-CMU licensed ([upstream license](https://github.com/python-pillow/Pillow/blob/12.3.0/LICENSE)); the library itself is not copied into this repository or distributed with the app. Pixel rectangles are drawn from original input instructions. Final fixture provenance/license review remains part of G0; runtime redistribution notices are separate.

## Complete chat error acceptance

`chat-errors.ts` gives independent message, role and status expectations for all
provider error codes plus INTERNAL. Its exhaustive type forces a new code to gain
an acceptance case. Unit tests cover partial-response retention and explicit fresh
retry; native Windows Electron tests use a separate test-only main-process entry
point to inject one error after a real chunk, then retry through the real mock.
The existing natural mock scripts remain tested separately. No fault switches are
available in the production app. See [P2 review](../../docs/evidence/P2-review.md).

## Screen-intent corpus

`screen-intent.json` contains 240 synthetic, project-authored prompts, split before
policy implementation into development and evaluation partitions of 120 each.
Each has 30 clear current-visual requests, 30 general questions, 30 ambiguous prompts
and 30 adversarial/meta/negated prompts. Labels express visual intent, not permission
to capture. IDs are partition-label-1-based-index. The pre-implementation corpus hash
is pinned in [metrics](../../docs/evidence/P3-04-metrics.json).

This same-author split is not a blinded or independent benchmark and includes related
phrasings. The first evaluation was not used to retune rules or labels. Both partitions
have zero false positives but 86.7% recall, below the 90% target. Known misses stay
text-only. Any later tuning must retain this set as regression material and introduce
a new unseen evaluation partition. No natural-language privacy guarantees are claimed.

Run `npm run evaluate:intent` for ID/count-only results. `npm run check` also checks
corpus integrity, control precedence, the negative cases and baseline prediction drift.
Capture is not enabled and the classifier is not connected to the app runtime.
