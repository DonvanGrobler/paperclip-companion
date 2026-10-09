import {
  app,
  Menu,
  Tray,
  nativeImage,
  screen,
  type BrowserWindow,
} from 'electron';
import { recoverWindow } from './display-recovery';
import type { installShellPreferences } from './shell-preferences';
import { initialOverlayBounds } from './overlay-layout';

// Independently authored 16px wire glyph; no imported character art.
const glyph = [
  '................',
  '.....######.....',
  '....##....##....',
  '...##......##...',
  '...##.####.##...',
  '...##.#..#.##...',
  '...##.#..#.##...',
  '...##.#..#.##...',
  '...##.#..#.##...',
  '...##.#..#.##...',
  '...##.#....##...',
  '...##.######....',
  '...##...........',
  '....########....',
  '................',
  '................',
].join('');

export function installTray(
  window: BrowserWindow,
  openChat: () => void,
  preferences: Pick<
    ReturnType<typeof installShellPreferences>,
    'setAlwaysOnTop' | 'reset'
  >,
): boolean {
  let tray: Tray | undefined;
  let quitting = false;
  const show = () => {
    if (window.isMinimized()) window.restore();
    recoverWindow(window);
    window.show();
    window.focus();
  };
  try {
    const pixels = Buffer.alloc(16 * 16 * 4);
    for (let i = 0; i < glyph.length; i++) {
      if (glyph[i] === '#') pixels.set([180, 180, 180, 255], i * 4);
    }
    tray = new Tray(
      nativeImage.createFromBitmap(pixels, { width: 16, height: 16 }),
    );
    tray.setToolTip('Paperclip Companion');
    const updateMenu = () =>
      tray!.setContextMenu(
        Menu.buildFromTemplate([
          { label: 'Open chat', click: openChat },
          { label: 'Show character', click: show },
          { label: 'Hide character', click: () => window.hide() },
          {
            label: 'Recover character',
            click: () => {
              window.setBounds(
                initialOverlayBounds(screen.getPrimaryDisplay().workArea),
              );
              show();
            },
          },
          {
            label: 'Preferences',
            submenu: [
              {
                label: 'Always on top',
                type: 'checkbox',
                checked: window.isAlwaysOnTop(),
                click: (item) => preferences.setAlwaysOnTop(item.checked),
              },
              {
                label: 'Reset shell preferences',
                click: () => {
                  preferences.reset();
                  show();
                  updateMenu();
                },
              },
            ],
          },
          { type: 'separator' },
          { label: 'Quit', click: () => app.quit() },
        ]),
      );
    updateMenu();
    tray.on('click', show);
  } catch {
    tray?.destroy();
    console.error('TRAY_UNAVAILABLE');
    window.show();
    return false;
  }
  // These listeners retain the tray and are installed only after setup succeeds.
  window.on('close', (event) => {
    if (!quitting) {
      event.preventDefault();
      window.hide();
    }
  });
  app.on('activate', show);
  app.on('before-quit', () => {
    quitting = true;
  });
  app.on('will-quit', () => tray.destroy());
  return true;
}
