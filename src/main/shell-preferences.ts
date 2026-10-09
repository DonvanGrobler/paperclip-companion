import { app, screen, type BrowserWindow } from 'electron';
import {
  defaultPreferences,
  type PreferenceStore,
  type ShellPreferences,
} from './preferences';
import { fitBounds, initialOverlayBounds } from './overlay-layout';
import { installDisplayRecovery } from './display-recovery';

export function restoredOverlayBounds(preferences: ShellPreferences) {
  const primary = screen.getPrimaryDisplay().workArea;
  const bounds = {
    ...initialOverlayBounds(primary),
    ...preferences.position,
    width: 280,
    height: 340,
  };
  return fitBounds(
    bounds,
    screen.getAllDisplays().map((d) => d.workArea),
    primary,
  );
}
export function installShellPreferences(
  window: BrowserWindow,
  store: PreferenceStore,
) {
  let quitting = false;
  const position = () => {
    if (quitting || window.isDestroyed()) return;
    const { x, y } = window.getBounds();
    store.update({ position: { x, y } });
  };
  window.on('move', position);
  window.on('show', () => {
    if (!quitting) store.update({ visible: true });
  });
  window.on('hide', () => {
    if (!quitting) store.update({ visible: false });
  });
  app.on('before-quit', () => {
    position();
    quitting = true;
    store.flush();
  });
  installDisplayRecovery(window);
  return {
    start(trayAvailable: boolean) {
      window.once('ready-to-show', () => {
        position();
        if (!trayAvailable || store.get().visible) window.showInactive();
      });
    },
    setAlwaysOnTop(value: boolean) {
      window.setAlwaysOnTop(value);
      store.update({ alwaysOnTop: value });
    },
    reset() {
      store.update(defaultPreferences());
      window.setAlwaysOnTop(true);
      window.setBounds(
        initialOverlayBounds(screen.getPrimaryDisplay().workArea),
      );
      position();
    },
  };
}
