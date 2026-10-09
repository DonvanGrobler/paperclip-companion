import { beforeEach, expect, it, vi } from 'vitest';
import { installTray } from '../../src/main/tray';
import type { BrowserWindow, MenuItemConstructorOptions } from 'electron';
const m = vi.hoisted(() => ({
  tray: {
    on: vi.fn(),
    setToolTip: vi.fn(),
    setContextMenu: vi.fn(),
    destroy: vi.fn(),
  },
  app: { on: vi.fn(), quit: vi.fn() },
  menu: vi.fn(),
  bitmap: vi.fn(),
  construct: vi.fn(),
}));
vi.mock('electron', () => ({
  app: m.app,
  Menu: { buildFromTemplate: m.menu },
  Tray: vi.fn(function () {
    m.construct();
    return m.tray;
  }),
  nativeImage: { createFromBitmap: m.bitmap },
  screen: {
    getPrimaryDisplay: () => ({
      workArea: { x: 0, y: 0, width: 1920, height: 1040 },
    }),
  },
}));
const w = {
  on: vi.fn(),
  hide: vi.fn(),
  show: vi.fn(),
  focus: vi.fn(),
  restore: vi.fn(),
  isMinimized: vi.fn(),
  setBounds: vi.fn(),
};
const event = (name: string) =>
  w.on.mock.calls.find(([n]) => n === name)![1] as (e: {
    preventDefault: () => void;
  }) => void;
const click = (label: string) => {
  const items = m.menu.mock.calls.at(-1)![0] as MenuItemConstructorOptions[];
  (items.find((i) => i.label === label)!.click as () => void)();
};
beforeEach(() => {
  vi.clearAllMocks();
  w.isMinimized.mockReturnValue(false);
});
it('installs an original icon, explicit unavailable items and independent show/hide controls', () => {
  installTray(w as unknown as BrowserWindow);
  expect(m.bitmap).toHaveBeenCalledWith(expect.any(Buffer), {
    width: 16,
    height: 16,
  });
  expect(m.menu.mock.calls[0]![0]).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        label: 'Open chat (coming next)',
        enabled: false,
      }),
      expect.objectContaining({
        label: 'Preferences (coming soon)',
        enabled: false,
      }),
    ]),
  );
  click('Hide character');
  expect(w.hide).toHaveBeenCalledOnce();
  click('Show character');
  expect(w.show).toHaveBeenCalledOnce();
  expect(w.focus).toHaveBeenCalledOnce();
  w.isMinimized.mockReturnValue(true);
  m.tray.on.mock.calls.find(([n]) => n === 'click')![1]();
  expect(w.restore).toHaveBeenCalledOnce();
  m.app.on.mock.calls.find(([n]) => n === 'activate')![1]();
  expect(w.show).toHaveBeenCalledTimes(3);
  click('Recover character');
  expect(w.setBounds).toHaveBeenCalledWith({
    x: 1616,
    y: 676,
    width: 280,
    height: 340,
  });
});
it('hides on close but allows quit and destroys the retained tray', () => {
  installTray(w as unknown as BrowserWindow);
  const e = { preventDefault: vi.fn() };
  event('close')(e);
  expect(e.preventDefault).toHaveBeenCalledOnce();
  expect(w.hide).toHaveBeenCalledOnce();
  click('Quit');
  expect(m.app.quit).toHaveBeenCalledOnce();
  m.app.on.mock.calls.find(([n]) => n === 'before-quit')![1]();
  e.preventDefault.mockClear();
  event('close')(e);
  expect(e.preventDefault).not.toHaveBeenCalled();
  m.app.on.mock.calls.find(([n]) => n === 'will-quit')![1]();
  expect(m.tray.destroy).toHaveBeenCalledOnce();
});
it.each(['construct', 'menu'] as const)(
  'keeps ordinary close on %s failure without logging details',
  (failure) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    m[failure].mockImplementationOnce(() => {
      throw new Error('private details');
    });
    try {
      installTray(w as unknown as BrowserWindow);
      expect(w.on).not.toHaveBeenCalled();
      expect(log).toHaveBeenCalledExactlyOnceWith('TRAY_UNAVAILABLE');
      expect(w.show).toHaveBeenCalledOnce();
    } finally {
      log.mockRestore();
    }
  },
);
