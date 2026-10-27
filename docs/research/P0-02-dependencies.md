# P0-02 dependency inventory

Originally reviewed 9 October 2026; dependency versions reviewed again 20 October 2026 for issue #62 ([maintenance evidence](../evidence/dependency-maintenance-2026-10-20.md)), then security-patched on 27 October for issue #88 ([security evidence](../evidence/security-maintenance-2026-10-27.md)). Exact versions and integrity hashes are in package-lock.json. [Machine-readable metadata](P0-02-lock-inventory.json) covers all 185 locked package entries, including platform-specific optional packages. No missing license field was found. This metadata inventory does not replace release-artifact license verification.

| Direct package                 | Version | Declared license | Role                                              |
| ------------------------------ | ------- | ---------------- | ------------------------------------------------- |
| jose                           | 6.2.13  | MIT              | Unwired main ID-token verification                |
| react, react-dom               | 19.3.0  | MIT              | Bundled renderer runtime                          |
| electron                       | 44.9.3  | MIT for Electron | Desktop runtime, installed as development tooling |
| vite                           | 8.3.4   | MIT              | Build tooling                                     |
| typescript                     | 6.0.3   | Apache-2.0       | Type checking                                     |
| @types/node                    | 24.19.2 | MIT              | Types                                             |
| @types/react, @types/react-dom | 19.3.0  | MIT              | Types                                             |
| eslint                         | 10.12.0 | MIT              | Lint                                              |
| @eslint/js                     | 10.0.1  | MIT              | Lint rules                                        |
| typescript-eslint              | 8.71.2  | MIT              | TypeScript lint integration                       |
| prettier                       | 3.9.10  | MIT              | Formatting                                        |
| vitest, @vitest/coverage-v8    | 5.0.4   | MIT              | Tests and coverage                                |
| @playwright/test               | 1.64.0  | Apache-2.0       | Electron smoke test                               |

Direct-license declarations were read from installed package manifests. Dependency sources and checksums are recorded in the npm lockfile. Version selection was checked against registry metadata and successful installation, type checking and build. The TypeScript parser's declared compatibility is >=4.8.4 and <6.1.0, so TypeScript 6.0.3 is pinned rather than forcing 7.x.

The lockfile also contains BSD-2-Clause, BSD-3-Clause, ISC, MPL-2.0 and BlueOak-1.0.0 declarations. In particular, lightningcss and its optional platform packages declare MPL-2.0 and minimatch declares BlueOak-1.0.0. They are build/test dependencies, not source copied into the application. They still need appropriate treatment if tooling is redistributed or modified. No blanket MIT claim is made.

Electron embeds Chromium, Node and other third-party components; the npm package's MIT field is not a complete inventory of its binary. Preserve Electron's bundled license/third-party notices and inspect the actual Windows distribution before a release. This issue produces JavaScript build outputs, not a distributable installer. P0-04/P6 must add automated license checking, notice generation and artifact-level verification.

npm audit at implementation time reported zero known vulnerabilities across the dependency graph. This is advisory-database evidence at one point in time, not a guarantee of security or a full review of the Electron binary. No private registry credentials, account credentials or provider SDKs were introduced.

The 27 October review changes only Electron 44.7.0 → 44.9.3 and downloader-transitive Undici 7.30.0 → 7.30.1 within @electron/get 5.1.0's existing ^7.24.4 optional range. Both installed package notices retain MIT; [exact artifact/license evidence](2026-10-27-dependency-licenses.json) records SHA-512 package pins and SHA-256 notice hashes. No package paths, dependency ranges, engines or dev/optional classifications changed. These runtime security patches do not establish human display/DPI validation or full Electron binary redistribution clearance.

P4-02b / issue #90 adds exact jose 6.2.13 as one production-classified dependency for the future main verifier. It has zero transitive dependencies and no install lifecycle; all existing lock entries remain unchanged. [Artifact/license review](2026-10-27-jose-license.json) records the inspected MIT notice and integrity pin. The new verifier remains imported only by tests, so current application bundles/renderer notices do not change. Preserve this library notice when production wiring eventually bundles it.
