import { randomUUID } from 'node:crypto';
import https from 'node:https';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import { checkServerIdentity } from 'node:tls';
import type {
  ClientRequest,
  IncomingMessage,
  IncomingHttpHeaders,
} from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { exchangeSiwcCode } from '../../src/main/siwc-token-exchange';
import { createSiwcAuthTransaction } from '../../src/main/siwc-auth-transaction';

const endpoint = 'https://auth.openai.com/api/accounts/oauth/token';
const resource = 'https://api.openai.com/v1';
const redirectUri = 'http://127.0.0.1:54321/auth/callback';
const clientId = 'synthetic-client-1';
const verifier = 'a'.repeat(43);
const code = `synthetic:${randomUUID()}`;
const request = () => ({
  endpoint,
  clientId,
  code,
  codeVerifier: verifier,
  redirectUri,
  resource,
});
const signal = () => new AbortController().signal;
const marker = () => `synthetic:${randomUUID()}`;
const tokens = { access: marker(), refresh: marker(), id: marker() };
const reply = () => ({
  access_token: tokens.access,
  refresh_token: tokens.refresh,
  id_token: tokens.id,
  token_type: 'Bearer',
  expires_in: 3600,
  scope: 'openid profile resource.invoke chatgpt.tokens.use.direct',
  earliest_refresh_at: 12345,
  extra: { ignored: true },
});
const streams: PassThrough[] = [];
afterEach(() => {
  for (const stream of streams.splice(0)) stream.destroy();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function native(
  options: {
    status?: number;
    headers?: IncomingHttpHeaders;
    bytes?: Buffer;
    deliver?: boolean;
    end?: boolean;
  } = {},
) {
  const response = Object.assign(new PassThrough(), {
    statusCode: options.status ?? 200,
    headers: options.headers ?? { 'content-type': 'application/json' },
  });
  streams.push(response);
  let callback!: (response: IncomingMessage) => void;
  let supplied: https.RequestOptions | undefined;
  let posted = '';
  const deliver = () => {
    callback(response as unknown as IncomingMessage);
    if (options.end !== false)
      response.end(options.bytes ?? Buffer.from(JSON.stringify(reply())));
  };
  const outgoing = Object.assign(new EventEmitter(), {
    destroy: vi.fn(),
    end: vi.fn((body: string) => {
      posted = body;
      if (options.deliver !== false) queueMicrotask(deliver);
    }),
  });
  const send = vi.spyOn(https, 'request').mockImplementation(((
    url: string,
    input: https.RequestOptions,
    listener: typeof callback,
  ) => {
    expect(url).toBe(endpoint);
    supplied = input;
    callback = listener;
    return outgoing as unknown as ClientRequest;
  }) as never);
  return {
    response,
    outgoing,
    send,
    deliver,
    options: () => supplied,
    body: () => posted,
  };
}

it('sends one fixed form request with verified TLS and returns only normalized fields', async () => {
  const h = native();
  const inputSignal = signal();
  const result = await exchangeSiwcCode(request(), inputSignal);
  expect(h.send).toHaveBeenCalledTimes(1);
  expect(h.options()?.method).toBe('POST');
  expect(h.options()?.agent).toBe(false);
  expect(h.options()?.rejectUnauthorized).toBe(true);
  expect(h.options()?.minVersion).toBe('TLSv1.2');
  expect(h.options()?.checkServerIdentity).toBe(checkServerIdentity);
  expect(h.options()?.maxHeaderSize).toBe(8192);
  expect(h.options()?.signal === inputSignal).toBe(true);
  const form = new URLSearchParams(h.body());
  expect([...form.keys()].sort()).toEqual([
    'client_id',
    'code',
    'code_verifier',
    'grant_type',
    'redirect_uri',
    'resource',
  ]);
  expect(form.get('grant_type')).toBe('authorization_code');
  expect(
    form.get('client_id') === clientId &&
      form.get('code') === code &&
      form.get('code_verifier') === verifier,
  ).toBe(true);
  expect(
    form.get('redirect_uri') === redirectUri &&
      form.get('resource') === resource,
  ).toBe(true);
  expect(Object.keys(result).sort()).toEqual([
    'access_token',
    'expires_in',
    'id_token',
    'refresh_token',
    'scope',
    'token_type',
  ]);
  expect(
    result.access_token === tokens.access &&
      result.refresh_token === tokens.refresh &&
      result.id_token === tokens.id,
  ).toBe(true);
  expect(Object.isFrozen(result)).toBe(true);
  expect(h.response.destroyed).toBe(true);
  expect(h.outgoing.destroy).toHaveBeenCalled();
});
it('projects absent access and refresh tokens as explicit null for identity-only grants', async () => {
  native({
    bytes: Buffer.from(
      JSON.stringify({ id_token: tokens.id, scope: 'openid' }),
    ),
  });
  const result = await exchangeSiwcCode(request(), signal());
  expect(
    result.access_token === null &&
      result.refresh_token === null &&
      result.expires_in === null &&
      result.token_type === null,
  ).toBe(true);
  expect(result.id_token === tokens.id && result.scope === 'openid').toBe(true);
});
it.each(['bearer', 'BEARER', 'bEaReR'])(
  'normalizes the case-insensitive OAuth bearer type %s',
  async (type) => {
    native({
      bytes: Buffer.from(JSON.stringify({ ...reply(), token_type: type })),
    });
    expect((await exchangeSiwcCode(request(), signal())).token_type).toBe(
      'Bearer',
    );
  },
);
it('does not send an invalid request or expose raw errors', async () => {
  const h = native();
  await expect(
    exchangeSiwcCode(
      { ...request(), endpoint: 'https://untrusted.invalid/token' },
      signal(),
    ),
  ).rejects.toThrow('SIWC_EXCHANGE_FAILED');
  expect(h.send).not.toHaveBeenCalled();
});

it('does not treat an inherited ID token as provider response data', async () => {
  native({ bytes: Buffer.from('{}') });
  Object.defineProperty(Object.prototype, 'id_token', {
    configurable: true,
    value: marker(),
  });
  try {
    await expect(exchangeSiwcCode(request(), signal())).rejects.toThrow(
      'SIWC_EXCHANGE_FAILED',
    );
  } finally {
    delete (Object.prototype as Record<string, unknown>).id_token;
  }
});
it('does not incorporate inherited optional tokens into a normalized response', async () => {
  native({ bytes: Buffer.from(JSON.stringify({ id_token: tokens.id })) });
  Object.defineProperty(Object.prototype, 'access_token', {
    configurable: true,
    value: marker(),
  });
  try {
    expect(
      (await exchangeSiwcCode(request(), signal())).access_token,
    ).toBeNull();
  } finally {
    delete (Object.prototype as Record<string, unknown>).access_token;
  }
});

it('uses only fixed headers, a byte-accurate body length and no browser credentials', async () => {
  const h = native();
  const special = `${code}:&+%?`;
  await exchangeSiwcCode({ ...request(), code: special }, signal());
  expect(new URLSearchParams(h.body()).get('code') === special).toBe(true);
  expect(h.options()?.headers).toEqual({
    accept: 'application/json',
    'accept-encoding': 'identity',
    'content-type': 'application/x-www-form-urlencoded',
    'content-length': String(Buffer.byteLength(h.body())),
  });
  expect(h.options()?.auth).toBeUndefined();
});
it('bounds the longest accepted encoded request body', async () => {
  const h = native();
  const longest = '%'.repeat(4096);
  await exchangeSiwcCode({ ...request(), code: longest }, signal());
  expect(new URLSearchParams(h.body()).get('code') === longest).toBe(true);
  expect(Buffer.byteLength(h.body()) < 16384).toBe(true);
  expect(h.send).toHaveBeenCalledTimes(1);
});
it.each([
  null,
  undefined,
  {},
  [],
  { ...request(), endpoint: 'http://auth.openai.com/api/accounts/oauth/token' },
  { ...request(), endpoint: `${endpoint}?extra=1` },
  { ...request(), endpoint: `${endpoint}#x` },
  {
    ...request(),
    endpoint: 'https://auth.openai.com:443/api/accounts/oauth/token',
  },
  {
    ...request(),
    endpoint:
      'https://auth.openai.com@untrusted.invalid/api/accounts/oauth/token',
  },
  { ...request(), resource: 'https://untrusted.invalid/' },
  { ...request(), clientId: 'dynamic_agent_client' },
  { ...request(), clientId: '' },
  { ...request(), clientId: 'x'.repeat(129) },
  { ...request(), clientId: 'bad/id' },
  { ...request(), clientId: null },
  { ...request(), code: '' },
  { ...request(), code: 'x'.repeat(4097) },
  { ...request(), code: 'bad\ncode' },
  { ...request(), code: 1 },
  { ...request(), codeVerifier: 'short' },
  { ...request(), codeVerifier: '*'.repeat(43) },
  { ...request(), codeVerifier: 1 },
  { ...request(), redirectUri: 'http://localhost:54321/auth/callback' },
  { ...request(), redirectUri: 'https://127.0.0.1:54321/auth/callback' },
  { ...request(), redirectUri: 'http://127.0.0.1:0/auth/callback' },
  { ...request(), redirectUri: 'http://127.0.0.1:65536/auth/callback' },
  { ...request(), redirectUri: `${redirectUri}?x=1` },
  { ...request(), redirectUri: null },
  { ...request(), extra: 'forbidden' },
  Object.assign({}, request(), { [Symbol('extra')]: true }),
  Object.create(request()),
])('rejects an invalid request before egress %#', async (value) => {
  const h = native();
  await expect(exchangeSiwcCode(value, signal())).rejects.toThrow(
    'SIWC_EXCHANGE_FAILED',
  );
  expect(h.send).not.toHaveBeenCalled();
});
it('accepts an exact null-prototype input after copying it', async () => {
  const h = native();
  const value = Object.assign(Object.create(null), request());
  const pending = exchangeSiwcCode(value, signal());
  value.code = 'changed';
  expect((await pending).id_token === tokens.id).toBe(true);
  expect(new URLSearchParams(h.body()).get('code') === code).toBe(true);
});
it('never invokes an accessor or reflects a private exception', async () => {
  const h = native();
  let reads = 0;
  const getter = { ...request() };
  Object.defineProperty(getter, 'code', {
    get() {
      reads++;
      return code;
    },
  });
  for (const value of [
    getter,
    ...['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor'].map(
      (trap) =>
        new Proxy(request(), {
          [trap]() {
            throw new Error('PRIVATE_DETAIL');
          },
        }),
    ),
  ])
    await expect(exchangeSiwcCode(value, signal())).rejects.toThrow(
      'SIWC_EXCHANGE_FAILED',
    );
  expect(reads).toBe(0);
  expect(h.send).not.toHaveBeenCalled();
});
it('rechecks cancellation after reflective request inspection', async () => {
  const h = native();
  const controller = new AbortController();
  const input = new Proxy(request(), {
    ownKeys(target) {
      controller.abort();
      return Reflect.ownKeys(target);
    },
  });
  await expect(exchangeSiwcCode(input, controller.signal)).rejects.toThrow(
    'SIWC_EXCHANGE_FAILED',
  );
  expect(h.send).not.toHaveBeenCalled();
});
it('rejects a pre-aborted request before native work', async () => {
  const h = native();
  const controller = new AbortController();
  controller.abort();
  await expect(exchangeSiwcCode(request(), controller.signal)).rejects.toThrow(
    'SIWC_EXCHANGE_FAILED',
  );
  expect(h.send).not.toHaveBeenCalled();
});
it.each([201, 204, 301, 302, 307, 308, 400, 401, 403, 429, 500, 503])(
  'does not follow or retry HTTP %i',
  async (status) => {
    const h = native({ status });
    await expect(exchangeSiwcCode(request(), signal())).rejects.toThrow(
      'SIWC_EXCHANGE_FAILED',
    );
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.response.destroyed).toBe(true);
  },
);
it.each([
  {},
  { 'content-type': ['application/json'] },
  { 'content-type': 'text/html' },
  { 'content-type': 'application/json; charset=latin1' },
  { 'content-type': 'application/json', 'content-encoding': 'gzip' },
  { 'content-type': 'application/json', 'content-encoding': ['identity'] },
  { 'content-type': 'application/json', 'content-length': '98305' },
  { 'content-type': 'application/json', 'content-length': 'bad' },
  { 'content-type': 'application/json', 'content-length': ['2'] },
  { 'content-type': 'application/json', 'content-length': '2' },
] as IncomingHttpHeaders[])(
  'rejects unsafe HTTP metadata %#',
  async (headers) => {
    const h = native({ headers });
    await expect(exchangeSiwcCode(request(), signal())).rejects.toThrow(
      'SIWC_EXCHANGE_FAILED',
    );
    expect(h.send).toHaveBeenCalledTimes(1);
  },
);
it.each([
  'application/json',
  'application/json; charset=UTF-8',
  'application/json; charset="utf-8"',
])('accepts the documented JSON content type %s', async (type) => {
  native({ headers: { 'content-type': type, 'content-encoding': 'identity' } });
  expect(
    (await exchangeSiwcCode(request(), signal())).id_token === tokens.id,
  ).toBe(true);
});
it.each([
  Buffer.alloc(0),
  Buffer.alloc(98305),
  Buffer.from([0xff, 0xfe]),
  Buffer.from('{'),
  Buffer.from('null'),
  Buffer.from('[]'),
  Buffer.from('{}'),
  Buffer.from('{"id_token":"x","expires_in":1e309}'),
  Buffer.from(JSON.stringify({ ...reply(), id_token: '' })),
  Buffer.from(JSON.stringify({ ...reply(), id_token: 'x'.repeat(16385) })),
  Buffer.from(JSON.stringify({ ...reply(), id_token: 'bad\nvalue' })),
  Buffer.from(JSON.stringify({ ...reply(), access_token: {} })),
  Buffer.from(JSON.stringify({ ...reply(), refresh_token: 4 })),
  Buffer.from(JSON.stringify({ ...reply(), token_type: [] })),
  Buffer.from(JSON.stringify({ ...reply(), expires_in: '3600' })),
  Buffer.from(JSON.stringify({ ...reply(), scope: null })),
  Buffer.from(JSON.stringify({ ...reply(), scope: 'x'.repeat(4097) })),
])('rejects malformed, oversized or unsafe response data %#', async (bytes) => {
  const h = native({ bytes });
  await expect(exchangeSiwcCode(request(), signal())).rejects.toThrow(
    'SIWC_EXCHANGE_FAILED',
  );
  expect(h.send).toHaveBeenCalledTimes(1);
});
it('accepts the exact bounded response size and verifies byte length', async () => {
  const json = JSON.stringify({ id_token: tokens.id });
  const bytes = Buffer.from(json + ' '.repeat(98304 - Buffer.byteLength(json)));
  native({
    bytes,
    headers: {
      'content-type': 'application/json',
      'content-length': String(bytes.length),
    },
  });
  expect(
    (await exchangeSiwcCode(request(), signal())).id_token === tokens.id,
  ).toBe(true);
});
it('decodes UTF-8 correctly across chunks without exposing ignored fields', async () => {
  const h = native({ end: false });
  const pending = exchangeSiwcCode(request(), signal());
  await Promise.resolve();
  const bytes = Buffer.from(
    JSON.stringify({ id_token: tokens.id, ignored: 'é' }),
  );
  const index = bytes.indexOf(0xc3);
  h.response.write(bytes.subarray(0, index + 1));
  h.response.end(bytes.subarray(index + 1));
  const value = await pending;
  expect(value.id_token === tokens.id && !Object.hasOwn(value, 'ignored')).toBe(
    true,
  );
});
it.each([
  '{"id_token":"synthetic","id_token":"synthetic"}',
  '{"id_token":"synthetic","\\u0069d_token":"synthetic"}',
  '{"id_token":"synthetic","unexpected":1,"unexpected":2}',
])(
  'rejects duplicate top-level JSON members, including escaped names %#',
  async (json) => {
    const h = native({ bytes: Buffer.from(json) });
    await expect(exchangeSiwcCode(request(), signal())).rejects.toThrow(
      'SIWC_EXCHANGE_FAILED',
    );
    expect(h.send).toHaveBeenCalledTimes(1);
  },
);
it('ignores nested extension data without treating its member names as top-level fields', async () => {
  native({
    bytes: Buffer.from(
      '{"id_token":"synthetic","extension":{"id_token":"other","id_token":"other"}}',
    ),
  });
  const value = await exchangeSiwcCode(request(), signal());
  expect(
    value.id_token === 'synthetic' && !Object.hasOwn(value, 'extension'),
  ).toBe(true);
});
it('distinguishes escaped quotes and structural characters inside ignored JSON strings', async () => {
  const name = 'quote"-brace}-slash\\';
  native({
    bytes: Buffer.from(
      JSON.stringify({ id_token: 'synthetic', [name]: ':"{[}]' }),
    ),
  });
  expect(
    (await exchangeSiwcCode(request(), signal())).id_token === 'synthetic',
  ).toBe(true);
});
it('rejects repeated escaped-quote property names at the top level', async () => {
  const name = JSON.stringify('quote"-brace}-slash\\');
  native({
    bytes: Buffer.from(`{"id_token":"synthetic",${name}:1,${name}:2}`),
  });
  await expect(exchangeSiwcCode(request(), signal())).rejects.toThrow(
    'SIWC_EXCHANGE_FAILED',
  );
});
it('rejects a response stream switched to text mode', async () => {
  const h = native();
  h.response.setEncoding('utf8');
  await expect(exchangeSiwcCode(request(), signal())).rejects.toThrow(
    'SIWC_EXCHANGE_FAILED',
  );
});
it('hides native request-construction and write exceptions', async () => {
  const h = native();
  h.send.mockImplementationOnce(() => {
    throw new Error('PRIVATE_DETAIL');
  });
  await expect(exchangeSiwcCode(request(), signal())).rejects.toThrow(
    'SIWC_EXCHANGE_FAILED',
  );
  h.outgoing.end.mockImplementationOnce(() => {
    throw new Error('PRIVATE_DETAIL');
  });
  await expect(exchangeSiwcCode(request(), signal())).rejects.toThrow(
    'SIWC_EXCHANGE_FAILED',
  );
});
it('hides native request errors without retry', async () => {
  const h = native({ deliver: false });
  const pending = exchangeSiwcCode(request(), signal());
  h.outgoing.emit('error', new Error('PRIVATE_DETAIL'));
  await expect(pending).rejects.toThrow('SIWC_EXCHANGE_FAILED');
  expect(h.send).toHaveBeenCalledTimes(1);
});
it('returns only a fixed error when the provider rejects a grant', async () => {
  native({
    status: 400,
    bytes: Buffer.from(
      JSON.stringify({ error: 'invalid_grant', private_detail: marker() }),
    ),
  });
  const error = await exchangeSiwcCode(request(), signal()).catch(
    (value: unknown) => value,
  );
  expect(
    error instanceof Error &&
      error.message === 'SIWC_EXCHANGE_FAILED' &&
      error.cause === undefined,
  ).toBe(true);
});
it.each(['request', 'response'] as const)(
  'settles with a fixed failure even if %s cleanup throws',
  async (part) => {
    vi.useFakeTimers();
    const h = native({ status: 400, end: false });
    if (part === 'request')
      h.outgoing.destroy.mockImplementationOnce(() => {
        throw new Error('PRIVATE_DETAIL');
      });
    else
      vi.spyOn(h.response, 'destroy').mockImplementationOnce(() => {
        throw new Error('PRIVATE_DETAIL');
      });
    let outcome = 'pending';
    void exchangeSiwcCode(request(), signal()).then(
      () => {
        outcome = 'unexpected success';
      },
      (error: Error) => {
        outcome = error.message;
      },
    );
    await vi.advanceTimersByTimeAsync(10000);
    expect(outcome).toBe('SIWC_EXCHANGE_FAILED');
    expect(h.send).toHaveBeenCalledTimes(1);
  },
);
it('hides response stream errors and destroys the native request', async () => {
  const h = native({ end: false });
  const pending = exchangeSiwcCode(request(), signal());
  await Promise.resolve();
  h.response.destroy(new Error('PRIVATE_DETAIL'));
  await expect(pending).rejects.toThrow('SIWC_EXCHANGE_FAILED');
  expect(h.outgoing.destroy).toHaveBeenCalled();
});
it('destroys a late response after cancellation', async () => {
  const h = native({ deliver: false, end: false });
  const controller = new AbortController();
  const pending = exchangeSiwcCode(request(), controller.signal);
  controller.abort();
  await expect(pending).rejects.toThrow('SIWC_EXCHANGE_FAILED');
  h.deliver();
  expect(h.response.destroyed).toBe(true);
  expect(h.outgoing.destroy).toHaveBeenCalled();
});
it('does not send the body if cancellation occurs during native request creation', async () => {
  const h = native({ deliver: false });
  const controller = new AbortController();
  h.send.mockImplementationOnce((() => {
    controller.abort();
    return h.outgoing as unknown as ClientRequest;
  }) as never);
  await expect(exchangeSiwcCode(request(), controller.signal)).rejects.toThrow(
    'SIWC_EXCHANGE_FAILED',
  );
  expect(h.outgoing.end).not.toHaveBeenCalled();
  expect(h.outgoing.destroy).toHaveBeenCalled();
});
it('does not return a token projection if cleanup synchronously cancels the attempt', async () => {
  const h = native();
  const controller = new AbortController();
  h.outgoing.destroy.mockImplementationOnce(() => {
    controller.abort();
  });
  const delivered = await exchangeSiwcCode(request(), controller.signal).then(
    () => true,
    () => false,
  );
  expect(delivered).toBe(false);
});
it('aborts in-progress response bodies without returning partial token data', async () => {
  const h = native({ end: false });
  const controller = new AbortController();
  const pending = exchangeSiwcCode(request(), controller.signal);
  await Promise.resolve();
  h.response.write('{');
  controller.abort();
  await expect(pending).rejects.toThrow('SIWC_EXCHANGE_FAILED');
  expect(h.response.destroyed).toBe(true);
});
it('times out a stalled native request and clears the timer', async () => {
  vi.useFakeTimers();
  const h = native({ deliver: false });
  const pending = exchangeSiwcCode(request(), signal());
  const failure = expect(pending).rejects.toThrow('SIWC_EXCHANGE_FAILED');
  await vi.advanceTimersByTimeAsync(10000);
  await failure;
  expect(h.outgoing.destroy).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it('enforces its monotonic deadline even if the timer callback is delayed', async () => {
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
  const h = native({ deliver: false });
  const pending = exchangeSiwcCode(request(), signal());
  clock.mockReturnValue(10001);
  h.deliver();
  const delivered = await pending.then(
    () => true,
    () => false,
  );
  expect(delivered).toBe(false);
  expect(h.response.destroyed).toBe(true);
});
it('does not send a body if native setup already exceeded the deadline', async () => {
  const clock = vi.spyOn(performance, 'now').mockReturnValue(0);
  const h = native({ deliver: false });
  h.send.mockImplementationOnce((() => {
    clock.mockReturnValue(10001);
    return h.outgoing as unknown as ClientRequest;
  }) as never);
  const controller = new AbortController();
  const outcome = exchangeSiwcCode(request(), controller.signal).then(
    () => true,
    () => false,
  );
  try {
    expect(h.outgoing.end).not.toHaveBeenCalled();
    expect(await outcome).toBe(false);
  } finally {
    controller.abort();
    await outcome;
  }
});

function transaction(
  options: {
    browserWait?: Promise<void>;
    retain?: boolean;
    identity?: boolean;
  } = {},
) {
  const order: string[] = [];
  let authorization: URL | undefined;
  const owner = createSiwcAuthTransaction({
    hostId: 'synthetic-host',
    async openAuthorization(url) {
      order.push('launch');
      authorization = new URL(url);
      if (options.browserWait) await options.browserWait;
    },
    retainRegistration(value) {
      order.push('retain');
      expect(
        value.clientId === clientId && value.hostId === 'synthetic-host',
      ).toBe(true);
      return options.retain !== false;
    },
    async exchange(value, currentSignal) {
      order.push('exchange');
      return exchangeSiwcCode(value, currentSignal);
    },
    async verifyIdentity(token, expected) {
      order.push('verify');
      expect(
        token === tokens.id &&
          expected.nonce === authorization?.searchParams.get('nonce'),
      ).toBe(true);
      if (options.identity === false) return null;
      return {
        issuer: 'https://auth.openai.com',
        subject: 'synthetic-subject',
        audience: expected.audience,
        nonce: expected.nonce,
        expiresAt: Date.now() + 3600000,
      };
    },
    async prepareCredentials(record) {
      order.push('prepare');
      expect(
        record.idToken === tokens.id &&
          record.accessToken === tokens.access &&
          record.refreshToken === tokens.refresh,
      ).toBe(true);
      return {
        commit() {
          order.push('commit');
          return true;
        },
        discard() {
          order.push('discard');
        },
      };
    },
  });
  const callback = (edit?: (url: URL) => void) => {
    if (!authorization) throw new Error('EXPECTED_LAUNCH');
    const url = new URL(redirectUri);
    url.searchParams.set('state', authorization.searchParams.get('state')!);
    url.searchParams.set('code', code);
    url.searchParams.set('client_id', clientId);
    edit?.(url);
    return owner.callback(url.href);
  };
  return { owner, order, callback };
}
async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}
it('composes state-bound callback, durable retention, exchange, identity and credential commit in order', async () => {
  const h = native();
  let release!: () => void;
  const browserWait = new Promise<void>((resolve) => {
    release = resolve;
  });
  const t = transaction({ browserWait });
  try {
    const pending = t.owner.begin({ redirectUri, account: null });
    expect(t.callback()).toBe(true);
    expect(h.send).not.toHaveBeenCalled();
    release();
    expect(await pending).toEqual({
      status: 'authenticated',
      inferenceAllowed: true,
    });
    expect(t.order).toEqual([
      'launch',
      'retain',
      'exchange',
      'verify',
      'prepare',
      'commit',
      'discard',
    ]);
    expect(h.send).toHaveBeenCalledTimes(1);
  } finally {
    release();
    t.owner.dispose();
  }
});
it('does not reach the transport when registration retention fails', async () => {
  const h = native();
  const t = transaction({ retain: false });
  try {
    const pending = t.owner.begin({ redirectUri, account: null });
    t.callback();
    expect(await pending).toEqual({
      status: 'stopped',
      reason: 'registration-commit-failed',
    });
    expect(t.order).toEqual(['launch', 'retain']);
    expect(h.send).not.toHaveBeenCalled();
  } finally {
    t.owner.dispose();
  }
});
it('does not reach retention or transport for a callback with the wrong state', async () => {
  const h = native();
  const t = transaction();
  try {
    const pending = t.owner.begin({ redirectUri, account: null });
    expect(t.callback((url) => url.searchParams.set('state', 'bad'))).toBe(
      false,
    );
    expect(await pending).toEqual({
      status: 'stopped',
      reason: 'invalid-callback',
    });
    expect(t.order).toEqual(['launch']);
    expect(h.send).not.toHaveBeenCalled();
  } finally {
    t.owner.dispose();
  }
});
it('does not infer granted permissions when a response omits scope', async () => {
  const response: Record<string, unknown> = reply();
  delete response.scope;
  native({ bytes: Buffer.from(JSON.stringify(response)) });
  const t = transaction();
  try {
    const pending = t.owner.begin({ redirectUri, account: null });
    t.callback();
    expect(await pending).toEqual({
      status: 'authenticated',
      inferenceAllowed: false,
    });
    expect(t.order).toContain('verify');
    expect(t.order).toContain('commit');
  } finally {
    t.owner.dispose();
  }
});
it('requires verified identity before preparing credentials', async () => {
  const h = native();
  const t = transaction({ identity: false });
  try {
    const pending = t.owner.begin({ redirectUri, account: null });
    t.callback();
    expect(await pending).toEqual({
      status: 'stopped',
      reason: 'verification-failed',
    });
    expect(t.order).toEqual(['launch', 'retain', 'exchange', 'verify']);
    expect(h.send).toHaveBeenCalledTimes(1);
  } finally {
    t.owner.dispose();
  }
});
it('does not treat a structurally projected but invalid grant as verified authorization', async () => {
  const h = native({
    bytes: Buffer.from(JSON.stringify({ ...reply(), token_type: 'MAC' })),
  });
  const t = transaction();
  try {
    const pending = t.owner.begin({ redirectUri, account: null });
    t.callback();
    expect(await pending).toEqual({
      status: 'stopped',
      reason: 'invalid-grant',
    });
    expect(t.order).toEqual(['launch', 'retain', 'exchange']);
    expect(h.send).toHaveBeenCalledTimes(1);
  } finally {
    t.owner.dispose();
  }
});
it('allows a valid lowercase bearer response through the normalized transaction contract', async () => {
  native({
    bytes: Buffer.from(JSON.stringify({ ...reply(), token_type: 'bearer' })),
  });
  const t = transaction();
  try {
    const pending = t.owner.begin({ redirectUri, account: null });
    t.callback();
    expect(await pending).toEqual({
      status: 'authenticated',
      inferenceAllowed: true,
    });
    expect(t.order).toContain('verify');
    expect(t.order).toContain('commit');
  } finally {
    t.owner.dispose();
  }
});
it('preserves the previous authorization after a failed replacement exchange', async () => {
  native();
  const t = transaction();
  try {
    const first = t.owner.begin({ redirectUri, account: null });
    t.callback();
    expect((await first).status).toBe('authenticated');
    const previous = t.owner.current();
    vi.restoreAllMocks();
    const h = native({ status: 400 });
    const second = t.owner.begin({ redirectUri, account: null });
    t.callback();
    expect(await second).toEqual({
      status: 'stopped',
      reason: 'exchange-failed',
    });
    expect(
      previous !== null &&
        t.owner.current() === previous &&
        t.owner.isCurrent(previous),
    ).toBe(true);
    expect(h.send).toHaveBeenCalledTimes(1);
  } finally {
    t.owner.dispose();
  }
});
it('propagates transaction cancellation to the native request and ignores a late response', async () => {
  const h = native({ deliver: false, end: false });
  const t = transaction();
  try {
    const pending = t.owner.begin({ redirectUri, account: null });
    t.callback();
    await flush();
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(t.owner.cancel()).toBe(true);
    expect(await pending).toEqual({ status: 'stopped', reason: 'cancelled' });
    h.deliver();
    await flush();
    expect(h.response.destroyed).toBe(true);
    expect(t.order).toEqual(['launch', 'retain', 'exchange']);
    expect(t.owner.current()).toBeNull();
  } finally {
    t.owner.dispose();
  }
});
