# Windows capture-item feasibility probe

Issue #48, P3-02b. **Test executable only**, not a production capture helper.

From a Windows developer checkout with Visual Studio C++ tools and Windows SDK
10.0.26100.0 installed, run from the repository root:

```bat
native\windows-capture-probe\build-and-test.cmd
```

The script locates Visual Studio with its installed `vswhere`, selects the MSVC
14.51 toolset family and exact SDK, compiles with warnings as errors, prints the
selected toolset and imported DLL names, runs three synthetic lifetime tests,
and verifies unsupported/missing CLI arguments return exit code 2. Build/runtime
failure is fatal. Binaries/objects stay under ignored `dist/native-probe`; no CI
artifact is uploaded. The exact patch-level compiler is recorded, not yet locked
for a reproducible release. No SDK/compiler is downloaded by the script.

Each self-test creates window A, binds its WGC item, destroys A and waits at most
three seconds for its Closed notification while pumping messages. It then creates
window B in the same process, verifies A's item remains closed and B's is live,
and destroys B. RAII revokes subscriptions and releases items/windows/apartment.
The asynchronous callback owns its flag safely even during teardown. API calls
themselves are subject to the enclosing CI job timeout.

No HWND, filename or arbitrary target can be supplied. There is no source
enumeration, session/frame pool, pixel conversion, image output, provider call,
network, hook, elevation or persistent target state. Stdout/stderr contain fixed
test messages only. Compiler paths/version and DLL names are build metadata.

This is native automated evidence only. It does **not** prove HWND reuse safety,
atomic external-window binding, permission behavior, pixel isolation, picker
identity/exclusion mapping, physical Windows 11 behavior or G3. In particular,
the test cannot force Windows to recycle the same HWND and must not claim it did.
Next: a separate owned-window one-frame/cleanup probe after this build and item
lifetime path is verified. Review [ADR 0018](../../docs/adr/0018-native-binding-probe.md)
before extending its boundary.
