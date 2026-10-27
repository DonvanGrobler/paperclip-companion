import {
  generateKeyPairSync,
  randomBytes,
  sign,
  type KeyObject,
} from 'node:crypto';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createSiwcTrustedIdentityVerifier } from '../../src/main/siwc-trusted-identity';
import type { SiwcPublicJsonTransport } from '../../src/main/siwc-public-json';
import { createSiwcAuthTransaction } from '../../src/main/siwc-auth-transaction';
import https from 'node:https';

const ISSUER = 'https://auth.openai.com';
const DISCOVERY = `${ISSUER}/.well-known/openid-configuration`;
const JWKS = `${ISSUER}/.well-known/jwks.json`;
const NOW = Math.floor(Date.now() / 1000);
const nonce = randomBytes(32).toString('base64url');
const expected = () => ({
  issuer: ISSUER,
  audience: 'synthetic-client',
  nonce,
});
const signal = () => new AbortController().signal;
let a: { publicKey: KeyObject; privateKey: KeyObject };
let b: { publicKey: KeyObject; privateKey: KeyObject };
let clock: number;
let calls: string[];
let metadata: Record<string, unknown>;
let keyBody: string;
let transport: ReturnType<typeof vi.fn<SiwcPublicJsonTransport>>;
let owner: ReturnType<typeof createSiwcTrustedIdentityVerifier>;
const key = (pair: typeof a, kid: string) => ({
  ...pair.publicKey.export({ format: 'jwk' }),
  kid,
  alg: 'RS256',
  use: 'sig',
});
const snapshot = (pair: typeof a = a, kid = 'key-a') =>
  JSON.stringify({ keys: [key(pair, kid)] });
