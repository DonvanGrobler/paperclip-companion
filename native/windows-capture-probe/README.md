# Windows synthetic capture feasibility probe

Issues #48, #50, #69 and #71, P3-02b/c and P3-03a/d. **Test executable only**, not a production capture helper.

Run from a Windows developer checkout:

```bat
native\windows-capture-probe\build-and-test.cmd
```

The script requires installed MSVC 14.51.36231 and Windows SDK 10.0.26100.0,
checks both exact versions, compiles with warnings as errors, prints DLL imports,
runs three original self-test and three selection self-test processes, and verifies missing/unknown/extra arguments exit 2.
No tools are downloaded. Output stays in ignored `dist/native-probe`; no binary
or image artifact is uploaded. The hosted image remains mutable.

The explicit `--self-test` mode is unchanged. The test creates its own red/blue window,
binds a WGC item, reads one BGRA frame through a WARP device and checks two color
landmarks. Each request uses one frame-pool buffer and stops its session before
CPU readback. Dimensions are capped at 1024 by 1024. Negative cases cover
pre-start cancellation, post-start cancellation, forced deadline expiry,
rejected-frame cleanup and a closed target. Fresh capture must still work.
The original item-closure/replacement-isolation assertions also remain.

Frame waits and nonblocking readback share a five-second polling budget. Native
calls themselves remain subject to the CI job timeout. WGC may internally produce
frames while active; only one is accepted per successful request. RAII closes
sessions, returned frames and pools independently; counters assert successful
close calls, not forensic erasure of GPU/driver memory. The OS border is preserved.

No external HWND, source enumeration, filename, app IPC, network or provider is
accepted. Images are never saved or printed in diagnostics. Diagnostics contain fixed stage
labels and numeric HRESULTs only. This does not verify physical Windows 11,
DPI/HDR, protected content, real driver hangs, external identity, consent or G3.
See [ADR 0019](../../docs/adr/0019-synthetic-single-frame.md) and the historical
[item-only ADR](../../docs/adr/0018-native-binding-probe.md).

## Synthetic binary transport test

After the native build above, run `npm run test:native-transport` on Windows.
The required Windows job runs it automatically; it fails if the executable or
capture support is missing. Linux does not run this explicit Windows suite.

The harness launches the fixed executable with `--transport-self-test` and owns
its stdin/stdout pipes. The helper rejects consoles/disk handles and invalid or
oversized context before creating its fixture. It echoes only validated opaque
IDs and sends one length-prefixed header plus tightly packed BGRA ContentSize
rows. Native capture resources and the fixture close before output. RAII unmaps
on exceptions and clears the helper's pixel buffer. The parent waits for EOF and
successful close, validates landmarks, then clears its owned buffer. No binary
output reaches console logs, files or CI artifacts. Only use the test harness;
the transport mode is not a production helper API.

The suite covers three fresh real frames, malformed/oversized context rejection,
unsupported CLI rejection, cancellation after output and a stalled stdin deadline.
The latter tests a blocked request reader, not a hung graphics driver. Parent
crash containment, external identity, DPI/HDR, policy and consent remain open.
See [ADR 0022](../../docs/adr/0022-native-synthetic-transport.md).

## Synthetic target selection

The same build script runs `--selection-self-test` three times. It selects
between two owned windows with the same title/process/thread and different
red/blue or green/yellow landmarks. Each selection holds its own unique fixture
lifetime and capture item, bounded title/ownership metadata and one-use request
generation. Selection itself starts no capture. Blocked/empty/oversized/changed
metadata, hidden/minimized/closed targets and stale/replayed requests yield zero
starts. Closing the fixture revokes its identity before asynchronous item-close
notification; a same-process replacement requires a fresh selection. A controlled
title change after capture starts must discard any candidate and close resources.
No pixels or metadata are output by this mode.

This is controlled native mapping, without an end-user picker or external-window
identity proof. It does not force HWND reuse or establish safe title/PID-based
authorization. Production target UX, native observation races, real exclusions
and consent remain unresolved. See [ADR 0023](../../docs/adr/0023-native-synthetic-selection.md).
