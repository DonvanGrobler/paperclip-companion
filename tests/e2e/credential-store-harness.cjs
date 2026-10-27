/* global require, process, Buffer, AbortController */
/* eslint-disable @typescript-eslint/no-require-imports */
// Explicit test entry point. Never bundled or enabled by a production setting.
const { app, safeStorage } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const { createHash } = require('node:crypto');
const { createWindowsSiwcCredentialStore } = require(process.argv[2]);
const directory = process.argv[3];
const installed = path.join(directory, 'credentials.v1.bin');
const marker = (label) =>
  `synthetic:${createHash('sha256').update(directory).update(label).digest('base64url')}`;
const record = (label) => ({
  issuer: 'https://auth.openai.com',
  subject: `synthetic-${label}`,
  clientId: 'synthetic-client',
  hostId: 'synthetic-host',
  accessToken: marker(`${label}:access`),
  refreshToken: marker(`${label}:refresh`),
  idToken: marker(`${label}:id`),
  scopes: ['openid'],
  expiresAt: 1, // Restoration is data, not authorization or fresh token validity.
});
const signal = () => new AbortController().signal;
const encryptedOnly = () =>
  fs.readdirSync(directory).every((name) => {
    const bytes = fs.readFileSync(path.join(directory, name));
    try {
      return ['first', 'second'].every((label) => {
        const value = record(label);
        return ![
          value.accessToken,
          value.refreshToken,
          value.idToken,
          value.subject,
        ].some((text) => bytes.includes(Buffer.from(text)));
      });
    } finally {
      bytes.fill(0);
    }
  });

app
  .whenReady()
  .then(() => {
    const store = createWindowsSiwcCredentialStore(directory, safeStorage);
    const restored = async (label) => {
      const value = await store.load(signal());
      const expected = record(label);
      return (
        value.status === 'loaded' &&
        Object.keys(expected).every(
          (key) =>
            JSON.stringify(value.record[key]) === JSON.stringify(expected[key]),
        )
      );
    };
    // Test-only main process evaluation returns booleans; no renderer, token IPC or logs.
    app.__credentialProbe = async (mode) => {
      try {
        if (mode === 'install') {
          const candidate = await store.prepare(record('first'), signal());
          const staged = !fs.existsSync(installed) && encryptedOnly();
          const committed = candidate.commit();
          candidate.discard();
          return (
            staged &&
            committed &&
            !candidate.commit() &&
            (await restored('first')) &&
            encryptedOnly()
          );
        }
        if (mode === 'interrupt') {
          await store.prepare(record('second'), signal());
          // Exit without discard/commit: the next Electron process must ignore the orphan.
          return fs.readdirSync(directory).length === 2 && encryptedOnly();
        }
        if (mode === 'restore-first')
          return (await restored('first')) && encryptedOnly();
        if (mode === 'replace') {
          const controller = new AbortController();
          const cancelled = await store.prepare(
            record('second'),
            controller.signal,
          );
          controller.abort();
          if (cancelled.commit() || !(await restored('first'))) return false;
          const next = await store.prepare(record('second'), signal());
          return next.commit() && (await restored('second')) && encryptedOnly();
        }
        if (mode === 'restore-second')
          return (await restored('second')) && encryptedOnly();
        if (mode === 'corrupt') {
          const bytes = fs.readFileSync(installed);
          try {
            bytes[bytes.length - 1] ^= 255;
            fs.writeFileSync(installed, bytes);
            return (
              (await store.load(signal())).status === 'invalid' &&
              fs.readFileSync(installed).equals(bytes)
            );
          } finally {
            bytes.fill(0);
          }
        }
        return false;
      } catch {
        return false;
      }
    };
  })
  .catch(() => app.exit(1));
