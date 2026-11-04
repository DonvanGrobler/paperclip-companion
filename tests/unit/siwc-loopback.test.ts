import http from 'node:http';
import net from 'node:net';
import { once } from 'node:events';
import { randomUUID } from 'node:crypto';
import { afterEach, expect, it, vi } from 'vitest';
import { createSiwcAuthTransaction } from '../../src/main/siwc-auth-transaction';
import { createSiwcBrowserLauncher } from '../../src/main/siwc-browser-launcher';
import {
  startSiwcLoopbackListener,
  type SiwcLoopbackListener,
} from '../../src/main/siwc-loopback';

const state = 's'.repeat(43);
const marker = () => `synthetic:${randomUUID()}`;
const owners: SiwcLoopbackListener[] = [];
afterEach(async () => {
  const current = owners.splice(0);
  for (const owner of current) owner.close();
  await Promise.all(current.map((owner) => owner.closed));
  vi.restoreAllMocks();
});
async function listener(callback: (url: string) => boolean) {
  const owner = await startSiwcLoopbackListener(
    callback,
    new AbortController().signal,
  );
  if (!owner) throw new Error('EXPECTED_LOOPBACK');
  owners.push(owner);
  return owner;
}
async function request(
  uri: string,
  options: {
    method?: string;
    host?: string;
    body?: string;
    path?: string;
    headers?: http.OutgoingHttpHeaders;
  } = {},
) {
  return new Promise<{
    status: number | undefined;
    headers: http.IncomingHttpHeaders;
    body: string;
  }>((resolve, reject) => {
    const target = new URL(uri);
    const req = http.request(
      {
        hostname: '127.0.0.1',
        port: Number(target.port),
        path: options.path ?? target.pathname + target.search,
        method: options.method ?? 'GET',
        agent: false,
        headers: {
          ...options.headers,
          ...(options.host ? { host: options.host } : {}),
        },
      },
      (res) => {
        const chunks: Buffer[] = [];
        res.on('data', (chunk: Buffer) => chunks.push(chunk));
        res.on('error', reject);
        res.on('end', () =>
          resolve({
            status: res.statusCode,
            headers: res.headers,
            body: Buffer.concat(chunks).toString('utf8'),
          }),
        );
      },
    );
    req.on('error', reject);
    req.setTimeout(3000, () => req.destroy(new Error('TEST_TIMEOUT')));
    req.end(options.body);
  });
}
function callbackUri(
  owner: SiwcLoopbackListener,
  currentState: string,
  code: string,
) {
  const url = new URL(owner.redirectUri);
  url.searchParams.set('state', currentState);
  url.searchParams.set('code', code);
  url.searchParams.set('client_id', 'synthetic-client');
  return url.href;
}
it('binds a numeric loopback port and delivers one state-bound callback without reflecting it', async () => {
  const code = marker();
  let delivered = '';
  const owner = await listener((value) => {
    delivered = value;
    return true;
  });
  expect(
    /^http:\/\/127\.0\.0\.1:[1-9][0-9]*\/auth\/callback$/.test(
      owner.redirectUri,
    ),
  ).toBe(true);
  expect(owner.arm(state, new AbortController().signal)).toBe(true);
  const target = callbackUri(owner, state, code);
  const response = await request(target);
  expect(response.status).toBe(200);
  expect(delivered === target).toBe(true);
  expect(!response.body.includes(code) && !response.body.includes(state)).toBe(
    true,
  );
  expect(response.headers['cache-control']).toContain('no-store');
  expect(response.headers['referrer-policy']).toBe('no-referrer');
  expect(response.headers['content-security-policy']).toContain(
    "default-src 'none'",
  );
  await owner.closed;
});
it('ignores a wrong state and still accepts the valid attempt', async () => {
  let calls = 0;
  const owner = await listener(() => {
    calls++;
    return true;
  });
  expect(owner.arm(state, new AbortController().signal)).toBe(true);
  const denied = await request(callbackUri(owner, 'x'.repeat(43), marker()));
  expect(denied.status).not.toBe(200);
  expect(calls).toBe(0);
  expect((await request(callbackUri(owner, state, marker()))).status).toBe(200);
  expect(calls).toBe(1);
  await owner.closed;
});

