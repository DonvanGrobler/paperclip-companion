# P0-01 — Reuse and license inventory

Date: 9 October 2026. Status: In review. [Issue #1](https://github.com/DonvanGrobler/paperclip-companion/issues/1).

## Recommendation

Start a clean Electron/TypeScript/React project as proposed in the development plan. Study the desktop-window and animation patterns below, but import none of these repositories' source, assets, generated animation data or dependency trees. This keeps the first scaffold small and avoids inheriting behavior outside this MVP. This recommendation is provisional pending maintainer review in [ADR 0001](../adr/0001-desktop-runtime.md).

This is a source inspection, not a legal clearance, security audit or successful execution of upstream applications. No upstream dependencies were installed, applications launched, credentials supplied or screenshots taken. Repository clones were used only as research inputs outside the project tree. The inventory distinguishes code licenses from asset provenance and service access.

## Revisions and maintenance observations

All references below use the inspected default-branch commit, not a moving branch. GitHub metadata was checked on the review date. All three repositories were unarchived. A last commit date and the presence of tests do not prove ongoing support or release quality.

| Repository | Inspected commit | Commit date | Observable maintenance/test state |
| --- | --- | --- | --- |
| felixrieseberg/clippy | [`edb47a46c1f0d9b36436e8537013dc91e8ade89f`](https://github.com/felixrieseberg/clippy/commit/edb47a46c1f0d9b36436e8537013dc91e8ade89f) | 15 November 2025 | Manifest version 0.4.3. Build/release workflow present. No tracked unit-test suite found. Its lint script runs Prettier in write mode, so it is not the non-mutating lint/format gate required here. |
| RaymonDev/clippy | [`8a490bb3509c11598b0d6aa8e3d2dc018d357cb8`](https://github.com/RaymonDev/clippy/commit/8a490bb3509c11598b0d6aa8e3d2dc018d357cb8) | 15 February 2026 | Nine tracked files, including a compiled Python cache. No tracked tests or CI workflow. Two unbounded minimum-version Python requirements, no dependency lockfile. |
| openai/sign-in-with-chatgpt-devkit | [`0a36fefeb913055c8c7a1a29b63d82b96b2e841a`](https://github.com/openai/sign-in-with-chatgpt-devkit/commit/0a36fefeb913055c8c7a1a29b63d82b96b2e841a) | 7 October 2026 | Workspace version 0.1.0. Local authorization/storage/response regression tests and example native tests present, plus generated notices and license-check commands. No tracked GitHub Actions workflow found. Example targets macOS, not Windows validation. |

The machine-readable [source manifest](upstream-sources.json) records full revisions, file paths and SHA-256 hashes of inspected evidence. It contains references and hashes only, not copied upstream source or assets.

## Felix Rieseberg's Clippy

Reviewed the README, license, package manifest, build workflow, window management, preload, IPC handlers, chat storage and animation helpers/catalog.

Architecture: Electron Forge with Vite, TypeScript and React. A transparent frameless companion window opens a separate chat surface. Local inference uses `@electron/llm`; the package also includes model downloading, persistent chat, update checking and retro CSS. This is the closest structural reference for the chosen stack, but those additional systems are unnecessary for the initial mock-first scaffold.

Useful concepts to implement independently include a small companion window, a separately recoverable chat window, typed bridge operations and named animation states. Do not copy its IPC surface wholesale. The inspected preload exposes generic state setters and model/file operations; this project requires narrow schemas, sender validation and negative-case tests. The inspected chat manager writes messages to disk and can log a malformed chat payload, which conflicts with this project's retention and logging defaults. Its URL handling and popover positioning are reference material, not evidence of our navigation or multi-monitor gates passing.

| Files or group | Observed license/provenance boundary | Project disposition |
| --- | --- | --- |
| `src/main/windows.ts`, `src/main/ipc.ts`, `src/renderer/preload.ts`, `src/main/chats.ts` | Root license grants MIT terms to project-authored code. No additional license header found in these inspected files. | Reference only. No code imported. Any future extraction needs file provenance review and retention of Felix Rieseberg's copyright and MIT notice. |
| `src/renderer/clippy-animation-helpers.tsx` | Project-authored helper under the root code license, coupled to the animation catalog. | Reference only. Write our own state logic and tests. |
| `src/renderer/clippy-animations.tsx`, `assets/animations/clippy/animations.json`, `assets/animations/clippy/map.png`, `src/renderer/images/animations/*` | The catalog is marked generated from the animation extraction pipeline. The root license explicitly excludes Microsoft character imagery and associated assets from its MIT grant. | Excluded, including generated timing/catalog data. Do not separate the sprites from their provenance or recreate the supplied catalog verbatim. |
| `assets/icon.*`, `assets/boot.gif`, website media and other images | Root code license does not provide blanket clearance for Microsoft imagery. Individual provenance was not established for every media file. | Excluded. Create independent artwork and icons later. |
| `98.css`, local-model stack and other dependencies in `package.json` | Package declarations are not a per-file or transitive license audit. | Not adopted. Audit only the dependencies actually selected and locked in P0-02/P0-04. |

Primary evidence: [license](https://github.com/felixrieseberg/clippy/blob/edb47a46c1f0d9b36436e8537013dc91e8ade89f/LICENSE.md), [manifest](https://github.com/felixrieseberg/clippy/blob/edb47a46c1f0d9b36436e8537013dc91e8ade89f/package.json), [windows](https://github.com/felixrieseberg/clippy/blob/edb47a46c1f0d9b36436e8537013dc91e8ade89f/src/main/windows.ts), [IPC](https://github.com/felixrieseberg/clippy/blob/edb47a46c1f0d9b36436e8537013dc91e8ade89f/src/main/ipc.ts), [chat persistence](https://github.com/felixrieseberg/clippy/blob/edb47a46c1f0d9b36436e8537013dc91e8ade89f/src/main/chats.ts).

## RaymonDev's Clippy

Reviewed all text files and the tracked file listing. Architecture: a largely single-file Python/Tkinter application using Pillow, requests and an Ollama service. A separate `.pyw` launcher suppresses the terminal. The source includes overlay dragging, animation, chat streaming, local intent detection and an action executor.

The independent overlay and keyboard/chat interaction concepts are relevant. Its command path is not: `_finish_and_run_actions` extracts action tags from model text, and `_execute_actions` dispatches them. `_screenshot` saves a PNG on the user's Desktop. These directly conflict with the advisory-only, memory-only screenshot design. Do not reuse its action detector as our screen-intent classifier.

| Files or group | Observed license/provenance boundary | Project disposition |
| --- | --- | --- |
| `clippy.py`, `clippy.pyw` | Root `LICENSE` is MIT, copyright 2026 Raymon. No separate license header found in inspected source. | Reference only. No port, code extraction or execution. |
| `assets/og_clippy.webp`, `assets/clippy_scratching_forehead.gif` | README identifies original Clippy art; no asset-specific redistribution permission was found in this repository. MIT code licensing does not resolve that provenance. | Excluded. No artwork imported. |
| `requirements.txt` | Declares requests and Pillow minimums, not a reproducible full dependency/license inventory. | Not adopted; Python stack not selected. |
| `__pycache__/clippy.cpython-314.pyc` | Generated binary, unnecessary for source review or our project. | Excluded. |

The README points to `../LICENSE.txt`, which is not the tracked root `LICENSE`. Record the actual file as evidence rather than trusting the broken relative link. Primary evidence: [license](https://github.com/RaymonDev/clippy/blob/8a490bb3509c11598b0d6aa8e3d2dc018d357cb8/LICENSE), [README](https://github.com/RaymonDev/clippy/blob/8a490bb3509c11598b0d6aa8e3d2dc018d357cb8/README.md), [application source](https://github.com/RaymonDev/clippy/blob/8a490bb3509c11598b0d6aa8e3d2dc018d357cb8/clippy.py).

## OpenAI Sign-in-with-ChatGPT DevKit

Reviewed the root README/license/manifest, workspace licenses and manifests, asset guidance and font licenses, and security documentation. This is a license and documented-architecture review; OAuth and cryptographic implementations were not audited or copied.

The documented architecture separates a local Node SDK from React components. The example delegates credential encryption to Electron's main process. It documents fail-closed storage errors, explicit connection removal, separate revocation reporting and mocked authorization/storage tests. Those are useful requirements for P4, not proof that our Windows integration is supported or working. The Paste Perfect example includes macOS native paste and Accessibility behavior outside our MVP.

| Files or group | Observed license/provenance boundary | Project disposition |
| --- | --- | --- |
| `packages/local/*`, `packages/react/*` and OpenAI-authored documentation | Root and workspace licenses are Sign-in with ChatGPT DevKit Noncommercial License v1.0, not MIT. | Do not copy or bundle in P0. Revisit OD-04 before P4. |
| `examples/paste-perfect/*`, `examples/component-gallery/*` | Both contain the same noncommercial license as the root. | No example code or UI copied. The native macOS application is not a Windows scaffold. |
| `assets/brand/*`, branded README visuals | Code license excludes OpenAI names, marks, logos and branded visual assets; asset guidance points to separate brand rules. | No logos or sign-in artwork imported. Review current rules if needed in P4. |
| `assets/fonts/inter-latin.woff2`, `assets/fonts/open-sans-latin.woff2` | Separate SIL OFL 1.1 files and a provenance record accompany the fonts. | Not bundled. Prefer system fonts initially; future distribution must preserve applicable notices. |
| `assets/icons/*` | Asset guidance identifies exported component-design icons, but does not establish a separate unrestricted license grant. | Not adopted; do not infer MIT from their SVG format. |
| Third-party dependencies | Separate notices and generated dependency inventory exist upstream. | Not inherited. Inspect exact installed artifacts if dependencies are later selected independently. |

The noncommercial license limits use and redistribution, requires notices and modification markings, and does not itself grant service access. It also distinguishes independent software communicating through an interface from modifications to the Work. Therefore this review does not assert that linking automatically relicenses all independent application code. It does mean a combined distribution cannot describe restricted DevKit portions as unrestricted MIT code. Free pricing alone is not the license's definition of noncommercial use.

The provisional route is independent implementation against official documentation, subject to a fresh P4 protocol, eligibility, service-terms and licensing review. No provider or model availability is certified by this inventory.

Primary evidence: [license](https://github.com/openai/sign-in-with-chatgpt-devkit/blob/0a36fefeb913055c8c7a1a29b63d82b96b2e841a/LICENSE), [README](https://github.com/openai/sign-in-with-chatgpt-devkit/blob/0a36fefeb913055c8c7a1a29b63d82b96b2e841a/README.md), [security documentation](https://github.com/openai/sign-in-with-chatgpt-devkit/blob/0a36fefeb913055c8c7a1a29b63d82b96b2e841a/docs/security.md), [asset guidance](https://github.com/openai/sign-in-with-chatgpt-devkit/blob/0a36fefeb913055c8c7a1a29b63d82b96b2e841a/assets/README.md).

## Current project inventory and remaining work

| Material in this change | Origin | Distribution/review state |
| --- | --- | --- |
| `AGENTS.md`, original plan content | User-supplied planning ZIP | Imported for this repository under the user's instruction. No third-party code/assets included in the pack. |
| README, research, ADR, evidence and tracker updates | Authored for this project | Project-wide license selection remains provisional. No MIT license declaration added by this issue. |
| Upstream source, sprites, fonts, binaries and packages | None imported | Zero adopted third-party runtime/build dependencies. This is not an application SBOM or a release license clearance. |

T-LIC-001 is only partially prepared: a research inventory exists, but no application build exists to inspect. G0 remains not evaluated. Before G0 can pass, P0-02/P0-04 must select supported versions, lock dependencies, check exact licenses and notices, and produce a real Windows build/test result. P1/P5 must record independent art provenance. P4 must resolve OD-04 and provider terms. P0-03 should establish the project license and contributor documentation without claiming third-party material is covered by that license.
