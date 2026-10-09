import { createRequire } from 'node:module';
import { expect, it, vi } from 'vitest';
import type { ChatErrorCode, ChatEvent } from '../../src/core/chat-protocol';
const install = createRequire(import.meta.url)(
  '../e2e/chat-fault-control.cjs',
) as (ipc: { handle: ReturnType<typeof vi.fn> }) => {
  code: ChatErrorCode | null;
  chunks: number;
  starts: number;
  injected: number;
};
it('preserves denied calls and original arguments, injects once after partial text, then passes real results', async () => {
  const handle = vi.fn();
  const ipc = { handle };
  const state = install(ipc);
  const next = vi.fn<(...args: unknown[]) => Promise<ChatEvent | null>>();
  ipc.handle('companion:chat-next', next);
  const wrapped = handle.mock.calls[0]![1];
  const event = { sender: 'synthetic' };
  state.code = 'OFFLINE';
  next.mockResolvedValueOnce(null);
  expect(await wrapped(event, 1, 'extra')).toBeNull();
  expect(next).toHaveBeenLastCalledWith(event, 1, 'extra');
  expect(state).toMatchObject({ code: 'OFFLINE', injected: 0, chunks: 0 });
  next.mockResolvedValue({ type: 'chunk', text: 'synthetic' });
  expect(await wrapped(event, 1)).toEqual({ type: 'chunk', text: 'synthetic' });
  expect(await wrapped(event, 1)).toEqual({ type: 'error', code: 'OFFLINE' });
  expect(state).toMatchObject({ code: null, injected: 1 });
  expect(await wrapped(event, 1)).toEqual({ type: 'chunk', text: 'synthetic' });
  next.mockResolvedValueOnce({ type: 'complete' });
  expect(await wrapped(event, 1)).toEqual({ type: 'complete' });
});
it('counts only accepted starts and leaves unrelated handlers alone', async () => {
  const handle = vi.fn();
  const ipc = { handle };
  const state = install(ipc);
  const start = vi.fn().mockResolvedValueOnce(false).mockResolvedValue(true);
  ipc.handle('companion:chat-start', start);
  const wrapped = handle.mock.calls[0]![1];
  expect(await wrapped('event', 'denied')).toBe(false);
  expect(state.starts).toBe(0);
  expect(await wrapped('event', 'accepted')).toBe(true);
  expect(state.starts).toBe(1);
  const copy = vi.fn();
  ipc.handle('companion:copy', copy);
  expect(handle.mock.calls[1]).toEqual(['companion:copy', copy]);
});
