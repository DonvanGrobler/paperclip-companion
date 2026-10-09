import { expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({ exposeInMainWorld: vi.fn(), send: vi.fn() }));
vi.mock('electron', () => ({ contextBridge: m, ipcRenderer: m }));
it('exposes only a fixed close action without forwarding arguments or Electron objects', async () => {
  await import('../../src/preload/index');
  expect(m.exposeInMainWorld).toHaveBeenCalledOnce();
  const [name, api] = m.exposeInMainWorld.mock.calls[0]!;
  expect(name).toBe('companionWindow');
  expect(Object.keys(api)).toEqual(['close']);
  api.close('ignored');
  expect(m.send).toHaveBeenCalledExactlyOnceWith('companion:close');
});