it('rejects unarmed, malformed and cross-host requests without consuming the attempt', async () => {
  const callback = vi.fn(() => true);
  const owner = await listener(callback);
  const target = callbackUri(owner, state, marker());
  expect((await request(target)).status).toBe(400);
  expect(owner.arm(state, new AbortController().signal)).toBe(true);
  const invalid = [
    { method: 'POST' },
    { host: 'evil.invalid' },
    { body: 'x', headers: { 'content-length': '1' } },
    { headers: { 'transfer-encoding': 'chunked' } },
    { path: '/other?state=' + state },
    { path: '/auth/callback' },
    { path: '/auth/callback?code=none' },
    { path: '/auth/callback?state=' + state + '&state=' + state },
    { path: '/auth/callback?state=short' },
    { path: '/auth/callback?state=' + state + '&bad=%ZZ' },
    { path: '/auth/callback?state=' + state + '#fragment' },
    { path: '/auth/callback?state=' + state + '&long=' + 'a'.repeat(16400) },
  ];
  for (const options of invalid) {
    const response = await request(target, options);
    expect(response.status).toBe(400);
    expect(response.body).toBe('Unable to process this request.');
    expect(response.headers['cache-control']).toBe('no-store');
  }
  expect(callback).not.toHaveBeenCalled();
  expect((await request(target)).status).toBe(200);
  expect(callback).toHaveBeenCalledOnce();
  await owner.closed;
  await expect(request(target)).rejects.toBeDefined();
});

it('validates arming, cancellation and idempotent closure', async () => {
  const outer = new AbortController();
  const callback = vi.fn(() => true);
  const owner = await startSiwcLoopbackListener(callback, outer.signal);
  if (!owner) throw new Error('EXPECTED_LOOPBACK');
  owners.push(owner);
  const alreadyAborted = new AbortController();
  alreadyAborted.abort();
  expect(owner.arm(state, alreadyAborted.signal)).toBe(false);
  expect(owner.arm('short', outer.signal)).toBe(false);
  expect(owner.arm(42, outer.signal)).toBe(false);
  const attempt = new AbortController();
  expect(owner.arm(state, attempt.signal)).toBe(true);
  expect(owner.arm(state, outer.signal)).toBe(false);
  attempt.abort();
  await owner.closed;
  owner.close();
  owner.close();
  expect(owner.arm(state, outer.signal)).toBe(false);
  await expect(
    request(callbackUri(owner, state, marker())),
  ).rejects.toBeDefined();
  expect(callback).not.toHaveBeenCalled();
});

it('bounds lifetime and rejects invalid or already cancelled starts', async () => {
  const signal = new AbortController();
  for (const lifetime of [0, -1, 1.5, 300001, Infinity]) {
    expect(
      await startSiwcLoopbackListener(() => true, signal.signal, lifetime),
    ).toBeNull();
  }
  expect(
    await startSiwcLoopbackListener(null as never, signal.signal),
  ).toBeNull();
  signal.abort();
  expect(await startSiwcLoopbackListener(() => true, signal.signal)).toBeNull();
  const owner = await startSiwcLoopbackListener(
    () => true,
    new AbortController().signal,
    80,
  );
  if (!owner) throw new Error('EXPECTED_LOOPBACK');
  owners.push(owner);
  await owner.closed;
  await expect(
    request(callbackUri(owner, state, marker())),
  ).rejects.toBeDefined();
});

it('does not arm after the monotonic lifetime even if the timer is delayed', async () => {
  const owner = await listener(() => true);
  const clock = vi
    .spyOn(performance, 'now')
    .mockReturnValue(performance.now() + 120001);
  expect(owner.arm(state, new AbortController().signal)).toBe(false);
  clock.mockRestore();
  await owner.closed;
});

