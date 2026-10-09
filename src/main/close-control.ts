import {
  ipcMain,
  type BrowserWindow,
  type IpcMainEvent,
  type IpcMainInvokeEvent,
} from 'electron';
export const OVERLAY_URL = 'paperclip://app/index.html';
export const CHAT_URL = 'paperclip://app/chat.html';
export function trustedWindow(
  event: IpcMainEvent | IpcMainInvokeEvent,
  window: BrowserWindow,
  url: string,
): boolean {
  return (
    event.sender === window.webContents &&
    event.senderFrame === window.webContents.mainFrame &&
    event.senderFrame?.url === url
  );
}
export function installCloseControl(
  window: BrowserWindow,
  url = OVERLAY_URL,
): void {
  const close = (event: IpcMainEvent, ...args: unknown[]) => {
    if (args.length === 0 && trustedWindow(event, window, url)) window.close();
  };
  ipcMain.on('companion:close', close);
  window.webContents.once('destroyed', () =>
    ipcMain.removeListener('companion:close', close),
  );
}
export function installChatLauncher(
  window: BrowserWindow,
  openChat: () => void,
): void {
  const open = (event: IpcMainEvent, ...args: unknown[]) => {
    if (args.length === 0 && trustedWindow(event, window, OVERLAY_URL))
      openChat();
  };
  ipcMain.on('companion:open-chat', open);
  window.webContents.once('destroyed', () =>
    ipcMain.removeListener('companion:open-chat', open),
  );
}
