import { app, BrowserWindow, Menu, protocol, session } from 'electron';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { CONTENT_SECURITY_POLICY, resolveResource } from './resource-policy';

// Keep the renderer sandbox in every launch, including tests.
app.enableSandbox();
protocol.registerSchemesAsPrivileged([
  {
    scheme: 'paperclip',
    privileges: { standard: true, secure: true, supportFetchAPI: true },
  },
]);

app
  .whenReady()
  .then(async () => {
    // No persistent renderer partition, permission grants, or renderer network egress.
    const shellSession = session.fromPartition('paperclip-shell', {
      cache: false,
    });
    shellSession.setPermissionCheckHandler(() => false);
    shellSession.setPermissionRequestHandler(
      (_contents, _permission, callback) => callback(false),
    );
    shellSession.setDisplayMediaRequestHandler((_request, callback) =>
      callback({}),
    );
    shellSession.on('will-download', (event) => event.preventDefault());
    shellSession.webRequest.onBeforeRequest((details, callback) => {
      callback({
        cancel: resolveResource(details.url, details.method) === null,
      });
    });
    shellSession.protocol.handle('paperclip', async (request) => {
      const resource = resolveResource(request.url, request.method);
      if (!resource) return new Response(null, { status: 403 });
      try {
        const bytes = await readFile(
          path.join(app.getAppPath(), 'dist/renderer', resource.path),
        );
        return new Response(new Uint8Array(bytes), {
          headers: {
            'Content-Type': `${resource.mime}; charset=utf-8`,
            'Content-Security-Policy': CONTENT_SECURITY_POLICY,
            'X-Content-Type-Options': 'nosniff',
            'Cache-Control': 'no-store',
          },
        });
      } catch {
        return new Response(null, { status: 404 });
      }
    });
    Menu.setApplicationMenu(null);
    const window = new BrowserWindow({
      width: 760,
      height: 540,
      minWidth: 480,
      minHeight: 360,
      title: 'Paperclip Companion',
      show: false,
      backgroundColor: '#f4f1e9',
      webPreferences: {
        session: shellSession,
        sandbox: true,
        contextIsolation: true,
        nodeIntegration: false,
        nodeIntegrationInWorker: false,
        webSecurity: true,
        allowRunningInsecureContent: false,
        webviewTag: false,
      },
    });
    window.webContents.setWindowOpenHandler(() => ({ action: 'deny' }));
    window.webContents.on('will-navigate', (event) => event.preventDefault());
    window.webContents.on('will-frame-navigate', (event) =>
      event.preventDefault(),
    );
    window.webContents.on('will-attach-webview', (event) =>
      event.preventDefault(),
    );
    window.once('ready-to-show', () => window.show());
    await window.loadURL('paperclip://app/index.html');
  })
  .catch(() => {
    // Fixed code only: no URL, private window title, path, or payload in diagnostics.
    console.error('SHELL_START_FAILED');
    app.exit(1);
  });

app.on('window-all-closed', () => app.quit());
