# P1 merged-baseline review before P2 exploration

Date: 9 October 2026. Baseline main **1ac70d7a5c7240d8b2647655ecf4113089f0674e**,
merging P1-04 PR #31. Requested by Donvan as part of more autonomous PR verification.

## GitHub and checks

- PR #31 merged into main, containing candidate f0c6b3b. No stranded child branch.
- Required PR checks passed; previous record is in #30/#31.
- [Merged-main Scaffold 37954587955](https://github.com/DonvanGrobler/paperclip-companion/actions/runs/37954587955): Ubuntu and Windows passed. Windows log confirms **97 unit tests and 30 E2E passed (41.5 seconds)**, zero audit vulnerabilities.
- [Merged-main Quality 37954587828](https://github.com/DonvanGrobler/paperclip-companion/actions/runs/37954587828): passed.
- Review 5472307861 reports Copilot could not review because of an error. No inline
  findings or requested changes were present when checked. This is **not** a bot
  approval. The direct engineering review below supplies the source review; it is
  not represented as an independent human review.

## Direct code/security review

Inspected preferences.ts, shell-preferences.ts, display-recovery.ts and their
tray/main/chat callers against the plan/ADR and native/unit test evidence.

- The settings path is constructed in main. Bounded input, schema reconstruction,
  size/capability-independent fixed fields, unknown-version preservation and fixed
  diagnostics prevent storing prompt/credential/screen content through this path.
- Serialized debounced writes and quit flush avoid async shutdown races. Quit flags
  precede window close/hide; no renderer quit/permission capability was broadened.
- Tray setup failure shows a usable window. Reset and native checkbox changes
  touch only app-owned settings/windows. Existing Quit closes all app windows.
- Geometry operates on DIP work areas, including negative coordinates, uses primary
  fallback and removes listeners when a window closes. Recovery never calls show
  or focus; explicit tray actions retain their intended focus behavior.
- Preload, CSP, navigation/network/permission denials and dependency lockfile are
  unchanged. No provider or capture is wired. No imported art or licensed source.

No blocking source defect found in this review. This is not a proof of all physical
Windows behavior: simulated display events do not prove hardware DPI/monitor removal,
and native callback invocation does not prove physical notification-menu interaction.
Multiple instances remain possible, with last-writer-wins settings; documented in
ADR 0011, not misrepresented as a single-instance fix for #28.

## Disposition

P1 engineering checks are green at the merged baseline. G1 remains open for grouped
human checks already documented. Donvan requested autonomous continuation; independent
P2-01 contracts/mock are permitted under plan section 4 without claiming G1 promotion.
No new manual retest is requested solely because P2-01 adds unused pure modules/tests.
