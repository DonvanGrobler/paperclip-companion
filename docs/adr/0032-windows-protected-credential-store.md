# ADR 0032: Stage encrypted Windows credentials before synchronous commit

27 October 2026. Issue #92 / P4-02c. **Proposed** for maintainer
authentication/privacy review. Extends [ADR 0029](0029-siwc-auth-transaction.md)
and [ADR 0031](0031-siwc-identity-verification.md). Production auth remains unwired.

## Decision proposed

Provide one main-only Windows store with a trusted absolute private local
directory and Electron's native safeStorage capability. Main must create it after
app readiness, under its eventual single-instance ownership. No app entry point,
preload or renderer imports this helper. There is no configuration to enable it
from the UI, no token IPC, new network destination, dependency or source reuse.

Use the pinned **Electron 44.9.3** asynchronous APIs:
`isAsyncEncryptionAvailable`, `encryptStringAsync` and `decryptStringAsync`.
Encryption must report exactly true; errors and unsupported platforms fail
closed. Never use a plaintext fallback or setUsePlainTextEncryption. The exact
[pinned documentation](https://github.com/electron/electron/blob/v44.9.3/docs/api/safe-storage.md)
was read on 27 October (blob `30d76a8b9bd888f988d95be3feb0927a12037d49`).
Its Windows asynchronous provider uses DPAPI: protection from other OS users,
not applications already running as the same user. No same-user malware,
administrator, memory-forensics or secure-deletion protection is claimed.

## Schema and private restoration

Encrypt the entire JSON envelope: exactly version 1 plus one record containing
issuer, subject, clientId, hostId, accessToken, refreshToken, idToken, scopes and
expiresAt. No identity/account labels, tokens or schema fields are plaintext in
the installed file. Accept only own data fields from plain/null-prototype records;
reject accessors, inherited/extra/symbol fields and reflective exceptions. Copy
the accepted fields before async work and freeze restored records and scopes.

Issuer is fixed to https://auth.openai.com. Client and host bounds match the
transaction; subjects use printable ASCII up to 255 characters. Tokens are
printable ASCII, nonempty and at most 16 KiB each. Access/refresh can be explicit
null; null access requires null expiry and cannot carry both direct-use scopes.
Otherwise expiry must be a positive integral millisecond date within JavaScript's
date range. Scopes are unique valid OAuth scope strings, at most 2048 entries and
4096 characters joined. Serialized plaintext is at most 64 KiB UTF-8; ciphertext
is nonempty and at most 96 KiB. These are conservative local limits, not provider
maxima. Overflow after JSON escaping is denied before encryption or disk writes.

`load(signal)` reads only `credentials.v1.bin`, with regular-file/type/size checks
before and after opening, a bounded read through EOF and buffer release. It
decrypts through the OS provider, validates the whole envelope/schema and returns
only a main-private loaded record/key-rotation hint or a fixed missing,
unavailable, invalid or stopped status. Corruption, unknown versions, malformed
decryption results and raw native exceptions never reach diagnostics or renderer.
No automatic write, retry or key-rotation migration occurs during restoration.

Restored identity, scope and expiry are **data**, not renewed account authority,
fresh token verification, inference permission, vision capability or capture
consent. Expired access data may be needed by future explicit refresh/reconnect
logic. Loading cannot create a transaction grant or trigger a provider request.

## Preparation, commit and cancellation

Reserve one operation before inspecting input. Reject overlapping prepare/load
operations; cancellation releases the slot so fresh work need not wait for native
crypto. Disposal is permanent. Every awaited completion rechecks ownership and
the native caller signal; an old completion cannot release a newer reservation.
The transaction continues to own its public deadline, state and selected account.

`prepare` encrypts before creating any file. Create a random stage with exclusive
open (`wx`) in the installed file's own directory, write ciphertext, flush it
with fsync and close the descriptor. Only a successfully created stage belongs
to cleanup; an exclusive-open failure must not delete another file. Staging
does not install or return plaintext. Reject non-directory/symlink final storage
locations; the supplied directory and its ancestors must already be trusted.
Windows inherits its private parent ACL; POSIX mode arguments are not a claim
that this code configures a Windows DACL.

Return synchronous `commit` and `discard` closures matching ADR 0029. Commit
checks current ownership and uses **one same-directory rename**, with no target
pre-delete, copy fallback, deferred write or await. The rename is its final
fallible filesystem operation. Failure returns false and preserves the previous
installed file. Success drops the stage name before cleanup, so discard or the
transaction's subsequent abort cannot remove installed credentials. Repeat
commit is false. Discard, cancellation and disposal release only owned staging.
Cleanup failures are swallowed; their encrypted orphan is never restored.

Entry into the existing transaction's synchronous commit remains the
linearization point. Cancellation before it prevents installation; later
cancellation cannot undo an already claimed commit. This store does not change
that protocol or implement logout/deletion. No post-write UI check substitutes
for conditional installation.

The filesystem portion uses synchronous bounded operations to preserve this
protocol; encryption/decryption are async. A slow local disk can still block the
main thread during staging/flush/rename. Interactive latency is not measured or
claimed here. Future async final installation needs a separately reviewed
serialized/conditional commit design, not an unguarded async save.

## Atomicity, restart and limits

Require one main owner/process per private directory on a local Windows
filesystem with same-directory replacement semantics. Node's
[fs rename/fsync API](https://nodejs.org/docs/latest-v24.x/api/fs.html), pinned
[Node 24.19.0 Windows libuv implementation](https://github.com/nodejs/node/blob/v24.19.0/deps/uv/src/win/fs.c)
(blob `4092de0ab31e5628d628fd2c3f0ea3c75c0d6803`) and Microsoft's
[MoveFileExW reference](https://learn.microsoft.com/en-us/windows/win32/api/winbase/nf-winbase-movefileexw)
were inspected. The source reference explains the replace-existing path; it is
not a claim that all filesystems provide a power-loss transaction guarantee.

Automated Windows tests must establish actual pinned Electron replacement and
restart behavior, including termination after staging but before commit. Never
promote an orphan, salvage partial plaintext, or read a backup implicitly.
Encrypted orphans can survive process termination or cleanup failure; this slice
ignores them and does not scan/delete another owner's files. Crash garbage
collection, multiprocess locking and secure release installation remain future
integration/release responsibilities. No network filesystem, filesystem rollback,
machine crash/power-loss durability or same-user adversary guarantee is claimed.

Native crypto can finish after cancellation; ignore its late output. Zero owned
byte buffers on release where practical, but borrowed native inputs/JavaScript
strings cannot be forcibly erased. No memory-zeroization guarantee is made.

## Evidence, alternatives and remaining decisions

The [evidence](../evidence/P4-02c.md) distinguishes actual filesystem unit tests
using an ephemeral AES-GCM test double from native DPAPI/Electron CI and from
human/provider evidence. Native tests use an explicit test-only bundle/entry
point and synthetic markers, with booleans as the only evaluation results.
Production app bundles and permissions stay unchanged.

Plaintext configuration, renderer/localStorage persistence, target pre-delete,
an async final save and silent cross-platform fallback are rejected. No new
package or upstream implementation is copied; the project stays UNLICENSED.
OD-04 and proposed auth ADRs need maintainer decisions; #79 remains Backlog.
G1–G4 and OD-02 remain open. Trusted discovery/key loading, durable registration,
refresh/logout, actual browser/listener/account/provider wiring and P4-05 real
eligible-account protected restart remain separate tasks. No new manual checklist.
