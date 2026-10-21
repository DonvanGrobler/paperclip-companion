import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { createPngEncoder } from '../../src/main/capture-png';
import { syntheticBgra } from '../fixtures/png';

test('Electron decodes generated memory-only PNG with correct colors and orientation', async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'paperclip-png-'));
  const encoder = createPngEncoder();
  const frame = syntheticBgra();
  const result = await encoder.encode(
    frame,
    'straight',
    new AbortController().signal,
  );
  let application: ElectronApplication | undefined;
  let transport: number[] = [];
  try {
    if (result.status !== 'image') throw new Error('PNG_EXPECTED');
    application = await electron.launch({
      args: ['.', `--user-data-dir=${profile}`],
    });
    transport = Array.from(result.bytes);
    // Private main-process test evaluation only; no renderer image API or traces.
    const valid = await application.evaluate(({ nativeImage }, values) => {
      const bytes = Buffer.from(values);
      let bitmap: Buffer | undefined;
      try {
        const image = nativeImage.createFromBuffer(bytes);
        const size = image.getSize();
        if (image.isEmpty() || size.width !== 2 || size.height !== 2)
          return false;
        bitmap = image.toBitmap();
        // Expected Windows BGRA bitmap. Verify against
        // independently authored opaque landmarks, not against the PNG encoder.
        const expected = [
          0, 0, 255, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 255, 255,
        ];
        return (
          bitmap.length === expected.length &&
          bitmap.every((value, index) => value === expected[index])
        );
      } finally {
        bytes.fill(0);
        bitmap?.fill(0);
      }
    }, transport);
    expect(valid).toBe(true);
  } finally {
    transport.fill(0);
    if (result.status === 'image') result.bytes.fill(0);
    frame.bytes.fill(0);
    encoder.dispose();
    try {
      await application?.close();
    } finally {
      await rm(profile, { recursive: true, force: true });
    }
  }
});
