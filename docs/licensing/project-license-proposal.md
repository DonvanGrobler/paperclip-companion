# Proposed project license

Status: **Proposed, not adopted**. P0-03 review artifact dated 9 October 2026.

The development plan allows MIT for independently authored application code. The recommended choice is the standard [MIT License](https://opensource.org/license/mit) for original project code and documentation, with a proposed copyright notice of “Copyright (c) 2026 Donvan Grobler and contributors.” Confirm the attribution and documentation scope during maintainer review.

MIT permits broad use, modification and redistribution, including commercial reuse, subject to preserving the required notice, and includes a warranty disclaimer. The project can remain a free hobby project while recipients have those permissions. This proposal does not restrict others to noncommercial use.

This is not a grant of rights in third-party dependencies, Microsoft character art or OpenAI DevKit source. Those retain their own terms and provenance requirements. The [register](register.md) records the boundaries.

## Adoption procedure

1. Maintainer reviews this concrete proposal and confirms the original-material scope and attribution.
2. Add the unmodified standard MIT text as root LICENSE with the approved notice. Update package.json and the root package-lock.json metadata to MIT in the same reviewed change. Keep private: true unless npm publication is separately requested.
3. Update README, CONTRIBUTING and this decision record so they no longer describe the choice as pending. Preserve separate third-party notices and provenance.
4. Re-run metadata/format checks and record the reviewed commit. Do not mark distribution-level T-LIC-001 passed from this step alone.

No approval is recorded here. A request to run a usability test does not by itself adopt a license or authorize merging unrelated review work. Until adoption, the existing package marker remains UNLICENSED and no blanket open-source license claim is made.
