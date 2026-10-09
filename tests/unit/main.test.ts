import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => {
  const webContents = { setWindowOpenHandler: vi.fn(), on: vi.fn() };
  const window = {
    webContents,
    once: vi.fn(),
    showInactive: vi.fn(),
    loadURL: vi.fn(),
  };
  const shellSession = {
    setPermissionCheckHandler: vi.fn(),
    setPermissionRequestHandler: vi.fn(),
    setDisplayMediaRequestHandler: vi.fn(),
    on: vi.fn(),
    webRequest: { onBeforeRequest: vi.fn() },
    protocol: { handle: vi.fn() },
  };
  return {
    installTray: vi.fn(),
    window,
    shellSession,
    readFile: vi.fn(),
    BrowserWindow: vi.fn(function () {
      return window;
    }),
    app: {
      enableSandbox: vi.fn(),
      whenReady: vi.fn(),
      getAppPath: vi.fn(() => '/app'),
      on: vi.fn(),
      quit: vi.fn(),
      exit: vi.fn(),
    },
    protocol: { registerSchemesAsPrivileged: vi.fn() },
    session: { fromPartition: vi.fn(() => shellSession) },
    Menu: { setApplicationMenu: vi.fn() },
    screen: {
      getPrimaryDisplay: vi.fn(() => ({
        workArea: { x: 0, y: 0, width: 1920, height: 1040 },
      })),
    },
  };
});
vi.mock('electron', () => mocks);
vi.mock('../../src/main/tray', () => ({ installTray: mocks.installTray }));
vi.mock('node:fs/promises', () => ({ readFile: mocks.readFile }));

beforeEach(() => {
  vi.resetModules();
  vi.clearAllMocks();
  mocks.app.whenReady.mockResolvedValue(undefined);
  mocks.window.loadURL.mockResolvedValue(undefined);
  mocks.readFile.mockResolvedValue(new Uint8Array([65]));
});

async function start() {
  await import('../../src/main/index');
  await vi.waitFor(() => expect(mocks.window.loadURL).toHaveBeenCalled());
}

describe('actual main-process wiring', () => {
  it('creates a sandboxed window without a privileged bridge and closes cleanly', async () => {
    await start();
    expect(mocks.installTray).toHaveBeenCalledWith(mocks.window);
    expect(mocks.installTray.mock.invocationCallOrder[0]).toBeLessThan(
      mocks.window.loadURL.mock.invocationCallOrder[0]!,
    );
    expect(mocks.app.enableSandbox).toHaveBeenCalledOnce();
    expect(mocks.BrowserWindow).toHaveBeenCalledWith(
      expect.objectContaining({
        x: 1616,
        y: 676,
        width: 280,
        height: 340,
        frame: false,
        transparent: true,
        resizable: false,
        maximizable: false,
        fullscreenable: false,
        alwaysOnTop: true,
        skipTaskbar: false,
        hasShadow: false,
        webPreferences: {
          session: mocks.shellSession,
          sandbox: true,
          contextIsolation: true,
          nodeIntegration: false,
          nodeIntegrationInWorker: false,
          webSecurity: true,
          allowRunningInsecureContent: false,
          webviewTag: false,
        },
      }),
    );
    expect(mocks.session.fromPartition).toHaveBeenCalledWith(
      'paperclip-shell',
      { cache: false },
    );
    expect(mocks.window.loadURL).toHaveBeenCalledWith(
      'paperclip://app/index.html',
    );
    mocks.window.once.mock.calls[0]![1]();
    expect(mocks.window.showInactive).toHaveBeenCalledOnce();
    mocks.app.on.mock.calls.find(
      ([name]) => name === 'window-all-closed',
    )![1]();
    expect(mocks.app.quit).toHaveBeenCalledOnce();
  });

  it('denies permissions, downloads, navigation, popups and external requests', async () => {
    await start();
    const s = mocks.shellSession;
    expect(s.setPermissionCheckHandler.mock.calls[0]![0]()).toBe(false);
    const callback = vi.fn();
    s.setPermissionRequestHandler.mock.calls[0]![0](null, 'camera', callback);
    expect(callback).toHaveBeenLastCalledWith(false);
    s.setDisplayMediaRequestHandler.mock.calls[0]![0]({}, callback);
    expect(callback).toHaveBeenLastCalledWith({});
    expect(
      mocks.window.webContents.setWindowOpenHandler.mock.calls[0]![0](),
    ).toEqual({ action: 'deny' });
    for (const name of [
      'will-navigate',
      'will-frame-navigate',
      'will-attach-webview',
    ]) {
      const event = { preventDefault: vi.fn() };
      mocks.window.webContents.on.mock.calls.find(([n]) => n === name)![1](
        event,
      );
      expect(event.preventDefault).toHaveBeenCalledOnce();
    }
    const event = { preventDefault: vi.fn() };
    s.on.mock.calls[0]![1](event);
    expect(event.preventDefault).toHaveBeenCalledOnce();
    const filter = s.webRequest.onBeforeRequest.mock.calls[0]![0];
    filter({ url: 'https://example.com', method: 'GET' }, callback);
    expect(callback).toHaveBeenLastCalledWith({ cancel: true });
    filter({ url: 'paperclip://app/index.html', method: 'GET' }, callback);
    expect(callback).toHaveBeenLastCalledWith({ cancel: false });
  });

  it('serves only bundled bytes with CSP, denies invalid paths and hides read errors', async () => {
    await start();
    const handler = mocks.shellSession.protocol.handle.mock.calls[0]![1];
    const denied: Response = await handler({
      url: 'paperclip://app/package.json',
      method: 'GET',
    });
    expect(denied.status).toBe(403);
    expect(mocks.readFile).not.toHaveBeenCalled();
    const served: Response = await handler({
      url: 'paperclip://app/index.html',
      method: 'GET',
    });
    expect(await served.text()).toBe('A');
    expect(served.headers.get('Content-Security-Policy')).toContain(
      "connect-src 'none'",
    );
    expect(served.headers.get('X-Content-Type-Options')).toBe('nosniff');
    expect(served.headers.get('Cache-Control')).toBe('no-store');
    mocks.readFile.mockRejectedValueOnce(new Error('sensitive path'));
    const missing: Response = await handler({
      url: 'paperclip://app/assets/missing.js',
      method: 'GET',
    });
    expect(missing.status).toBe(404);
    expect(await missing.text()).toBe('');
  });

  it('reports a fixed failure code without leaking exception details', async () => {
    const diagnostic = vi.spyOn(console, 'error').mockImplementation(() => {});
    try {
      mocks.window.loadURL.mockRejectedValueOnce(new Error('private detail'));
      await start();
      await vi.waitFor(() => expect(mocks.app.exit).toHaveBeenCalledWith(1));
      expect(diagnostic).toHaveBeenCalledExactlyOnceWith('SHELL_START_FAILED');
    } finally {
      diagnostic.mockRestore();
    }
  });
});
