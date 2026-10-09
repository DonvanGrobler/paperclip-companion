# Run the Windows 11 foundation check

Allow about 20–30 minutes plus tool downloads. This checks the foundation preview, not the later animated character or chat. A successful report supplies the human Windows portion of G0. The maintainer must still review the remaining engineering and licensing items in [G0 status](G0-status.md) before closing the gate.

## 1. Prepare the machine

Use Windows 11 x64 and a normal user account. Check Settings → System → About for Windows edition/build and system type. ARM64 and Windows 10 are not validated targets yet.

Install Git for Windows and Node.js 24.19.0 if needed. Tool installation may need administrator approval, but run the following checks in a normal PowerShell window. Keep any existing development project separate; this procedure uses a fresh folder.

Open a new PowerShell window and check:

```powershell
git --version
node --version
npm.cmd --version
```

Expected Node version is v24.19.0. Set the project's npm version if necessary:

```powershell
npm.cmd install --global npm@11.9.0
npm.cmd --version
```

Expected npm version is 11.9.0. Use npm.cmd in PowerShell so a blocked npm.ps1 script does not require changing your execution policy. If a command fails, stop at that step and report the error rather than continuing with a partial install.

Tool sources: [Git for Windows](https://git-scm.com/downloads/win) and [Node.js downloads](https://nodejs.org/en/download). Use the matching version rather than silently upgrading to a different major release.

## 2. Get the exact verified preview

The default main branch does not yet contain the unmerged app. Clone its review branch and then select the exact tested commit:

```powershell
New-Item -ItemType Directory -Force "$env:USERPROFILE\source" | Out-Null
Set-Location "$env:USERPROFILE\source"
git clone --branch feat/p0-02-electron-scaffold https://github.com/DonvanGrobler/paperclip-companion.git "Paperclip G0"
Set-Location "Paperclip G0"
git checkout e353a458dd8e11e323c96add612aa58c978e72ad
git rev-parse HEAD
git status --short
```

If Paperclip G0 already exists, use a new folder name such as Paperclip G0 2; do not delete an existing checkout. The space in the folder name is intentional. Git's detached-HEAD message is expected because this test pins a commit; you do not need to create or push a branch.

Expected revision is e353a458dd8e11e323c96add612aa58c978e72ad, and git status --short should print nothing. This code passed [Windows/Linux CI](https://github.com/DonvanGrobler/paperclip-companion/actions/runs/37926396197). That Windows runner was Windows Server 2025, so your Windows 11 run adds distinct evidence.

## 3. Run automated checks on your machine

Run each command separately and inspect the result before proceeding:

```powershell
npm.cmd ci
npm.cmd run check
npm.cmd run test:e2e
npm.cmd audit --audit-level=high
```

Expected outcomes:

- Locked dependency installation finishes without errors.
- The combined check passes formatting, lint, type checking, **31 unit tests**, coverage and both builds.
- The Electron smoke test opens and closes a preview window and reports **1 passed**. It checks the bundled page and blocked access/navigation with synthetic inputs.
- The audit succeeds. The reference run reported zero vulnerabilities; new advisories may appear later, so report the actual result rather than assuming zero.

The first desktop launch may download the Electron runtime. Keep the network connected for these steps. No ChatGPT login, API key, private screenshot or developer secret is needed.

If something fails, copy the failing command and the relevant error. Avoid uploading full terminal history or environment dumps. These checks do not require personal data.

## 4. Exercise the visible shell

Run:

```powershell
npm.cmd start
```

The expected app is a regular window titled Paperclip Companion with “A little help, close at hand” and “Foundation preview.” It does not yet have a paperclip character, tray icon, chat box or sign-in control. Their absence is expected.

1. At 100% display scaling, confirm the text is readable and the normal close/minimize controls work. Resize the window and confirm content stays reachable, including by scrolling if needed.
2. Close the app. In Settings → System → Display → Scale, test 150% and 200%, relaunching the app each time. Check for clipped text, inaccessible content or a blank window. Restore your original scaling afterward. Record unavailable settings as not tested.
3. Close the app using Alt+F4. Confirm the terminal returns to its prompt. In Task Manager, confirm processes belonging to this test app exit; other Electron-based apps may legitimately remain open.
4. Launch again and leave it idle for one minute. There should be no app permission prompts, extra windows or visible unsolicited activity. This observation is not a network or screenshot-forensics test; the automated tests and source review provide separate boundary evidence.
5. Close it, temporarily disconnect Wi-Fi/Ethernet after the earlier successful launch, then run npm.cmd start again. The preview should still appear without an account. Close it and restore your network connection.

Do not test passwords, private documents, real provider accounts or capture behavior. Those features have separate later-phase tests.

## 5. Send the results back

Copy [G0-results-template.md](G0-results-template.md) into your reply here and fill it out. At minimum include the tested commit, Windows build/system type, Node/npm versions, each command's result and the visible-shell observations. A screenshot cropped to the preview window is optional. Do not include the rest of your desktop or private paths/log content.

If everything passes, the Windows manual portion can be marked verified for that exact commit. If the runtime or dependencies change before G0 closes, rerun affected checks on the final candidate. Full G0 closure also needs the engineering and review items in [G0 status](G0-status.md). Your result alone does not approve licensing, merge PRs or certify the future chat/capture features.
