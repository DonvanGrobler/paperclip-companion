import { beforeEach, expect, it, vi } from 'vitest';
import type { BrowserWindow } from 'electron';
import { installChatStream } from '../../src/main/chat-ipc';
const m = vi.hoisted(() => ({
  ipcMain: { handle: vi.fn(), removeHandler: vi.fn() },
  app: { on: vi.fn(), removeListener: vi.fn() },
  session: { start: vi.fn(), next: vi.fn(), cancel: vi.fn(), reset: vi.fn() },
}));
vi.mock('electron', () => ({ ipcMain: m.ipcMain, app: m.app }));
vi.mock('../../src/main/chat-session', () => ({
  createChatSession: () => m.session,
}));
beforeEach(() => vi.clearAllMocks());
function setup() {
  const webContents = {
    mainFrame: { url: 'paperclip://app/chat.html' },
    on: vi.fn(),
    removeListener: vi.fn(),
    once: vi.fn(),
  };
  const window = { webContents, isDestroyed: vi.fn(() => false) };
  installChatStream(window as unknown as BrowserWindow);
  const event = { sender: webContents, senderFrame: webContents.mainFrame };
  return { window, webContents, event };
}
it('validates sender, exact frame/URL and argument count for every operation', async () => {
  const { window, webContents, event } = setup();
  for (const [channel, handler] of m.ipcMain.handle.mock.calls) {
    const empty = channel === 'companion:chat-next' ? null : false;
    for (const args of [[], [1, 2]])
      expect(await handler(event, ...args)).toBe(empty);
    expect(await handler({ ...event, sender: {} }, 1)).toBe(empty);
    expect(
      await handler(
        { ...event, senderFrame: { url: event.senderFrame.url } },
        1,
      ),
    ).toBe(empty);
    expect(await handler({ ...event, senderFrame: null }, 1)).toBe(empty);
    webContents.mainFrame.url = 'paperclip://app/index.html';
    expect(await handler(event, 1)).toBe(empty);
    webContents.mainFrame.url = 'paperclip://app/chat.html';
    window.isDestroyed.mockReturnValue(true);
    expect(await handler(event, 1)).toBe(empty);
    window.isDestroyed.mockReturnValue(false);
  }
  expect(m.session.start).not.toHaveBeenCalled();
  expect(m.session.next).not.toHaveBeenCalled();
  expect(m.session.cancel).not.toHaveBeenCalled();
});
it('forwards only fixed operations and suppresses results after navigation', async () => {
  const { webContents, event } = setup();
  const handler = (name: string) =>
    m.ipcMain.handle.mock.calls.find(
      ([n]) => n === `companion:chat-${name}`,
    )![1];
  m.session.start.mockReturnValue(true);
  m.session.cancel.mockReturnValue(true);
  m.session.next.mockResolvedValue({ type: 'complete' });
  const request = { run: 1, prompt: 'sample', scenario: 'reply' };
  expect(await handler('start')(event, request)).toBe(true);
  expect(m.session.start).toHaveBeenCalledExactlyOnceWith(request);
  expect(await handler('next')(event, 1)).toEqual({ type: 'complete' });
  expect(await handler('cancel')(event, 1)).toBe(true);
  m.session.next.mockImplementationOnce(async () => {
    webContents.mainFrame.url = 'about:blank';
    return { type: 'chunk', text: 'late' };
  });
  expect(await handler('next')(event, 1)).toBeNull();
});
it('resets on document load, renderer failure and app quit; removes listeners/handlers on destruction', () => {
  const { webContents } = setup();
  for (const name of ['did-start-loading', 'render-process-gone'])
    webContents.on.mock.calls.find(([n]) => n === name)![1]();
  m.app.on.mock.calls.find(([n]) => n === 'before-quit')![1]();
  expect(m.session.reset).toHaveBeenCalledTimes(3);
  webContents.once.mock.calls.find(([n]) => n === 'destroyed')![1]();
  expect(m.session.reset).toHaveBeenCalledTimes(4);
  expect(m.ipcMain.removeHandler.mock.calls.map(([name]) => name)).toEqual([
    'companion:chat-start',
    'companion:chat-next',
    'companion:chat-cancel',
  ]);
  expect(m.app.removeListener).toHaveBeenCalledWith(
    'before-quit',
    m.session.reset,
  );
  expect(webContents.removeListener).toHaveBeenCalledTimes(2);
});