it('does not deliver an expired callback even if the timer is delayed', async () => {
  const callback = vi.fn(() => true);
  const owner = await listener(callback);
  expect(owner.arm(state, new AbortController().signal)).toBe(true);
  const clock = vi
    .spyOn(performance, 'now')
    .mockReturnValue(performance.now() + 120001);
  const response = await request(callbackUri(owner, state, marker()));
  clock.mockRestore();
  expect(response.status).toBe(400);
  expect(callback).not.toHaveBeenCalled();
  await owner.closed;
});

it('fails closed if startup finishes after its monotonic deadline', async () => {
  const close = vi.spyOn(http.Server.prototype, 'close');
  const clock = vi
    .spyOn(performance, 'now')
    .mockReturnValueOnce(100)
    .mockReturnValue(120100);
  expect(
    await startSiwcLoopbackListener(() => true, new AbortController().signal),
  ).toBeNull();
  expect(close).toHaveBeenCalled();
  clock.mockRestore();
});

it('fails closed if the bound address cannot be determined', async () => {
  const address = vi
    .spyOn(http.Server.prototype, 'address')
    .mockReturnValueOnce(null);
  expect(
    await startSiwcLoopbackListener(() => true, new AbortController().signal),
  ).toBeNull();
  address.mockRestore();
});

it('stops if cancellation occurs while the transaction signal is attached', async () => {
  const owner = await listener(() => true);
  const controller = new AbortController();
  const original = controller.signal.addEventListener.bind(controller.signal);
  vi.spyOn(controller.signal, 'addEventListener').mockImplementationOnce(
    (...args) => {
      original(...args);
      controller.abort();
    },
  );
  expect(owner.arm(state, controller.signal)).toBe(false);
  await owner.closed;
});

it('keeps the fixed browser response if the callback fails or throws', async () => {
  for (const callback of [
    () => false,
    () => {
      throw new Error(marker());
    },
  ]) {
    const owner = await listener(callback);
    expect(owner.arm(state, new AbortController().signal)).toBe(true);
    const response = await request(callbackUri(owner, state, marker()));
    expect(response.status).toBe(200);
    expect(response.body).toBe('Return to Paperclip Companion.');
    expect(response.headers['x-content-type-options']).toBe('nosniff');
    expect(response.headers['x-frame-options']).toBe('DENY');
    await owner.closed;
  }
});

it('aborts the listener when its outer owner cancels', async () => {
  const controller = new AbortController();
  const owner = await startSiwcLoopbackListener(() => true, controller.signal);
  if (!owner) throw new Error('EXPECTED_LOOPBACK');
  owners.push(owner);
  controller.abort();
  await owner.closed;
  await expect(
    request(callbackUri(owner, state, marker())),
  ).rejects.toBeDefined();
});

it('fails closed on synchronous and asynchronous native binding failures', async () => {
  for (const asynchronous of [false, true]) {
    const spy = vi
      .spyOn(http.Server.prototype, 'listen')
      .mockImplementationOnce(function (this: http.Server) {
        if (asynchronous) {
          queueMicrotask(() =>
            this.emit('error', new Error('synthetic native error')),
          );
          return this;
        }
        throw new Error('synthetic native error');
      } as typeof http.Server.prototype.listen);
    const owner = await startSiwcLoopbackListener(
      () => true,
      new AbortController().signal,
    );
    expect(owner).toBeNull();
    spy.mockRestore();
  }
});

it('closes a listener when cancellation races native startup', async () => {
  const closed = vi.spyOn(http.Server.prototype, 'close');
  const controller = new AbortController();
  const pending = startSiwcLoopbackListener(() => true, controller.signal);
  controller.abort();
  expect(await pending).toBeNull();
  await vi.waitFor(() => expect(closed).toHaveBeenCalled(), { timeout: 3000 });
});

