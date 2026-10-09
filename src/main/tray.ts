import {
  app,
  Menu,
  Tray,
  nativeImage,
  screen,
  type BrowserWindow,
} from 'electron';
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

export function installTray(window: BrowserWindow, openChat: () => void): void {
  let tray: Tray | undefined;
  let quitting = false;
  const show = () => {
    if (window.isMinimized()) window.restore();
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
    tray.setContextMenu(
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
        { label: 'Preferences (coming soon)', enabled: false },
        { type: 'separator' },
        { label: 'Quit', click: () => app.quit() },
      ]),
    );
    tray.on('click', show);
  } catch {
    tray?.destroy();
    console.error('TRAY_UNAVAILABLE');
    window.show();
    return;
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
}