function jwt(
  pair: typeof a = a,
  kid = 'key-a',
  change: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
) {
  const parts = [
    { alg: 'RS256', kid, typ: 'JWT', ...header },
    {
      iss: ISSUER,
      sub: 'synthetic-subject',
      aud: 'synthetic-client',
      nonce,
      iat: NOW,
      exp: NOW + 3600,
      ...change,
    },
  ]
    .map((value) => Buffer.from(JSON.stringify(value)).toString('base64url'))
    .join('.');
  return `${parts}.${sign('RSA-SHA256', Buffer.from(parts), pair.privateKey).toString('base64url')}`;
}
beforeAll(() => {
  a = generateKeyPairSync('rsa', { modulusLength: 2048 });
  b = generateKeyPairSync('rsa', { modulusLength: 2048 });
}, 20_000);
beforeEach(() => {
  clock = 1000;
  calls = [];
  vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
  vi.spyOn(performance, 'now').mockImplementation(() => clock);
  metadata = {
    issuer: ISSUER,
    authorization_endpoint: `${ISSUER}/api/accounts/authorize`,
    token_endpoint: `${ISSUER}/api/accounts/oauth/token`,
    jwks_uri: JWKS,
    id_token_signing_alg_values_supported: ['RS256'],
  };
  keyBody = snapshot();
  transport = vi.fn(async (url: string) => {
    calls.push(url);
    return {
      body: url === DISCOVERY ? JSON.stringify(metadata) : keyBody,
      cacheMs: 300_000,
    };
  });
  owner = createSiwcTrustedIdentityVerifier(transport);
});
afterEach(() => {
  owner.dispose();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
const loaded = async () =>
  expect((await owner.verify(jwt(), expected(), signal())) !== null).toBe(true);

it.each<[string, () => unknown, () => unknown]>([
  ['token type', () => null, expected],
  ['empty token', () => '', expected],
  ['token bounds', () => 'x'.repeat(16385), expected],
  ['encoded junk', () => 'a.b.c', expected],
  ['unsigned algorithm', () => jwt(a, 'key-a', {}, { alg: 'none' }), expected],
  [
    'token key URL',
    () => jwt(a, 'key-a', {}, { jku: 'https://untrusted.invalid' }),
    expected,
  ],
  [
    'embedded key',
    () => jwt(a, 'key-a', {}, { jwk: key(a, 'key-a') }),
    expected,
  ],
  ['wrong type', () => jwt(a, 'key-a', {}, { typ: 'at+jwt' }), expected],
  ['invalid kid', () => jwt(a, 'bad/kid'), expected],
  [
    'context issuer',
    jwt,
    () => ({ ...expected(), issuer: 'https://untrusted.invalid' }),
  ],
  [
    'bootstrap audience',
    jwt,
    () => ({ ...expected(), audience: 'dynamic_agent_client' }),
  ],
  [
    'missing nonce',
    jwt,
    () => ({ issuer: ISSUER, audience: 'synthetic-client' }),
  ],
  ['invalid nonce', jwt, () => ({ ...expected(), nonce: 'bad' })],
  ['extra context', jwt, () => ({ ...expected(), extra: true })],
  [
    'context getter',
    jwt,
    () =>
      Object.defineProperty(expected(), 'nonce', {
        get() {
          throw new Error('PRIVATE');
        },
      }),
  ],
] as const)('denies %s before egress', async (_name, token, context) => {
  expect(await owner.verify(token(), context(), signal())).toBeNull();
  expect(calls.length).toBe(0);
});
it.each([
  ['issuer', 'https://auth.openai.com/'],
  ['authorization_endpoint', 'https://untrusted.invalid/authorize'],
  ['token_endpoint', 'http://auth.openai.com/api/accounts/oauth/token'],
  ...[
    'http://auth.openai.com/.well-known/jwks.json',
    'https://auth.openai.com:443/.well-known/jwks.json',
    'https://auth.openai.com/.well-known/jwks.json#fragment',
    'https://auth.openai.com/.well-known/jwks.json?query',
    'https://auth.openai.com@untrusted.invalid/.well-known/jwks.json',
    'https://127.0.0.1/keys',
    'https://auth.openai.com./.well-known/jwks.json',
    'https://auth.openai.com/%2ewell-known/jwks.json',
  ].map((value) => ['jwks_uri', value]),
])('denies discovery endpoint substitution %#', async (field, value) => {
  metadata[field!] = value;
  expect((await owner.verify(jwt(), expected(), signal())) === null).toBe(true);
  expect(calls).toEqual([DISCOVERY]);
});
it.each([
  null,
  'RS256',
  [],
  ['HS256'],
  [1],
  ['x'.repeat(33)],
  Array.from({ length: 17 }, () => 'RS256'),
])('requires bounded supported signing algorithms %#', async (value) => {
  metadata.id_token_signing_alg_values_supported = value;
  expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
  expect(calls).toEqual([DISCOVERY]);
});
it.each([
  'issuer',
  'authorization_endpoint',
  'token_endpoint',
  'jwks_uri',
  'id_token_signing_alg_values_supported',
])('requires own discovery field %s', async (field) => {
  const value = metadata[field];
  delete metadata[field];
  Object.defineProperty(Object.prototype, field, {
    configurable: true,
    writable: true,
    value,
  });
  try {
    expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
    expect(calls).toEqual([DISCOVERY]);
  } finally {
    Reflect.deleteProperty(Object.prototype, field);
  }
});
it.each(['{', 'null', '[]', '"not metadata"'])(
  'denies malformed discovery JSON %#',
  async (body) => {
    transport.mockResolvedValueOnce({ body, cacheMs: 300000 });
    expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
  },
);
it.each<[string, () => unknown]>([
  ['null', () => null],
  ['array', () => []],
  ['extra fields', () => ({ body: '{}', cacheMs: 1, raw: true })],
  [
    'inherited fields',
    (): unknown => Object.create({ body: '{}', cacheMs: 1 }),
  ],
  ['missing body', () => ({ wrong: '{}', cacheMs: 1 })],
  ['missing freshness', () => ({ body: '{}', wrong: 1 })],
  [
    'body getter',
    () => ({
      get body() {
        throw new Error('PRIVATE');
      },
      cacheMs: 1,
    }),
  ],
  [
    'cache getter',
    () => ({
      body: '{}',
      get cacheMs() {
        throw new Error('PRIVATE');
      },
    }),
  ],
  ['body type', () => ({ body: 1, cacheMs: 1 })],
  ['body bound', () => ({ body: 'x'.repeat(65537), cacheMs: 1 })],
  ['body UTF8 bound', () => ({ body: 'é'.repeat(40000), cacheMs: 1 })],
  ...[null, -1, 300001, 1.5, NaN, '1'].map(
    (value) =>
      [
        `cache bound ${typeof value}`,
        () => ({ body: '{}', cacheMs: value }),
      ] as [string, () => unknown],
  ),
])('denies malformed transport result: %s', async (_name, make) => {
  transport.mockResolvedValueOnce(make());
  expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
});
it.each<[string, () => string]>([
  ['malformed', () => '{'],
  ['no keys', () => '{"keys":[]}'],
  ['wrong root', () => '[]'],
  [
    'duplicate ID',
    () => JSON.stringify({ keys: [key(a, 'key-a'), key(b, 'key-a')] }),
  ],
  [
    'private material',
    () =>
      JSON.stringify({
        keys: [{ ...key(a, 'key-a'), d: 'synthetic-private-field' }],
      }),
  ],
  [
    'key URL',
    () =>
      JSON.stringify({
        keys: [{ ...key(a, 'key-a'), x5u: 'https://untrusted.invalid/' }],
      }),
  ],
  [
    'wrong algorithm',
    () => JSON.stringify({ keys: [{ ...key(a, 'key-a'), alg: 'HS256' }] }),
  ],
  [
    'weak modulus',
    () => JSON.stringify({ keys: [{ ...key(a, 'key-a'), n: 'bad' }] }),
  ],
])('denies untrusted key profile: %s', async (_name, make) => {
  keyBody = make();
  expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
  expect(calls).toEqual([DISCOVERY, JWKS]);
});
it.each(['discovery', 'jwks'] as const)(
  'normalizes rejected %s without retry or stale fallback',
  async (phase) => {
    if (phase === 'jwks')
      transport.mockResolvedValueOnce({
        body: JSON.stringify(metadata),
        cacheMs: 300000,
      });
    transport.mockRejectedValueOnce(new Error('PRIVATE'));
    expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
    const before = transport.mock.calls.length;
    expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
    expect(transport.mock.calls.length).toBe(before);
  },
);
it('does not refresh for bad signature, expiry, nonce or a known kid with replaced material', async () => {
  await loaded();
  for (const token of [
    jwt(b),
    jwt(a, 'key-a', { exp: NOW - 1 }),
    jwt(a, 'key-a', { nonce: 'A'.repeat(43) }),
  ])
    expect(await owner.verify(token, expected(), signal())).toBeNull();
  expect(calls.length).toBe(2);
  keyBody = snapshot(b);
  clock += 300000;
  expect((await owner.verify(jwt(b), expected(), signal())) !== null).toBe(
    true,
  );
  expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
  expect(calls.length).toBe(4);
});
it('limits a cold unknown key to one discovery/JWKS pair and rejects repeated unknown IDs during cooldown', async () => {
  expect(await owner.verify(jwt(b, 'key-b'), expected(), signal())).toBeNull();
  expect(await owner.verify(jwt(b, 'key-c'), expected(), signal())).toBeNull();
  expect(calls.length).toBe(2);
  await loaded();
  expect(calls.length).toBe(2);
});
it('uses the smaller freshness bound, never stale keys inside refresh cooldown', async () => {
  transport.mockResolvedValueOnce({
    body: JSON.stringify(metadata),
    cacheMs: 1000,
  });
  await loaded();
  clock += 1000;
  expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
  expect(calls.length).toBe(1);
  clock += 29000;
  await loaded();
  expect(transport.mock.calls.length).toBe(4);
});
it.each(['discovery', 'jwks'] as const)(
  'uses no-store %s only for the current operation',
  async (phase) => {
    transport.mockResolvedValueOnce({
      body: JSON.stringify(metadata),
      cacheMs: phase === 'discovery' ? 0 : 300000,
    });
    transport.mockResolvedValueOnce({
      body: keyBody,
      cacheMs: phase === 'jwks' ? 0 : 300000,
    });
    await loaded();
    expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
    expect(transport.mock.calls.length).toBe(2);
    clock += 30000;
    await loaded();
    expect(transport.mock.calls.length).toBe(4);
  },
);
it('invalidating keys retains the request-start cooldown and never restores a previous authority on failed refresh', async () => {
  await loaded();
  owner.invalidate();
  expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
  expect(calls.length).toBe(2);
  clock += 30000;
  await loaded();
  clock += 30000;
  transport.mockRejectedValueOnce(new Error('PRIVATE'));
  expect(await owner.verify(jwt(b, 'key-b'), expected(), signal())).toBeNull();
  expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
  expect(transport.mock.calls.length).toBe(5);
});
it('copies expected context before awaited transport', async () => {
  const input = expected();
  const pending = owner.verify(jwt(), input, signal());
  input.nonce = 'A'.repeat(43);
  expect((await pending) !== null).toBe(true);
});
it.each(['abort', 'invalidate', 'dispose'] as const)(
  'rejects %s during reflective context inspection before egress',
  async (mode) => {
    const controller = new AbortController();
    const input = new Proxy(expected(), {
      ownKeys(target) {
        if (mode === 'abort') controller.abort();
        else owner[mode]();
        return Reflect.ownKeys(target);
      },
    });
    expect(await owner.verify(jwt(), input, controller.signal)).toBeNull();
    expect(calls.length).toBe(0);
  },
);
it.each(['discovery', 'jwks'] as const)(
  'aborts delayed %s without allowing late cache publication or stealing a fresh operation',
  async (phase) => {
    const delayed = deferred<unknown>();
    const controller = new AbortController();
    if (phase === 'jwks')
      transport.mockResolvedValueOnce({
        body: JSON.stringify(metadata),
        cacheMs: 300000,
      });
    transport.mockReturnValueOnce(delayed.promise);
    const pending = owner.verify(jwt(), expected(), controller.signal);
    await vi.waitFor(() =>
      expect(transport.mock.calls.length).toBe(phase === 'discovery' ? 1 : 2),
    );
    expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
    controller.abort();
    expect(await pending).toBeNull();
    clock += 30000;
    keyBody = snapshot(b, 'key-b');
    expect(
      (await owner.verify(jwt(b, 'key-b'), expected(), signal())) !== null,
    ).toBe(true);
    delayed.resolve({
      body: phase === 'discovery' ? JSON.stringify(metadata) : snapshot(),
      cacheMs: 300000,
    });
    await Promise.resolve();
    await Promise.resolve();
    expect(
      (await owner.verify(jwt(b, 'key-b'), expected(), signal())) !== null,
    ).toBe(true);
    expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
  },
);
it.each(['invalidate', 'dispose'] as const)(
  'ends active transport promptly on %s',
  async (action) => {
    const delayed = deferred<unknown>();
    transport.mockReturnValueOnce(delayed.promise);
    const pending = owner.verify(jwt(), expected(), signal());
    owner[action]();
    expect(await pending).toBeNull();
    delayed.resolve({ body: JSON.stringify(metadata), cacheMs: 300000 });
    await Promise.resolve();
    if (action === 'dispose') {
      clock += 30000;
      expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
      expect(transport.mock.calls.length).toBe(1);
    }
  },
);
it('times out uncooperative transport, aborts its signal and clears all active timers', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const delayed = deferred<unknown>();
  let received: AbortSignal | undefined;
  transport.mockImplementationOnce(async (_url, current) => {
    received = current;
    return delayed.promise;
  });
  const pending = owner.verify(jwt(), expected(), signal());
  await vi.advanceTimersByTimeAsync(5000);
  expect(await pending).toBeNull();
  expect(received?.aborted).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
  delayed.resolve(null);
  await Promise.resolve();
});
it.each([
  'abort',
  'invalidate',
  'dispose',
  'timeout',
  'expiry',
  'rollback',
] as const)(
  'rejects delayed native signature completion after %s',
  async (mode) => {
    const gate = deferred<void>();
    const original = crypto.subtle.verify.bind(crypto.subtle);
    const verify = vi
      .spyOn(crypto.subtle, 'verify')
      .mockImplementationOnce(async (...args) => {
        const result = await original(...args);
        await gate.promise;
        return result;
      });
    if (mode === 'expiry')
      transport.mockResolvedValueOnce({
        body: JSON.stringify(metadata),
        cacheMs: 1000,
      });
    const controller = new AbortController();
    const pending = owner.verify(jwt(), expected(), controller.signal);
    await vi.waitFor(() => expect(verify.mock.calls.length).toBe(1));
    if (mode === 'abort') controller.abort();
    else if (mode === 'invalidate' || mode === 'dispose') owner[mode]();
    else if (mode === 'timeout') clock += 5000;
    else if (mode === 'expiry') clock += 1000;
    else clock -= 1;
    gate.resolve();
    expect(await pending).toBeNull();
  },
);
it.each([NaN, Infinity, -1, Number.MAX_SAFE_INTEGER])(
  'denies an invalid monotonic clock %# without egress',
  async (time) => {
    clock = time;
    expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
    expect(calls.length).toBe(0);
  },
);
it('prevents publication and new verification reentry from trusted abort cleanup', async () => {
  let nested: Promise<unknown> | undefined;
  const original = transport.getMockImplementation()!;
  transport.mockImplementationOnce(async (url, current) => {
    current.addEventListener(
      'abort',
      () => {
        nested = owner.verify(jwt(), expected(), signal());
        owner.dispose();
      },
      { once: true },
    );
    return original(url, current);
  });
  expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
  expect(await nested).toBeNull();
  expect(calls.length).toBe(2);
});
it('does not leave idle timers or send any request on construction/default invalid input', async () => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
  const get = vi.spyOn(https, 'get').mockImplementation(() => {
    throw new Error('NETWORK_FORBIDDEN');
  });
  const native = createSiwcTrustedIdentityVerifier();
  expect(vi.getTimerCount()).toBe(0);
  expect(await native.verify('bad', expected(), signal())).toBeNull();
  expect(get).not.toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
  native.dispose();
});
it.each(['valid', 'signature', 'nonce', 'endpoint'] as const)(
  'composes signed verification with transaction before fake storage: %s',
  async (mode) => {
    let authorization: URL | undefined;
    let prepares = 0;
    if (mode === 'endpoint')
      metadata.jwks_uri = 'https://untrusted.invalid/keys';
    const transaction = createSiwcAuthTransaction({
      hostId: 'synthetic-host',
      async openAuthorization(url) {
        authorization = new URL(url);
      },
      async exchange() {
        return {
          id_token: jwt(mode === 'signature' ? b : a, 'key-a', {
            nonce:
              mode === 'nonce'
                ? 'A'.repeat(43)
                : authorization!.searchParams.get('nonce'),
          }),
          access_token: null,
          refresh_token: null,
          token_type: null,
          expires_in: null,
          scope: 'openid',
        };
      },
      verifyIdentity: owner.verify,
      async prepareCredentials() {
        prepares++;
        return { commit: () => true, discard() {} };
      },
    });
    try {
      const redirectUri = 'http://127.0.0.1:54321/auth/callback';
      const pending = transaction.begin({ redirectUri, account: null });
      transaction.callback(
        `${redirectUri}?state=${authorization!.searchParams.get('state')}&code=synthetic-code&client_id=synthetic-client`,
      );
      expect((await pending).status).toBe(
        mode === 'valid' ? 'authenticated' : 'stopped',
      );
      expect(prepares).toBe(mode === 'valid' ? 1 : 0);
    } finally {
      transaction.dispose();
    }
  },
);

