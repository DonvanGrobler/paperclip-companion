# P0-02 dependency inventory

Reviewed 9 October 2026. Exact versions and integrity hashes are in package-lock.json. [Machine-readable metadata](P0-02-lock-inventory.json) covers all 184 locked package entries, including platform-specific optional packages. No missing license field was found. This metadata inventory does not replace release-artifact license verification.

| Direct package                 | Version | Declared license | Role                                              |
| ------------------------------ | ------- | ---------------- | ------------------------------------------------- |
| react, react-dom               | 19.3.0  | MIT              | Bundled renderer runtime                          |
| electron                       | 44.7.0  | MIT for Electron | Desktop runtime, installed as development tooling |
| vite                           | 8.3.4   | MIT              | Build tooling                                     |
| typescript                     | 6.0.3   | Apache-2.0       | Type checking                                     |
| @types/node                    | 24.19.1 | MIT              | Types                                             |
| @types/react, @types/react-dom | 19.3.0  | MIT              | Types                                             |
| eslint                         | 10.12.0 | MIT              | Lint                                              |
| @eslint/js                     | 10.0.1  | MIT              | Lint rules                                        |
| typescript-eslint              | 8.71.1  | MIT              | TypeScript lint integration                       |
| prettier                       | 3.9.9   | MIT              | Formatting                                        |
| vitest, @vitest/coverage-v8    | 5.0.3   | MIT              | Tests and coverage                                |
| @playwright/test               | 1.64.0  | Apache-2.0       | Electron smoke test                               |

Direct-license declarations were read from installed package manifests. Dependency sources and checksums are recorded in the npm lockfile. Version selection was checked against registry metadata and successful installation, type checking and build. The TypeScript parser's declared compatibility is >=4.8.4 and <6.1.0, so TypeScript 6.0.3 is pinned rather than forcing 7.x.

The lockfile also contains BSD-2-Clause, BSD-3-Clause, ISC, MPL-2.0 and BlueOak-1.0.0 declarations. In particular, lightningcss and its optional platform packages declare MPL-2.0 and minimatch declares BlueOak-1.0.0. They are build/test dependencies, not source copied into the application. They still need appropriate treatment if tooling is redistributed or modified. No blanket MIT claim is made.

Electron embeds Chromium, Node and other third-party components; the npm package's MIT field is not a complete inventory of its binary. Preserve Electron's bundled license/third-party notices and inspect the actual Windows distribution before a release. This issue produces JavaScript build outputs, not a distributable installer. P0-04/P6 must add automated license checking, notice generation and artifact-level verification.

npm audit at implementation time reported zero known vulnerabilities across the dependency graph. This is advisory-database evidence at one point in time, not a guarantee of security or a full review of the Electron binary. No private registry credentials, account credentials or provider SDKs were introduced.
