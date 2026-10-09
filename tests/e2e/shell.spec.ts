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
      page.getByRole('heading', { name: 'Companion preview' }),
    ).toBeVisible();
    expect(page.url()).toBe('paperclip://app/index.html');
    expect(
      await nativeWindow.evaluate((window) => ({
        alwaysOnTop: window.isAlwaysOnTop(),
        resizable: window.isResizable(),
        bounds: window.getBounds(),
      })),
    ).toMatchObject({
      alwaysOnTop: true,
      resizable: false,
      bounds: { width: 280, height: 340 },
    });
    await page.getByRole('button', { name: 'Say hello' }).click();
    await expect(page.getByRole('status')).toHaveText('Hello there!');
    await expect(page.locator('main')).toHaveAttribute('data-state', 'idle');
    await page.emulateMedia({ reducedMotion: 'reduce' });
    expect(
      await page
        .locator('.wire')
        .evaluate((element) => getComputedStyle(element).animationName),
    ).toBe('none');
    expect(
      await page
        .locator('.handle')
        .evaluate((element) =>
          getComputedStyle(element).getPropertyValue('-webkit-app-region'),
        ),
    ).toBe('drag');
    expect(
      await page
        .getByRole('button', { name: 'Close companion' })
        .evaluate((element) =>
          getComputedStyle(element).getPropertyValue('-webkit-app-region'),
        ),
    ).toBe('no-drag');
    const isolation = await page.evaluate(() => ({
      require: typeof Reflect.get(window, 'require'),
      process: typeof Reflect.get(window, 'process'),
      bridge: Object.keys(window.companionWindow),
      close: typeof window.companionWindow.close,
    }));
    expect(isolation).toEqual({
      require: 'undefined',
      process: 'undefined',
      bridge: ['close', 'openChat', 'copyText'],
      close: 'function',
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
      heading: 'Companion preview',
    });
  } finally {
    await application?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('close hides the companion and app quit exits while hidden', async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'paperclip-close-'));
  let application: ElectronApplication | undefined;
  try {
    application = await electron.launch({
      args: ['.', `--user-data-dir=${profile}`],
    });
    const diagnostics: string[] = [];
    application.process().stderr?.on('data', (chunk: Buffer) => {
      if (chunk.toString().includes('TRAY_UNAVAILABLE'))
        diagnostics.push('TRAY_UNAVAILABLE');
    });
    const page = await application.firstWindow();
    const nativeWindow = await application.browserWindow(page);
    await expect
      .poll(() => nativeWindow.evaluate((w) => w.isVisible()))
      .toBe(true);
    expect(diagnostics, 'Tray initializes on the Windows runner').toEqual([]);
    expect(
      await nativeWindow.evaluate((w) => w.listenerCount('close')),
    ).toBeGreaterThan(0);
    const closeProbe = await nativeWindow.evaluateHandle((w) => {
      const state = { emitted: false, prevented: false };
      w.on('close', (e: { defaultPrevented: boolean }) => {
        state.emitted = true;
        state.prevented = e.defaultPrevented;
      });
      return { state, window: w };
    });
    await page.getByRole('button', { name: 'Close companion' }).click();
    await expect
      .poll(() =>
        closeProbe.evaluate(({ state, window: w }) => ({
          ...state,
          destroyed: w.isDestroyed(),
          visible: w.isDestroyed() ? null : w.isVisible(),
        })),
      )
      .toEqual({
        emitted: true,
        prevented: true,
        destroyed: false,
        visible: false,
      });
    expect(await nativeWindow.evaluate((w) => w.isDestroyed())).toBe(false);
    await application.evaluate(({ app }) => app.emit('activate'));
    await expect
      .poll(() => nativeWindow.evaluate((w) => w.isVisible()))
      .toBe(true);
    expect(application.windows()).toHaveLength(1);
    expect(diagnostics, 'Tray initializes on the Windows runner').toEqual([]);
    await page.getByRole('button', { name: 'Close companion' }).click();
    await expect
      .poll(() => nativeWindow.evaluate((w) => w.isVisible()))
      .toBe(false);
    const closed = application.waitForEvent('close');
    await application.evaluate(({ app }) => app.quit());
    await closed;
    application = undefined;
  } finally {
    await application?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('chat preview supports keyboard, cancellation, retry, copy and fresh reopen', async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'paperclip-chat-'));
  let application: ElectronApplication | undefined;
  try {
    application = await electron.launch({
      args: ['.', `--user-data-dir=${profile}`],
    });
    const overlay = await application.firstWindow();
    const opened = application.waitForEvent('window');
    await overlay
      .getByRole('button', { name: 'Open chat', exact: true })
      .click();
    const chat = await opened;
    await expect(
      chat.getByRole('heading', { name: 'Paperclip chat', exact: true }),
    ).toBeVisible();
    const input = chat.getByLabel('Your message');
    await expect(input).toBeFocused();
    await expect(
      chat.getByRole('button', { name: 'Send preview' }),
    ).toBeDisabled();
    await overlay.evaluate(() => window.companionWindow.openChat());
    expect(application.windows()).toHaveLength(2);
    await input.fill('A synthetic question');
    await input.press('Shift+Enter');
    await expect(input).toHaveValue('A synthetic question\n');
    await input.press('Enter');
    await expect(chat.getByText('Preparing a sample reply…')).toBeVisible();
    await chat.getByRole('button', { name: 'Stop', exact: true }).click();
    await expect(chat.getByText('Stopped. No request was sent.')).toBeVisible();
    await expect(input).toBeFocused();
    await chat.getByRole('button', { name: 'Retry', exact: true }).click();
    await expect(
      chat.getByText('Sample reply ready.', { exact: true }),
    ).toBeVisible();
    await chat.getByRole('button', { name: 'Copy response' }).click();
    await expect(
      chat.getByText('Copied response.', { exact: true }),
    ).toBeVisible();
    expect(
      await application.evaluate(
        async ({ clipboard }) => await clipboard.readText(),
      ),
    ).toContain('local preview');
    expect(
      await overlay.evaluate(() => window.companionWindow.copyText('denied')),
    ).toBe(false);
    await chat.getByLabel('Preview scenario').selectOption('error');
    await input.fill('<script>window.__injected = true</script>');
    await input.press('Enter');
    await expect(chat.getByRole('alert')).toContainText('Simulated error');
    expect(
      await chat.evaluate(() => Reflect.get(window, '__injected')),
    ).toBeUndefined();
    await chat.getByLabel('Preview scenario').selectOption('reply');
    await chat.getByRole('button', { name: 'Retry', exact: true }).click();
    await chat.getByRole('button', { name: 'Clear conversation' }).click();
    await expect(
      chat.getByText('What would you like help with?', { exact: true }),
    ).toBeVisible();
    await expect(input).toBeFocused();
    expect(
      await chat.evaluate(async () => {
        try {
          await fetch('https://example.com');
          return false;
        } catch {
          return true;
        }
      }),
    ).toBe(true);
    expect(
      await chat.evaluate(() => [
        typeof Reflect.get(window, 'require'),
        typeof Reflect.get(window, 'process'),
      ]),
    ).toEqual(['undefined', 'undefined']);
    await chat.evaluate(() => window.open('https://example.com'));
    expect(application.windows()).toHaveLength(2);
    const closed = chat.waitForEvent('close');
    await chat.getByRole('button', { name: 'Close chat' }).click();
    await closed;
    const reopened = application.waitForEvent('window');
    await overlay.evaluate(() => window.companionWindow.openChat());
    await expect((await reopened).getByLabel('Your message')).toHaveValue('');
  } finally {
    await application?.close();
    await rm(profile, { recursive: true, force: true });
  }
});
