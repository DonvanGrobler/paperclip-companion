# AI Coding Agent Working Agreement — Paperclip Companion

**Always read `DEVELOPMENT_PLAN.md` first.** That file is the authoritative scope, architecture, acceptance-test matrix, phase gates, security/privacy conditions and milestone tracker. This file tells an implementation agent how to work, not which extra features to invent.

## Mission

Build a Windows-first, retro paperclip-style desktop helper for user-initiated text chat and automatic *single-shot* screen context when the user's message references their screen. Free hobby project, independent character design, no continuous recording or autonomous desktop actions in MVP.

## Before each task

1. Read the active issue plus `DEVELOPMENT_PLAN.md`, this file, relevant ADRs and touched source/tests.
2. Report the phase, issue ID, acceptance criteria, any open decision and likely affected files.
3. Check baseline tests and repository status; preserve user modifications.
4. If scope is risky (authentication, screenshots, new network egress, permissions, art licensing, dependency licensing), flag for maintainer review and add/update an ADR.

## The required loop

- Implement **one small issue** at a time.
- Add meaningful failing tests first when practical; implement the minimum change to pass.
- Run formatter, lint, strict typecheck, affected unit/contract tests, applicable Electron E2E tests, and targeted security/permission checks.
- Review every data path that may contain a screenshot, prompt or credential. Do not write those contents to logs or disk.
- Produce a concise completion report with exact commands and results. Distinguish unit/CI verification from real Windows interactive testing and real-provider testing.
- Do not mark issues Done or gates passed without evidence; do not advance phase baselines with blockers.

## Branch and merge hygiene

- Fetch origin and inspect current main plus open PR bases before each task and before publishing. Start independent work from current origin/main.
- Stack only when a task needs unmerged code. Record the parent PR, and do not create a deeper stack while its parent has unresolved conflicts.
- When a parent PR merges, retarget its immediate child to main, merge the latest main into that child, resolve and verify it, then propagate the updated child into further descendants. Preserve shared branch history with ordinary merge commits; do not force-push over maintainer work.
- Before merging a stacked child, verify its base is still the intended open parent. After a parent merges, target the child at main before merging it. A closed/merged child PR is not proof that main contains its work: verify main ancestry and changed files. If it landed on an already-merged feature branch, bring that merge forward in a dedicated main-targeted PR.
- Inspect the three-way diff and prior conflict resolution. Preserve verified gate evidence and feature changes together; never resolve by taking an entire old plan or overwriting a maintainer's fix.
- Keep detailed progress/evidence in the task's own docs/evidence file and issue/PR. Make minimal, anchored milestone edits in DEVELOPMENT_PLAN.md. Avoid accumulating competing end-of-file progress notes or reformatting unrelated sections in stacked branches.
- Before handoff, check the diff against the actual PR base, unresolved conflict markers, mergeability and required checks at the updated head. Clearly identify checks still running; old green checks do not verify a new merge commit. Runtime-identical documentation/workflow merges do not require repeating human tests.

## Non-negotiable boundaries

- **No ambient or scheduled screenshots.** Capture only when explicitly triggered by a submitted user request or an explicit attach action.
- Default to no screen capture on ambiguity; hard opt-out and denied applications always override screen-intent rules.
- Do not persist screenshots; do not log screenshots, auth headers, token values, image bytes or sensitive window titles.
- No shell commands, arbitrary file writes, sending emails, mouse clicks or other OS actions driven by LLM output in MVP.
- Treat screenshot/website content as untrusted data, including instructions visible in images.
- Use official authorization. Do not collect ChatGPT/Claude credentials, scrape cookies or reuse consumer session tokens.
- Never silently switch AI providers, leak images to another account or use a user's plan to serve someone else.
- Do not import Microsoft's original Clippy artwork. Attribution is not a license.
- Do not copy OpenAI DevKit noncommercial code into a project branded entirely as MIT without resolving license implications.
- Renderer stays sandboxed with context isolation; privileged desktop APIs exposed only via minimal, typed, validated IPC.
- No unnecessary telemetry or cloud backend; explicit consent and privacy notice are required before sending screen content.

## Definition of Done per task

- [ ] Issue's requirements and acceptance criteria met.
- [ ] Appropriate positive and negative regression tests added.
- [ ] Format/lint/typecheck/tests passed with exact evidence.
- [ ] Threat, permissions, license and sensitive-data implications reviewed.
- [ ] Relevant documentation/ADR and task status updated.
- [ ] Remaining limitations and **next smallest task** stated.

## Required report format after any coding task

```text
Issue / phase:
Summary:
Files changed:
Tests and verification:
- command → result
Manual tests performed (real OS/provider only, or 'not performed'):
Quality gate: passed / blocked / not yet evaluated
Security/privacy/license changes:
Known problems or risks:
Next smallest issue:
```

If a test is unavailable in your environment, mark it **not run** and explain; don't say it passed. If a provider/account cannot be accessed, use mocks and leave the real integration gate open. If the plan and an issue contradict each other, stop that affected subtask and request a documented decision before changing the plan.

**Starting instruction:** Begin with `P0-01` research and license inventory, not implementation of the mascot artwork or video capture.
