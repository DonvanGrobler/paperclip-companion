# ADR 0007 — Reproducible quality and inventory gates

Date: 9 October 2026. Status: Provisional, pending CI/security/license-policy review. Issue: [#9](https://github.com/DonvanGrobler/paperclip-companion/issues/9).

## Context and decision

P0-02 already checks format, lint, strict types, unit coverage, builds and Windows Electron behavior. P0-04 adds explicit dependency audit and inventory checks, weekly Dependabot proposals for npm and GitHub Actions, and secret scanning. There is no auto-merge or dependency-version change in this task.

Use the MIT-licensed Gitleaks **CLI** 8.30.1 directly, downloaded from its official release and checked against its pinned SHA-256 before extraction. The separate commercially licensed Gitleaks Action is not used. The CLI runs locally on the GitHub runner and needs no third-party account or application credential. No findings artifacts or PR comments are emitted; console findings use full secret redaction. A synthetic private-key marker checks that detection fails with the designated exit code before repository history is scanned.

The dependency check compares the entire lockfile graph against the recorded P0-02 inventory, including optional packages for other operating systems. It rejects missing/unknown license declarations, missing pins, new/removed packages and version/license/integrity/development-role changes. Current known declarations are a metadata baseline, not an approved license allowlist for release. Deliberate upgrades must update evidence and undergo applicable review. Do not regenerate the inventory automatically in CI to hide drift.

Workflow permissions remain contents-read only. No pull_request_target execution, developer tokens, live providers, screenshots or credential fixtures are added. Checks run on every PR regardless of target branch. Dependabot configuration becomes active on the default branch; this stacked PR alone does not prove update proposals are enabled.

## Alternatives and limitations

A new npm license-auditing dependency would grow the graph for a small deterministic comparison, so a local typed script and negative tests are sufficient here. This does not analyze license texts or embedded Chromium binaries; P0 review and P6 distribution notices remain separate. No root project license is adopted.

Repository rulesets and platform security settings require administration access unavailable through the current connector. Document required names and leave enforcement unverified; green jobs alone are not branch protection. Contract and fixture checks will be added when P0-05/P2 introduces those contracts rather than adding empty passing jobs.

## Evidence and references

- [Gitleaks CLI release 8.30.1](https://github.com/gitleaks/gitleaks/releases/tag/v8.30.1). Linux x64 archive SHA-256: `551f6fc83ea457d62a0d98237cbad105af8d557003051f41f3e7ca7b3f2470eb`, from official release asset metadata.
- [CLI MIT license](https://github.com/gitleaks/gitleaks/blob/v8.30.1/LICENSE).
- [Dependabot configuration reference](https://docs.github.com/en/code-security/dependabot/working-with-dependabot/dependabot-options-reference).
- [Required status checks](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches#require-status-checks-before-merging).

Validation and current limitations are recorded in [P0-04 evidence](../evidence/P0-04.md).