it('destroys malformed and idle connections without consuming the callback', async () => {
  let server: http.Server | undefined;
  const original = http.createServer;
  const spy = vi.spyOn(http, 'createServer').mockImplementationOnce(((
    ...args: unknown[]
  ) => {
    const created = Reflect.apply(original, http, args) as http.Server;
    server = created;
    return created;
  }) as typeof http.createServer);
  const callback = vi.fn(() => true);
  const owner = await listener(callback);
  spy.mockRestore();
  if (!server) throw new Error('EXPECTED_SERVER');
  expect(owner.arm(state, new AbortController().signal)).toBe(true);
  const port = Number(new URL(owner.redirectUri).port);
  const connection = once(server, 'connection');
  const client = net.createConnection({ host: '127.0.0.1', port });
  client.on('error', () => {});
  const [socket] = (await connection) as [net.Socket];
  socket.emit('error', new Error('synthetic socket error'));
  socket.emit('timeout');
  expect(socket.destroyed).toBe(true);
  client.destroy();

  const malformed = net.createConnection({ host: '127.0.0.1', port });
  malformed.on('error', () => {});
  const ended = new Promise<void>((resolve) =>
    malformed.once('close', resolve),
  );
  malformed.write('INVALID REQUEST\r\n\r\n');
  await ended;
  const duplicate = net.createConnection({ host: '127.0.0.1', port });
  duplicate.on('error', () => {});
  let reply = '';
  duplicate.on('data', (chunk: Buffer) => {
    reply += chunk.toString('utf8');
  });
  const duplicateEnded = new Promise<void>((resolve) =>
    duplicate.once('close', resolve),
  );
  duplicate.write(
    `GET /auth/callback?state=${state} HTTP/1.1\r\nHost: 127.0.0.1:${port}\r\nHost: evil.invalid\r\nConnection: close\r\n\r\n`,
  );
  await duplicateEnded;
  expect(reply.startsWith('HTTP/1.1 400')).toBe(true);
  expect(callback).not.toHaveBeenCalled();
  expect((await request(callbackUri(owner, state, marker()))).status).toBe(200);
  await owner.closed;
});

it('stops an established listener after a native server error', async () => {
  let server: http.Server | undefined;
  const original = http.createServer;
  const spy = vi.spyOn(http, 'createServer').mockImplementationOnce(((
    ...args: unknown[]
  ) => {
    const created = Reflect.apply(original, http, args) as http.Server;
    server = created;
    return created;
  }) as typeof http.createServer);
  const owner = await listener(() => true);
  spy.mockRestore();
  if (!server) throw new Error('EXPECTED_SERVER');
  server.emit('error', new Error('synthetic native error'));
  await owner.closed;
  await expect(
    request(callbackUri(owner, state, marker())),
  ).rejects.toBeDefined();
});

it('composes a real local callback with a simulated transaction and fake provider hooks', async () => {
  const owner = await listener((uri) => transaction.callback(uri));
  const events: string[] = [];
  let launched = '';
  const token = marker();
  const launcher = createSiwcBrowserLauncher(owner, async (uri) => {
    events.push('launch');
    launched = uri;
  });
  const transaction = createSiwcAuthTransaction({
    hostId: 'synthetic-host',
    openAuthorization: launcher,
    retainRegistration(registration) {
      expect(registration.clientId).toBe('synthetic-client');
      events.push('retain');
      return true;
    },
    async exchange(input) {
      expect(input.redirectUri).toBe(owner.redirectUri);
      events.push('exchange');
      return {
        access_token: marker(),
        refresh_token: marker(),
        id_token: token,
        token_type: 'Bearer',
        expires_in: 3600,
        scope:
          'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
      };
    },
    async verifyIdentity(value, expected) {
      expect(value === token).toBe(true);
      events.push('verify');
      return {
        issuer: expected.issuer,
        subject: 'synthetic-subject',
        audience: expected.audience,
        nonce: expected.nonce,
        expiresAt: Date.now() + 3600000,
      };
    },
    async prepareCredentials() {
      events.push('prepare');
      return {
        commit() {
          events.push('commit');
          return true;
        },
        discard() {
          events.push('discard');
        },
      };
    },
  });
  const pending = transaction.begin({
    redirectUri: owner.redirectUri,
    account: null,
  });
  expect(
    launched.startsWith('https://auth.openai.com/api/accounts/authorize?'),
  ).toBe(true);
  const actualState = new URL(launched).searchParams.get('state');
  if (!actualState) throw new Error('EXPECTED_STATE');
  expect(events).toEqual(['launch']);
  expect(
    (await request(callbackUri(owner, 'x'.repeat(43), marker()))).status,
  ).toBe(400);
  expect(events).toEqual(['launch']);
  expect(
    (await request(callbackUri(owner, actualState, marker()))).status,
  ).toBe(200);
  expect(await pending).toEqual({
    status: 'authenticated',
    inferenceAllowed: true,
  });
  expect(events).toEqual([
    'launch',
    'retain',
    'exchange',
    'verify',
    'prepare',
    'commit',
    'discard',
  ]);
  await owner.closed;
  transaction.dispose();
});