it('binds independent signatures to fixed discovery and JWKS before returning only identity facts', async () => {
  const value = await owner.verify(jwt(), expected(), signal());
  expect(value !== null).toBe(true);
  expect(value?.subject).toBe('synthetic-subject');
  expect(Object.isFrozen(value)).toBe(true);
  expect(Object.keys(value!).sort()).toEqual([
    'audience',
    'expiresAt',
    'issuer',
    'nonce',
    'subject',
  ]);
  expect(calls).toEqual([DISCOVERY, JWKS]);
});
it('reuses fresh validated keys without a second request', async () => {
  expect((await owner.verify(jwt(), expected(), signal())) !== null).toBe(true);
  expect((await owner.verify(jwt(), expected(), signal())) !== null).toBe(true);
  expect(calls).toEqual([DISCOVERY, JWKS]);
});
it('rejects malformed input without egress', async () => {
  expect(await owner.verify('malformed', expected(), signal())).toBeNull();
  expect(calls.length).toBe(0);
});
it('rejects a discovered destination substitution', async () => {
  metadata.jwks_uri = 'https://untrusted.invalid/keys';
  expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
  expect(calls.every((url) => url === DISCOVERY)).toBe(true);
});
it('refreshes an unknown key within its budget and retires removed key material', async () => {
  expect((await owner.verify(jwt(), expected(), signal())) !== null).toBe(true);
  clock += 30_000;
  keyBody = snapshot(b, 'key-b');
  expect(
    (await owner.verify(jwt(b, 'key-b'), expected(), signal())) !== null,
  ).toBe(true);
  expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
  expect(calls).toEqual([DISCOVERY, JWKS, DISCOVERY, JWKS]);
});
it('disposal is permanent and causes no egress', async () => {
  owner.dispose();
  expect(await owner.verify(jwt(), expected(), signal())).toBeNull();
  expect(calls.length).toBe(0);
});
