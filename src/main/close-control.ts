import { ipcMain, type BrowserWindow, type IpcMainEvent } from 'electron';

export function installCloseControl(window: BrowserWindow): void {
  const close = (event: IpcMainEvent, ...args: unknown[]) => {
    if (
      args.length !== 0 ||
      event.sender !== window.webContents ||
      event.senderFrame !== window.webContents.mainFrame ||
      event.senderFrame?.url !== 'paperclip://app/index.html'
    )
      return;
    window.close();
  };
  ipcMain.on('companion:close', close);
  window.webContents.once('destroyed', () =>
    ipcMain.removeListener('companion:close', close),
  );
}
