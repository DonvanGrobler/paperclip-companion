import { beforeEach, expect, it, vi } from 'vitest';
import type { Session } from 'electron';
import { createChatOpener } from '../../src/main/chat-window';
const m = vi.hoisted(() => {
  const frame = { url: 'paperclip://app/chat.html' };
  const webContents = {
    mainFrame: frame,
    once: vi.fn(),
    on: vi.fn(),
    setWindowOpenHandler: vi.fn(),
  };
  const window = {
    webContents,
    once: vi.fn(),
    show: vi.fn(),
    focus: vi.fn(),
    restore: vi.fn(),
    isMinimized: vi.fn(),
    isDestroyed: vi.fn(),
    destroy: vi.fn(),
    close: vi.fn(),
    loadURL: vi.fn(),
  };
  return {
    window,
    create: vi.fn(),
    clipboard: { writeText: vi.fn() },
    ipcMain: {
      on: vi.fn(),
      handle: vi.fn(),
      removeHandler: vi.fn(),
      removeListener: vi.fn(),
    },
  };
});
vi.mock('electron', () => ({
  BrowserWindow: vi.fn(function (options) {
    m.create(options);
    return m.window;
  }),
  clipboard: m.clipboard,
  ipcMain: m.ipcMain,
  app: { getAppPath: () => '/app' },
  screen: {
    getPrimaryDisplay: () => ({
      workArea: { x: -1000, y: 0, width: 500, height: 500 },
    }),
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  m.window.loadURL.mockResolvedValue(undefined);
  m.window.isMinimized.mockReturnValue(false);
  m.window.isDestroyed.mockReturnValue(false);
  m.clipboard.writeText.mockResolvedValue(undefined);
  m.window.webContents.mainFrame.url = 'paperclip://app/chat.html';
});
it('creates on demand, shares the hardened boundary, reuses and reopens after close', () => {
  const open = createChatOpener({} as Session);
  expect(m.create).not.toHaveBeenCalled();
  open();
  expect(m.create).toHaveBeenCalledWith(
    expect.objectContaining({
      width: 500,
      height: 500,
      x: -1000,
      show: false,
      webPreferences: expect.objectContaining({
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
      }),
    }),
  );
  expect(m.window.loadURL).toHaveBeenCalledWith('paperclip://app/chat.html');
  m.window.once.mock.calls.find(([n]) => n === 'ready-to-show')![1]();
  expect(m.window.show).toHaveBeenCalledOnce();
  open();
  m.window.isMinimized.mockReturnValue(true);
  open();
  expect(m.window.restore).toHaveBeenCalledOnce();
  expect(m.create).toHaveBeenCalledOnce();
  expect(m.window.webContents.setWindowOpenHandler.mock.calls[0]![0]()).toEqual(
    { action: 'deny' },
  );
  for (const [, callback] of m.window.webContents.on.mock.calls) {
    const event = { preventDefault: vi.fn() };
    callback(event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
  }
  m.window.once.mock.calls.find(([n]) => n === 'closed')![1]();
  expect(m.ipcMain.removeHandler).toHaveBeenCalledWith('companion:copy');
  open();
  expect(m.create).toHaveBeenCalledTimes(2);
});
it('allows only bounded plain text from chat, rejects other callers and catches clipboard failures', async () => {
  createChatOpener({} as Session)();
  const copy = m.ipcMain.handle.mock.calls[0]![1];
  const event = {
    sender: m.window.webContents,
    senderFrame: m.window.webContents.mainFrame,
  };
  for (const args of [
    [],
    [''],
    [null],
    [44],
    ['x'.repeat(12001)],
    ['x', 'extra'],
  ])
    expect(await copy(event, ...args)).toBe(false);
  expect(await copy({ ...event, sender: {} }, 'x')).toBe(false);
  expect(await copy({ ...event, senderFrame: null }, 'x')).toBe(false);
  m.window.webContents.mainFrame.url = 'paperclip://app/index.html';
  expect(await copy(event, 'x')).toBe(false);
  expect(m.clipboard.writeText).not.toHaveBeenCalled();
  m.window.webContents.mainFrame.url = 'paperclip://app/chat.html';
  expect(await copy(event, 'sample')).toBe(true);
  expect(m.clipboard.writeText).toHaveBeenCalledWith('sample');
  m.clipboard.writeText.mockRejectedValueOnce(new Error('private'));
  expect(await copy(event, 'sample')).toBe(false);
});
it.each([false, true])(
  'reports fixed load failure and safely disposes (already destroyed: %s)',
  async (destroyed) => {
    const log = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      m.window.isDestroyed.mockReturnValue(destroyed);
      m.window.loadURL.mockRejectedValueOnce(new Error('private'));
      createChatOpener({} as Session)();
      await vi.waitFor(() =>
        expect(log).toHaveBeenCalledExactlyOnceWith('CHAT_LOAD_FAILED'),
      );
      expect(m.window.destroy).toHaveBeenCalledTimes(destroyed ? 0 : 1);
    } finally {
      log.mockRestore();
    }
  },
);
