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
    const nativeWindow = await application.browserWindow(page);
    // DOM visibility does not imply that Electron's ready-to-show handler ran.
    // Observe the real window without forcing it open or weakening the assertion.
    await expect
      .poll(() => nativeWindow.evaluate((window) => window.isVisible()), {
        message: 'Electron shell becomes natively visible',
        timeout: 10_000,
      })
      .toBe(true);
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
    // Electron cancels navigation before commit. Inspect its cancellation event and
    // the retained document directly, avoiding Playwright's pending-navigation wait.
    const navigation = await application.evaluate(async ({ BrowserWindow }) => {
      const window = BrowserWindow.getAllWindows()[0];
      if (!window) throw new Error('NO_WINDOW');
      const contents = window.webContents;
      const prevented = await new Promise<boolean>((resolve, reject) => {
        const timer = setTimeout(
          () => reject(new Error('NO_NAVIGATION_EVENT')),
          5_000,
        );
        contents.once('will-frame-navigate', (event) => {
          clearTimeout(timer);
          resolve(event.defaultPrevented);
        });
        void contents
          .executeJavaScript('window.location.href = "https://example.com"')
          .catch(reject);
      });
      return {
        prevented,
        url: contents.getURL(),
        visible: window.isVisible(),
        heading: (await contents.executeJavaScript(
          'document.getElementById("status-heading")?.textContent',
        )) as string | undefined,
      };
    });
    expect(navigation).toEqual({
      prevented: true,
      url: 'paperclip://app/index.html',
      visible: true,
      heading: 'Foundation preview',
    });
  } finally {
    await application?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
