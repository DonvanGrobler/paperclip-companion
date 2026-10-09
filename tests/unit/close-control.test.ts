import { beforeEach, expect, it, vi } from 'vitest';
import type { BrowserWindow, IpcMainEvent } from 'electron';
import { installCloseControl } from '../../src/main/close-control';
const m = vi.hoisted(() => ({ on: vi.fn(), removeListener: vi.fn() }));
vi.mock('electron', () => ({ ipcMain: m }));
beforeEach(() => vi.clearAllMocks());
it('allows only the owning bundled main frame, no arguments; cleans up on destruction', () => {
  const frame = { url: 'paperclip://app/index.html' };
  const contents = { mainFrame: frame, once: vi.fn() };
  const window = { webContents: contents, close: vi.fn() };
  installCloseControl(window as unknown as BrowserWindow);
  const handler = m.on.mock.calls[0]![1] as (
    e: IpcMainEvent,
    ...a: unknown[]
  ) => void;
  const valid = {
    sender: contents,
    senderFrame: frame,
  } as unknown as IpcMainEvent;
  handler({ ...valid, sender: {} } as IpcMainEvent);
  handler({ ...valid, senderFrame: { url: frame.url } } as IpcMainEvent);
  handler({ ...valid, senderFrame: null });
  handler(valid, 'unexpected');
  frame.url = 'https://example.com';
  handler(valid);
  expect(window.close).not.toHaveBeenCalled();
  frame.url = 'paperclip://app/index.html';
  handler(valid);
  expect(window.close).toHaveBeenCalledOnce();
  contents.once.mock.calls[0]![1]();
  expect(m.removeListener).toHaveBeenCalledWith('companion:close', handler);
});
