# Security reporting and development checks

This project is an unreleased foundation preview. No provider, screenshot capture, credential storage or installer is implemented yet. Do not submit real prompts, credentials or private desktop screenshots as test fixtures.

For a suspected vulnerability, use GitHub's private vulnerability reporting option if it is available on this repository. If unavailable, contact the maintainer to arrange a private channel before sending sensitive details. Do not put secrets or exploit payloads exposing private data in a public issue. Private vulnerability reporting has not been verified enabled.

For an accidentally committed credential, revoke or rotate it first. Removing a file does not remove a credential from Git history. Secret-scanning findings are redacted; no scan report artifacts are uploaded by the project workflows.

Run `npm run check` and `npm audit --audit-level=high` locally. CI additionally runs the pinned Gitleaks CLI against the full fetched Git history, with a synthetic detection self-check. Scans can miss secrets or vulnerabilities and do not replace review. Dependency license metadata checks also do not clear the runtime's bundled components for release.

See [quality gate setup](docs/test-plan/P0-04-quality-gates.md) for required check names, reproduction, limitations and maintainer configuration still needed.
