import {
  app,
  ipcMain,
  type BrowserWindow,
  type IpcMainInvokeEvent,
} from 'electron';
import { CHAT_URL, trustedWindow } from './close-control';
import { createChatSession } from './chat-session';

export function installChatStream(window: BrowserWindow): void {
  const session = createChatSession();
  const allowed = (event: IpcMainInvokeEvent, args: unknown[]) =>
    !window.isDestroyed() &&
    args.length === 1 &&
    trustedWindow(event, window, CHAT_URL);
  ipcMain.handle(
    'companion:chat-start',
    (event, ...args: unknown[]) =>
      allowed(event, args) && session.start(args[0]),
  );
  ipcMain.handle('companion:chat-next', async (event, ...args: unknown[]) => {
    if (!allowed(event, args)) return null;
    const result = await session.next(args[0]);
    return allowed(event, args) ? result : null;
  });
  ipcMain.handle(
    'companion:chat-cancel',
    (event, ...args: unknown[]) =>
      allowed(event, args) && session.cancel(args[0]),
  );
  window.webContents.on('did-start-loading', session.reset);
  window.webContents.on('render-process-gone', session.reset);
  app.on('before-quit', session.reset);
  window.webContents.once('destroyed', () => {
    session.reset();
    for (const operation of ['start', 'next', 'cancel'])
      ipcMain.removeHandler(`companion:chat-${operation}`);
    app.removeListener('before-quit', session.reset);
    window.webContents.removeListener('did-start-loading', session.reset);
    window.webContents.removeListener('render-process-gone', session.reset);
  });
}
