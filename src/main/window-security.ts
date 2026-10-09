import { app, type BrowserWindow, type Session } from 'electron';
import path from 'node:path';
export function windowPreferences(session: Session) {
  return {
    session,
    preload: path.join(app.getAppPath(), 'dist/main/preload.cjs'),
    sandbox: true,
    contextIsolation: true,
    nodeIntegration: false,
    nodeIntegrationInWorker: false,
    webSecurity: true,
    allowRunningInsecureContent: false,
    webviewTag: false,
  };
}
export function lockWindow(window: BrowserWindow): void {
  window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
  window.webContents.on('will-navigate', (e) => e.preventDefault());
  window.webContents.on('will-frame-navigate', (e) => e.preventDefault());
  window.webContents.on('will-attach-webview', (e) => e.preventDefault());
}
