import { _electron as electron, expect, test } from '@playwright/test';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { build } from 'vite';

test('native Windows encrypted staging, replacement and restoration across Electron restarts', async () => {
  test.skip(
    process.platform !== 'win32',
    'Requires the native Windows DPAPI provider',
  );
  const root = await mkdtemp(path.join(os.tmpdir(), 'paperclip-protected-'));
  const bundle = path.join(root, 'bundle');
  const directory = path.join(root, 'credentials');
  try {
    await mkdir(directory);
    // Bundle the exact helper only for this explicit test entry point; app entry points stay unwired.
    await build({
      configFile: false,
      logLevel: 'silent',
      build: {
        outDir: bundle,
        target: 'node24',
        lib: {
          entry: path.resolve('src/main/siwc-credential-store.ts'),
          formats: ['cjs'],
          fileName: () => 'store.cjs',
        },
        rollupOptions: { external: [/^node:/, 'electron'] },
      },
    });
    for (const mode of [
      'install',
      'interrupt',
      'restore-first',
      'replace',
      'restore-second',
      'corrupt',
    ]) {
      const application = await electron.launch({
        args: [
          path.resolve('tests/e2e/credential-store-harness.cjs'),
          path.join(bundle, 'store.cjs'),
          directory,
          `--user-data-dir=${path.join(root, 'profile')}`,
        ],
      });
      try {
        await expect
          .poll(() =>
            application.evaluate(
              ({ app }) =>
                typeof (app as unknown as { __credentialProbe?: unknown })
                  .__credentialProbe === 'function',
            ),
          )
          .toBe(true);
        const valid = await application.evaluate(async ({ app }, mode) => {
          const probe = app as unknown as {
            __credentialProbe: (mode: string) => Promise<boolean>;
          };
          return probe.__credentialProbe(mode);
        }, mode);
        expect(valid, `Native protected credential step: ${mode}`).toBe(true);
      } finally {
        await application.close();
      }
    }
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
