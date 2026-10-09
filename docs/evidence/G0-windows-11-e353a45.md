# Windows 11 human validation — e353a45

Reported by Donvan Grobler on 9 October 2026. This is maintainer-performed Windows testing, not agent or CI testing.

- Commit: `e353a458dd8e11e323c96add612aa58c978e72ad`.
- Platform: Windows 11 Pro, build 26200, x64.
- Result: **human Windows 11 portion verified** for this commit.
- Node.js and npm version checks: reported passed against the walkthrough requirements (Node 24.19.0, npm 11.9.0); raw version output was not included in this report.

| Check                              | Maintainer result                           |
| ---------------------------------- | ------------------------------------------- |
| Repository and pinned commit       | Pass                                        |
| Node.js and npm versions           | Pass                                        |
| Dependency installation            | Pass                                        |
| 31 unit tests and coverage         | Pass                                        |
| Formatting, lint, types and builds | Pass                                        |
| Dependency security audit          | Pass                                        |
| Window rendering and scaling       | Pass                                        |
| Resizing, minimizing and closing   | Pass                                        |
| Idle and offline operation         | Pass                                        |
| Automated Electron E2E             | **Fail — native visibility reported false** |

The maintainer explicitly confirmed all manual Windows tests passed. The automated failure remains separate and must be fixed and verified, despite successful interactive rendering and earlier CI passes. Exact audit counts and raw logs are not reconstructed.

Follow-up: [issue #7](https://github.com/DonvanGrobler/paperclip-companion/issues/7) adds bounded native-window visibility synchronization while retaining the final visibility assertion. No manual repetition is required for this unchanged application commit. If application code or Electron dependencies change, assess affected checks before accepting a new baseline. The corrected E2E still needs a Windows 11 rerun; Windows CI is additional evidence, not a replacement for that result.

G0 remains open pending automated verification, P0-04/P0-05, applicable reviews and final candidate evidence. No private desktop images are committed.
