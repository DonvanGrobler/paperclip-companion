import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from '@playwright/test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import legacy from '../fixtures/screens.json' with { type: 'json' };
import corpus from '../fixtures/vision-cases.json' with { type: 'json' };

test('Electron decodes all pinned synthetic visual fixtures', async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'paperclip-vision-'));
  let application: ElectronApplication | undefined;
  try {
    application = await electron.launch({
      args: ['.', `--user-data-dir=${profile}`],
    });
    for (const screen of [...legacy.screens, ...corpus.newScreens]) {
      await test.step(screen.id, async () => {
        const bytes = await readFile(
          new URL(`../fixtures/${screen.file}`, import.meta.url),
        );
        const transport = Array.from(bytes);
        try {
          // Test-only main evaluation; no renderer authority or pixel output.
          const valid = await application!.evaluate(
            ({ nativeImage }, values) => {
              const png = Buffer.from(values);
              let bitmap: Buffer | undefined;
              try {
                const image = nativeImage.createFromBuffer(png);
                const size = image.getSize();
                if (
                  image.isEmpty() ||
                  size.width !== 640 ||
                  size.height !== 360
                )
                  return false;
                bitmap = image.toBitmap();
                if (bitmap.length !== 640 * 360 * 4) return false;
                // Independent opaque Windows BGRA landmarks: outer background
                // #e9edf2 at (0, 0), header #243b55 at (20, 20).
                const header = (20 * 640 + 20) * 4;
                return (
                  [242, 237, 233, 255].every(
                    (value, index) => bitmap![index] === value,
                  ) &&
                  [85, 59, 36, 255].every(
                    (value, index) => bitmap![header + index] === value,
                  )
                );
              } finally {
                png.fill(0);
                bitmap?.fill(0);
              }
            },
            transport,
          );
          expect(valid).toBe(true);
        } finally {
          bytes.fill(0);
          transport.fill(0);
        }
      });
    }
  } finally {
    try {
      await application?.close();
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
});
