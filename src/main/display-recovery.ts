import { screen, type BrowserWindow } from 'electron';
import { fitBounds } from './overlay-layout';

export function recoverWindow(window: BrowserWindow, chat = false): void {
  if (window.isDestroyed()) return;
  const bounds = window.getBounds();
  const fitted = fitBounds(
    bounds,
    screen.getAllDisplays().map((d) => d.workArea),
    screen.getPrimaryDisplay().workArea,
  );
  if (chat)
    window.setMinimumSize(
      Math.min(360, fitted.width),
      Math.min(420, fitted.height),
    );
  if (JSON.stringify(bounds) !== JSON.stringify(fitted))
    window.setBounds(fitted);
}
export function installDisplayRecovery(
  window: BrowserWindow,
  chat = false,
): void {
  const recover = () => recoverWindow(window, chat);
  screen.on('display-added', recover);
  screen.on('display-removed', recover);
  screen.on('display-metrics-changed', recover);
  window.on('restore', recover);
  window.once('closed', () => {
    screen.removeListener('display-added', recover);
    screen.removeListener('display-removed', recover);
    screen.removeListener('display-metrics-changed', recover);
  });
}
