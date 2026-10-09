import {
  _electron as electron,
  expect,
  test,
  type ElectronApplication,
} from '@playwright/test';
import type { Menu, MenuItemConstructorOptions } from 'electron';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
const launch = (profile: string) =>
  electron.launch({
    args: [
      path.resolve('tests/e2e/tray-harness.cjs'),
      `--user-data-dir=${profile}`,
    ],
  });
async function quit(application: ElectronApplication) {
  const exited = application.waitForEvent('close');
  await application.evaluate(() => {
    (Reflect.get(globalThis, '__paperclipTrayQuit') as () => void)();
  });
  await exited;
}
async function menuClick(application: ElectronApplication, label: string) {
  await application.evaluate((_, label) => {
    const menu = Reflect.get(globalThis, '__paperclipTrayMenu') as Menu;
    const item = [
      ...menu.items,
      ...menu.items.flatMap((i) => i.submenu?.items ?? []),
    ].find((i) => i.label === label);
    if (!item) throw new Error('NO_MENU_ITEM');
    if (item.type === 'checkbox') item.checked = !item.checked;
    const template = Reflect.get(
      globalThis,
      '__paperclipTrayTemplate',
    ) as MenuItemConstructorOptions[];
    const options = [
      ...template,
      ...template.flatMap((i) => (Array.isArray(i.submenu) ? i.submenu : [])),
    ].find((i) => i.label === label);
    if (!options?.click) throw new Error('NO_MENU_CALLBACK');
    (options.click as unknown as (item: { checked: boolean }) => void)(item);
  }, label);
}
test('position, hidden state and native preference survive restart; reset is visible and quit preserves visibility', async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'paperclip-persist-'));
  let application: ElectronApplication | undefined;
  try {
    application = await launch(profile);
    expect(
      await application.evaluate(({ app }) => app.getPath('userData')),
    ).toBe(profile);
    let page = await application.firstWindow();
    await expect(
      page.getByRole('heading', { name: 'Companion preview' }),
    ).toBeVisible();
    let window = await application.browserWindow(page);
    const position = await application.evaluate(({ BrowserWindow, screen }) => {
      const area = screen.getPrimaryDisplay().workArea;
      const position = { x: area.x + 70, y: area.y + 80 };
      BrowserWindow.getAllWindows()[0]!.setPosition(position.x, position.y);
      return position;
    });
    await menuClick(application, 'Always on top');
    expect(await window.evaluate((w) => w.isAlwaysOnTop())).toBe(false);
    await menuClick(application, 'Hide character');
    await expect.poll(() => window.evaluate((w) => w.isVisible())).toBe(false);
    await quit(application);
    application = undefined;
    const settings = JSON.parse(
      await readFile(path.join(profile, 'shell-preferences.json'), 'utf8'),
    );
    expect(settings).toEqual({
      version: 1,
      position,
      visible: false,
      alwaysOnTop: false,
    });
    application = await launch(profile);
    page = await application.firstWindow();
    await expect(
      page.getByRole('heading', { name: 'Companion preview' }),
    ).toBeAttached();
    window = await application.browserWindow(page);
    await expect
      .poll(() =>
        window.evaluate((w) => ({
          visible: w.isVisible(),
          top: w.isAlwaysOnTop(),
          bounds: w.getBounds(),
        })),
      )
      .toMatchObject({ visible: false, top: false, bounds: position });
    expect(application.windows()).toHaveLength(1);
    await menuClick(application, 'Recover character');
    await expect.poll(() => window.evaluate((w) => w.isVisible())).toBe(true);
    await menuClick(application, 'Reset shell preferences');
    expect(await window.evaluate((w) => w.isAlwaysOnTop())).toBe(true);
    await quit(application);
    application = undefined;
    expect(
      JSON.parse(
        await readFile(path.join(profile, 'shell-preferences.json'), 'utf8'),
      ),
    ).toMatchObject({ visible: true, alwaysOnTop: true });
    application = await launch(profile);
    page = await application.firstWindow();
    await expect(
      page.getByRole('heading', { name: 'Companion preview' }),
    ).toBeVisible();
    await quit(application);
    application = undefined;
  } finally {
    await application?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

test('display changes recover off-screen overlay and chat without opening a hidden character', async () => {
  const profile = await mkdtemp(path.join(os.tmpdir(), 'paperclip-display-'));
  let application: ElectronApplication | undefined;
  try {
    application = await launch(profile);
    const overlay = await application.firstWindow();
    const opened = application.waitForEvent('window');
    await overlay
      .getByRole('button', { name: 'Open chat', exact: true })
      .click();
    const chat = await opened;
    await expect(chat.getByLabel('Your message')).toBeVisible();
    await menuClick(application, 'Hide character');
    const result = await application.evaluate(({ BrowserWindow, screen }) => {
      const windows = BrowserWindow.getAllWindows();
      for (const window of windows) window.setPosition(-100000, -100000);
      // OS display topology is not altered. Dispatch the production recovery event.
      screen.emit('display-metrics-changed', {}, screen.getPrimaryDisplay(), [
        'workArea',
        'scaleFactor',
      ]);
      const area = screen.getPrimaryDisplay().workArea;
      return windows.map((w) => {
        const b = w.getBounds();
        return {
          url: w.webContents.getURL(),
          visible: w.isVisible(),
          fits:
            b.x >= area.x &&
            b.y >= area.y &&
            b.x + b.width <= area.x + area.width &&
            b.y + b.height <= area.y + area.height,
        };
      });
    });
    expect(result).toEqual(
      expect.arrayContaining([
        { url: 'paperclip://app/index.html', visible: false, fits: true },
        { url: 'paperclip://app/chat.html', visible: true, fits: true },
      ]),
    );
    await quit(application);
    application = undefined;
  } finally {
    await application?.close();
    await rm(profile, { recursive: true, force: true });
  }
});

for (const [name, content] of [
  ['corrupt', 'not json'],
  ['future', '{"version":2,"marker":"preserve"}'],
] as const) {
  test(`${name} preferences allow startup and safe tray recovery`, async () => {
    const profile = await mkdtemp(path.join(os.tmpdir(), 'paperclip-invalid-'));
    let application: ElectronApplication | undefined;
    try {
      const file = path.join(profile, 'shell-preferences.json');
      await writeFile(file, content);
      application = await launch(profile);
      const page = await application.firstWindow();
      await expect(
        page.getByRole('heading', { name: 'Companion preview' }),
      ).toBeVisible();
      await menuClick(application, 'Reset shell preferences');
      await quit(application);
      application = undefined;
      if (name === 'future') expect(await readFile(file, 'utf8')).toBe(content);
      else
        expect(JSON.parse(await readFile(file, 'utf8'))).toMatchObject({
          version: 1,
          visible: true,
        });
    } finally {
      await application?.close();
      await rm(profile, { recursive: true, force: true });
    }
  });
}
