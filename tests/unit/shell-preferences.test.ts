import { beforeEach, expect, it, vi } from 'vitest';
import { EventEmitter } from 'node:events';
import type { BrowserWindow } from 'electron';
import {
  installShellPreferences,
  restoredOverlayBounds,
} from '../../src/main/shell-preferences';
import {
  installDisplayRecovery,
  recoverWindow,
} from '../../src/main/display-recovery';
import { defaultPreferences } from '../../src/main/preferences';
const m = vi.hoisted(() => ({
  on: vi.fn(),
  screenOn: vi.fn(),
  remove: vi.fn(),
  areas: vi.fn(),
}));
vi.mock('electron', () => ({
  app: { on: m.on },
  screen: {
    on: m.screenOn,
    removeListener: m.remove,
    getAllDisplays: m.areas,
    getPrimaryDisplay: () => ({
      workArea: { x: 0, y: 0, width: 1000, height: 700 },
    }),
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  m.areas.mockReturnValue([
    { workArea: { x: 0, y: 0, width: 1000, height: 700 } },
  ]);
});
function windowFixture() {
  return Object.assign(new EventEmitter(), {
    isDestroyed: vi.fn(() => false),
    getBounds: vi.fn(() => ({ x: 900, y: 600, width: 280, height: 340 })),
    setBounds: vi.fn(),
    setMinimumSize: vi.fn(),
    showInactive: vi.fn(),
    setAlwaysOnTop: vi.fn(),
  });
}
it.each([
  [true, true, true],
  [false, true, false],
  [false, false, true],
])('restores visibility %s with tray %s (shown %s)', (visible, tray, shown) => {
  const window = windowFixture();
  let state = { ...defaultPreferences(), visible };
  const store = {
    get: () => state,
    update: vi.fn((patch) => {
      state = { ...state, ...patch };
    }),
    flush: vi.fn(),
  };
  const controls = installShellPreferences(
    window as unknown as BrowserWindow,
    store,
  );
  controls.start(tray);
  window.emit('ready-to-show');
  expect(window.showInactive).toHaveBeenCalledTimes(shown ? 1 : 0);
  expect(state.position).toEqual({ x: 900, y: 600 });
  window.emit('hide');
  expect(state.visible).toBe(false);
  window.emit('show');
  expect(state.visible).toBe(true);
  controls.setAlwaysOnTop(false);
  expect(window.setAlwaysOnTop).toHaveBeenCalledWith(false);
  expect(state.alwaysOnTop).toBe(false);
  controls.reset();
  expect(state.alwaysOnTop).toBe(true);
  expect(state.visible).toBe(true);
  expect(window.setBounds).toHaveBeenCalledWith({
    x: 696,
    y: 336,
    width: 280,
    height: 340,
  });
  m.on.mock.calls.find(([n]) => n === 'before-quit')![1]();
  expect(store.flush).toHaveBeenCalledOnce();
  store.update.mockClear();
  window.emit('hide');
  window.emit('show');
  window.emit('move');
  expect(store.update).not.toHaveBeenCalled();
});
it('clamps restored position and keeps default placement without a saved position', () => {
  expect(restoredOverlayBounds(defaultPreferences())).toEqual({
    x: 696,
    y: 336,
    width: 280,
    height: 340,
  });
  m.areas.mockReturnValue([
    { workArea: { x: -1000, y: 0, width: 1000, height: 700 } },
  ]);
  expect(
    restoredOverlayBounds({
      ...defaultPreferences(),
      position: { x: -500, y: 50 },
    }),
  ).toEqual({ x: -500, y: 50, width: 280, height: 340 });
});
it('recovers removed/smaller displays without showing or focusing and removes listeners', () => {
  const window = windowFixture();
  const native = window as unknown as BrowserWindow;
  installDisplayRecovery(native, true);
  for (const [, recover] of m.screenOn.mock.calls) recover();
  expect(window.setBounds).toHaveBeenCalledWith({
    x: 720,
    y: 360,
    width: 280,
    height: 340,
  });
  expect(window.setMinimumSize).toHaveBeenCalledWith(280, 340);
  window.emit('restore');
  window.getBounds.mockReturnValue({ x: 0, y: 0, width: 280, height: 340 });
  window.setBounds.mockClear();
  recoverWindow(native);
  expect(window.setBounds).not.toHaveBeenCalled();
  window.isDestroyed.mockReturnValue(true);
  recoverWindow(native, true);
  expect(window.showInactive).not.toHaveBeenCalled();
  window.emit('closed');
  expect(m.remove).toHaveBeenCalledTimes(3);
});
it('does not read position after window destruction', () => {
  const window = windowFixture();
  window.isDestroyed.mockReturnValue(true);
  const store = { get: defaultPreferences, update: vi.fn(), flush: vi.fn() };
  installShellPreferences(window as unknown as BrowserWindow, store);
  window.emit('move');
  expect(store.update).not.toHaveBeenCalled();
});
