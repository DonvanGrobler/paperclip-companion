import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from '@playwright/test';
import { mkdtemp, rm } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';

test('bundled shell renders with a closed renderer boundary', async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'paperclip-test-'));
  let application: ElectronApplication | undefined;
  try {
    application = await electron.launch({
      args: ['.', `--user-data-dir=${profile}`],
    });
    const page = await application.firstWindow();
    await expect(
      page.getByRole('heading', { name: 'Foundation preview' }),
    ).toBeVisible();
    expect(page.url()).toBe('paperclip://app/index.html');
    const isolation = await page.evaluate(() => ({
      require: typeof Reflect.get(window, 'require'),
      process: typeof Reflect.get(window, 'process'),
      bridge: typeof Reflect.get(window, 'paperclip'),
    }));
    expect(isolation).toEqual({
      require: 'undefined',
      process: 'undefined',
      bridge: 'undefined',
    });
    const blocked = await page.evaluate(async () => {
      try {
        await fetch('https://example.com');
        return false;
      } catch {
        return true;
      }
    });
    expect(blocked).toBe(true);
    await page.evaluate(() => window.open('paperclip://app/index.html'));
    expect(application.windows()).toHaveLength(1);
    await page.evaluate(() => {
      window.location.href = 'https://example.com';
    });
    await expect(
      page.getByRole('heading', { name: 'Foundation preview' }),
    ).toBeVisible();
    expect(page.url()).toBe('paperclip://app/index.html');
  } finally {
    await application?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
