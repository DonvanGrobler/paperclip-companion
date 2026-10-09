import {
  BrowserWindow,
  clipboard,
  ipcMain,
  screen,
  type Session,
} from 'electron';
import { CHAT_URL, installCloseControl, trustedWindow } from './close-control';
import { installDisplayRecovery, recoverWindow } from './display-recovery';
import { lockWindow, windowPreferences } from './window-security';

export function createChatOpener(session: Session): () => void {
  let chat: BrowserWindow | undefined;
  return () => {
    if (chat) {
      if (chat.isMinimized()) chat.restore();
      recoverWindow(chat, true);
      chat.show();
      chat.focus();
      return;
    }
    const area = screen.getPrimaryDisplay().workArea;
    const window = new BrowserWindow({
      x: area.x,
      y: area.y,
      width: Math.min(640, area.width),
      height: Math.min(680, area.height),
      minWidth: Math.min(360, area.width),
      minHeight: Math.min(420, area.height),
      title: 'Paperclip chat — local preview',
      show: false,
      backgroundColor: '#f4f1e9',
      webPreferences: windowPreferences(session),
    });
    chat = window;
    lockWindow(window);
    installDisplayRecovery(window, true);
    installCloseControl(window, CHAT_URL);
    ipcMain.handle('companion:copy', async (event, ...args: unknown[]) => {
      const text = args[0];
      if (
        !trustedWindow(event, window, CHAT_URL) ||
        args.length !== 1 ||
        typeof text !== 'string' ||
        text.length === 0 ||
        text.length > 12000
      )
        return false;
      try {
        await clipboard.writeText(text);
        return true;
      } catch {
        return false;
      }
    });
    window.once('closed', () => {
      ipcMain.removeHandler('companion:copy');
      chat = undefined;
    });
    window.once('ready-to-show', () => {
      window.show();
      window.focus();
    });
    void window.loadURL(CHAT_URL).catch(() => {
      console.error('CHAT_LOAD_FAILED');
      if (!window.isDestroyed()) window.destroy();
    });
  };
}
