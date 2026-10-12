# Windows synthetic capture feasibility probe

Issues #48 and #50, P3-02b/P3-03a. **Test executable only**, not a production capture helper.

Run from a Windows developer checkout:

```bat
native\windows-capture-probe\build-and-test.cmd
```

The script requires installed MSVC 14.51.36231 and Windows SDK 10.0.26100.0,
checks both exact versions, compiles with warnings as errors, prints DLL imports,
runs three self-test processes and verifies missing/unknown arguments exit 2.
No tools are downloaded. Output stays in ignored `dist/native-probe`; no binary
or image artifact is uploaded. The hosted image remains mutable.

Only explicit `--self-test` is accepted. The test creates its own red/blue window,
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
accepted. Images are never saved or printed. Diagnostics contain fixed stage
labels and numeric HRESULTs only. This does not verify physical Windows 11,
DPI/HDR, protected content, real driver hangs, external identity, consent or G3.
See [ADR 0019](../../docs/adr/0019-synthetic-single-frame.md) and the historical
[item-only ADR](../../docs/adr/0018-native-binding-probe.md).
