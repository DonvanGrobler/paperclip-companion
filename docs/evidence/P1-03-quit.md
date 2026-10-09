# P1-03 tray Quit and integration follow-up

Issue #28, phase P1. Human report: Donvan completed the Windows chat checklist;
all checks reportedly passed except tray Quit, which left chat open. Exact local
SHA, OS build and scaling were not restated. Quit remains failed/open; no agent
human test has been performed. This supersedes P1-03's earlier untested status.

## Findings and changes

PR #23 merged to main at 303c02e. PR #27 subsequently merged into the old tray
branch at 45b835c, so main 417af21 did not contain chat. This follow-up starts from
that main and merges 45b835c normally, preserving both histories and the maintainer's
prior conflict resolutions. No forced update or new dependent branch stack.
AGENTS now also requires checking that a merged child actually reached main.

The existing tray callback calls app.quit; its before-quit listener permits native
overlay closure. Chat has no close veto. Source inspection alone does not explain
the reported remaining chat. No speculative runtime fix or forced process exit
has been introduced. A separately running instance is possible, not confirmed.

Added three native regression scenarios: invoke the real installed tray Quit
callback with visible, minimized or preparing chat, while the character is hidden;
require both windows to close and the Electron process to exit. A test-only entry
point observes menu construction before loading the unchanged production bundle.
It is outside dist, adds no production IPC, and does not replace the Quit callback.
Existing ordinary close/reopen and renderer isolation tests remain.

## Verification and limits

- Baseline and changed `npm run check`: 79 unit tests, 100% main-process coverage,
  formatting, lint, strict types, renderer/main builds and 184-package license
  inventory passed locally.
- Local native Electron tests not run: this environment has no desktop. Required
  Windows CI results are recorded in the follow-up PR at its exact candidate SHA.
- Human Quit retest remains outstanding; use the focused steps in the
  [Windows checklist](../test-plan/P1-03-windows.md). Other reported passes are retained.
- Security/privacy/license review: production chat implementation remains the
  previously reviewed ADR 0010 code. No new IPC, logging, permissions, dependencies,
  networking, capture, stored chat, credentials or artwork. Test text is synthetic.
- Quality gate: G1 open; issue #28 cannot close merely because automation passes.
  Next smallest planned task: P1-04 position/visibility/preferences and DPI-aware
  recovery, after this shutdown report is resolved.
