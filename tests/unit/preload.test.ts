import { expect, it, vi } from 'vitest';
const m = vi.hoisted(() => ({
  exposeInMainWorld: vi.fn(),
  send: vi.fn(),
  invoke: vi.fn(),
}));
vi.mock('electron', () => ({ contextBridge: m, ipcRenderer: m }));
it('exposes only a fixed close action without forwarding arguments or Electron objects', async () => {
  await import('../../src/preload/index');
  expect(m.exposeInMainWorld).toHaveBeenCalledOnce();
  const [name, api] = m.exposeInMainWorld.mock.calls[0]!;
  expect(name).toBe('companionWindow');
  expect(Object.keys(api)).toEqual(['close', 'openChat', 'copyText']);
  api.close('ignored');
  expect(m.send).toHaveBeenCalledExactlyOnceWith('companion:close');
  api.openChat('ignored');
  expect(m.send).toHaveBeenLastCalledWith('companion:open-chat');
  m.invoke.mockResolvedValue(true);
  expect(await api.copyText('sample')).toBe(true);
  expect(m.invoke).toHaveBeenCalledWith('companion:copy', 'sample');
});
