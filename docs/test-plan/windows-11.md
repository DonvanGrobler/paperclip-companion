# Windows 11 validation matrix

P0-02 establishes this matrix. All human-run rows below are **not performed**. Record actual edition/build, CPU architecture, display scaling, Node/npm versions, commit, commands and redacted evidence when executing them. Do not substitute a hosted Windows Server runner for Windows 11 interactive validation.

## Automated scaffold checks

CI runs npm ci, npm run check and npm audit --audit-level=high on Linux and Windows hosted runners. Windows additionally runs npm run test:e2e. That smoke test launches a temporary profile, renders the shell, checks absence of Node/bridge access, and exercises blocked renderer fetch, popups and navigation. Main-process unit tests check sandbox/permission/session wiring. Automated results must be read from the exact commit's Actions run before marking passed.

## Human Windows 11 x64 baseline

Use a currently supported Windows 11 installation and a standard, non-administrator account. Record the actual version; this document is not a statement of Microsoft's lifecycle dates.

| Case   | Setup / action                                                       | Expected result                                                               | Status        |
| ------ | -------------------------------------------------------------------- | ----------------------------------------------------------------------------- | ------------- |
| W11-01 | Fresh clone in a path containing spaces; documented Node/npm; npm ci | Locked install succeeds without developer credentials                         | Not performed |
| W11-02 | npm run check                                                        | Format, lint, strict typecheck, tests and both builds pass                    | Not performed |
| W11-03 | npm start at 100% scaling                                            | Foundation preview appears with readable text and ordinary window controls    | Not performed |
| W11-04 | Repeat at 150% and 200% scaling                                      | Content remains readable, scrolling available if needed                       | Not performed |
| W11-05 | Keyboard only; Alt+F4                                                | Shell closes and its Electron processes exit                                  | Not performed |
| W11-06 | Launch after disconnecting network, with dependencies installed      | Bundled shell still appears; no login needed                                  | Not performed |
| W11-07 | npm run test:e2e                                                     | Smoke/isolation checks pass with temporary synthetic profile                  | Not performed |
| W11-08 | Leave shell idle for one minute                                      | No app permission prompts, captures, provider activity or unsolicited windows | Not performed |

## Later-phase matrices

P1 adds tray recovery, off-screen prevention, mixed-DPI displays, docking, keyboard chat and position restoration (T-UI-001/002). P3 adds foreground identity, protected/excluded apps, target closure, virtual desktops and screenshot exclusion (T-CAP-001 through 014). P4 adds real authorization and account-state tests. P6 adds clean install/uninstall, artifact checksums and signing disclosure. None of these are verified by the foundation preview.
