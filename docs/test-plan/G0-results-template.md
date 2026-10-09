# G0 Windows 11 test result

- Date:
- Tested commit (git rev-parse HEAD):
- Windows edition and build:
- System type (x64 / ARM64):
- Node version:
- npm version:
- Normal non-admin test session (yes/no):
- Fresh folder with a space in its name (yes/no):

| Check                                        | Pass / fail / not tested | Notes or relevant error |
| -------------------------------------------- | ------------------------ | ----------------------- |
| npm.cmd ci                                   |                          |                         |
| npm.cmd run check — expected 31 unit tests   |                          |                         |
| npm.cmd run test:e2e — expected 1 test       |                          |                         |
| npm.cmd audit --audit-level=high             |                          |                         |
| Preview launches and text is readable        |                          |                         |
| Resize/minimize/restore                      |                          |                         |
| 100% scaling                                 |                          |                         |
| 150% scaling                                 |                          |                         |
| 200% scaling                                 |                          |                         |
| Alt+F4 closes app and terminal returns       |                          |                         |
| Test app processes exit                      |                          |                         |
| One minute idle, no prompts or extra windows |                          |                         |
| Offline launch after initial online setup    |                          |                         |
| Original scaling and network restored        |                          |                         |

What felt confusing, broken or inconvenient?

Optional evidence: cropped app-only screenshot or redacted failing-command excerpt. Do not include a full desktop screenshot, credentials, private window titles or environment variables.

This is test evidence only. It is not automatic gate closure, a license approval or permission to merge.