it('buffers an early valid callback until the fake browser launch completes', async () => {
  const owner = await listener((uri) => transaction.callback(uri));
  let launched = '';
  let finishLaunch: () => void = () => {};
  const exchange = vi.fn(async () => null);
  const transaction = createSiwcAuthTransaction({
    hostId: 'synthetic-host',
    openAuthorization: createSiwcBrowserLauncher(owner, (uri) => {
      launched = uri;
      return new Promise<void>((resolve) => {
        finishLaunch = resolve;
      });
    }),
    retainRegistration: () => true,
    exchange,
    verifyIdentity: async () => null,
    prepareCredentials: async () => ({
      commit: () => false,
      discard: () => {},
    }),
  });
  const pending = transaction.begin({
    redirectUri: owner.redirectUri,
    account: null,
  });
  const actualState = new URL(launched).searchParams.get('state');
  if (!actualState) throw new Error('EXPECTED_STATE');
  expect(
    (await request(callbackUri(owner, actualState, marker()))).status,
  ).toBe(200);
  expect(exchange).not.toHaveBeenCalled();
  finishLaunch();
  expect(await pending).toEqual({ status: 'stopped', reason: 'invalid-grant' });
  expect(exchange).toHaveBeenCalledOnce();
  await owner.closed;
  transaction.dispose();
});

it('does not exchange when a state-matching callback contains unapproved fields', async () => {
  const owner = await listener((uri) => transaction.callback(uri));
  let launched = '';
  const exchange = vi.fn(async () => null);
  const transaction = createSiwcAuthTransaction({
    hostId: 'synthetic-host',
    openAuthorization: createSiwcBrowserLauncher(owner, async (uri) => {
      launched = uri;
    }),
    retainRegistration: () => true,
    exchange,
    verifyIdentity: async () => null,
    prepareCredentials: async () => ({
      commit: () => false,
      discard: () => {},
    }),
  });
  const pending = transaction.begin({
    redirectUri: owner.redirectUri,
    account: null,
  });
  const actualState = new URL(launched).searchParams.get('state');
  if (!actualState) throw new Error('EXPECTED_STATE');
  const target = new URL(callbackUri(owner, actualState, marker()));
  target.searchParams.set('unknown', 'synthetic');
  const response = await request(target.href);
  expect(response.status).toBe(200);
  expect(response.body).toBe('Return to Paperclip Companion.');
  expect(await pending).toEqual({
    status: 'stopped',
    reason: 'invalid-callback',
  });
  expect(exchange).not.toHaveBeenCalled();
  await owner.closed;
  transaction.dispose();
});

it('closes the armed listener on transaction cancellation without exchanging', async () => {
  const owner = await listener((uri) => transaction.callback(uri));
  const exchange = vi.fn(async () => null);
  const transaction = createSiwcAuthTransaction({
    hostId: 'synthetic-host',
    openAuthorization: createSiwcBrowserLauncher(owner, async () => {}),
    retainRegistration: () => true,
    exchange,
    verifyIdentity: async () => null,
    prepareCredentials: async () => ({
      commit: () => false,
      discard: () => {},
    }),
  });
  const pending = transaction.begin({
    redirectUri: owner.redirectUri,
    account: null,
  });
  expect(transaction.cancel()).toBe(true);
  expect(await pending).toEqual({ status: 'stopped', reason: 'cancelled' });
  await owner.closed;
  await expect(
    request(callbackUri(owner, state, marker())),
  ).rejects.toBeDefined();
  expect(exchange).not.toHaveBeenCalled();
  transaction.dispose();
});
