# Contributing

Read [DEVELOPMENT_PLAN.md](DEVELOPMENT_PLAN.md), [AGENTS.md](AGENTS.md) and the active issue before changing code. The plan defines scope and phase gates. Use one small issue and focused PR at a time. Do not claim a phase passed merely because generated code or mocked tests exist.

## Set up and verify

Use Node 24.19.0, npm 11.9.0 and the committed lockfile. See the [Windows walkthrough](docs/test-plan/G0-windows-walkthrough.md) for the current verified review commit; main may not contain unmerged work.

```sh
npm ci
npm run check
npm run test:e2e
npm audit --audit-level=high
```

The Electron test needs a desktop session. State explicitly when it cannot run. Linux checks do not prove Windows behavior, and a hosted Windows runner does not replace a Windows 11 human session. npm start rebuilds and opens the shell. Do not run npm update as a substitute for the locked installation.

## Prepare a change

1. Give the issue a stable plan ID, scope, exclusions, dependencies, acceptance criteria, affected modules, risk class and evidence requirements. Use Backlog, Ready, In progress, In review, Verified, Done or Blocked.
2. Record the clean baseline and preserve existing work. Introduce meaningful failing tests where practical, then implement only the selected behavior. Documentation changes do not need dummy unit tests.
3. Run the applicable checks. Include exact commands/results and distinguish local, CI and manual evidence. Never skip a failing test to obtain a green result.
4. Update the tracker and relevant [ADR](docs/adr/template.md). Review source/asset/dependency provenance and data paths before opening the PR.
5. Use the PR template and leave unverified gates open. Privacy, authentication and licensing changes need maintainer review. Merge dependent PRs in order after the applicable checks and review are satisfied.

## Safety and scope

The renderer must stay sandboxed and isolated. Privileged APIs require narrow validated contracts. Do not expose generic IPC, shell execution or filesystem access. Keep screenshots user-triggered, single-shot and in memory when that feature is implemented. Never log prompts, tokens, image bytes or private window titles. Use synthetic fixtures and mock credentials only. No autonomous desktop actions, ambient capture, provider switching or consumer-session scraping belongs in the MVP.

Do not add Microsoft character assets or copy restricted DevKit source. Preserve upstream copyright and license notices for any specifically reviewed reuse. Use the [license register](docs/licensing/register.md) and record exact revisions/files, not just repository-level labels. A publicly accessible repository is not blanket permission for every asset in it.

## Evidence and reports

For a bug, include the commit, OS/build, reproduction steps, expected/actual behavior and a redacted error excerpt. Never post credentials, private screenshots or full environment dumps. For G0 Windows checks, use the [results form](docs/test-plan/G0-results-template.md). A public issue is not an appropriate place to disclose a credential or exploitable secret.

There is no CLA or signed-off-by requirement established by this project. The project license is still under review. Contributions must be your own or have documented permission; do not infer consent to a future license from a PR being opened. The [MIT proposal](docs/licensing/project-license-proposal.md) remains a proposal until the maintainer adopts it.
