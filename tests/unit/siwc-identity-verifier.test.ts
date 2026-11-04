import {
  generateKeyPairSync,
  createHmac,
  randomBytes,
  sign as rsaSign,
  type KeyObject,
} from 'node:crypto';
import { afterEach, beforeAll, beforeEach, expect, it, vi } from 'vitest';
import { createSiwcIdentityVerifier } from '../../src/main/siwc-identity-verifier';
import { createSiwcAuthTransaction } from '../../src/main/siwc-auth-transaction';

// Test-only ephemeral keys. OpenSSL signs independently of the library under test.
// Never persist, snapshot, log or compare whole JWTs/private keys in assertions.
const ISSUER = 'https://auth.openai.com';
const AUDIENCE = 'synthetic-client';
const NOW = Math.floor(Date.now() / 1000);
const nonce = randomBytes(32).toString('base64url');
const expected = () => ({ issuer: ISSUER, audience: AUDIENCE, nonce });
let first: { publicKey: KeyObject; privateKey: KeyObject };
let second: { publicKey: KeyObject; privateKey: KeyObject };
let publicA: Record<string, unknown>;
let publicB: Record<string, unknown>;
beforeAll(() => {
  first = generateKeyPairSync('rsa', { modulusLength: 2048 });
  second = generateKeyPairSync('rsa', { modulusLength: 2048 });
  publicA = {
    ...first.publicKey.export({ format: 'jwk' }),
    kid: 'key-a',
    alg: 'RS256',
    use: 'sig',
  };
  publicB = {
    ...second.publicKey.export({ format: 'jwk' }),
    kid: 'key-b',
    alg: 'RS256',
    use: 'sig',
  };
}, 20000);
beforeEach(() => {
  vi.spyOn(Date, 'now').mockReturnValue(NOW * 1000);
});
afterEach(() => vi.restoreAllMocks());
const keys = (...values: Record<string, unknown>[]) =>
  JSON.stringify({ keys: values });
const signal = () => new AbortController().signal;
function claims(change: Record<string, unknown> = {}) {
  const result: Record<string, unknown> = {
    iss: ISSUER,
    sub: 'synthetic-subject',
    aud: AUDIENCE,
    nonce,
    iat: NOW,
    exp: NOW + 3600,
    ...change,
  };
  for (const key of Object.keys(result))
    if (result[key] === undefined) delete result[key];
  return result;
}
function signed(
  change: Record<string, unknown> = {},
  header: Record<string, unknown> = {},
  key: KeyObject = first.privateKey,
) {
  const h = { alg: 'RS256', kid: 'key-a', typ: 'JWT', ...header };
  const body = [h, claims(change)]
    .map((v) => Buffer.from(JSON.stringify(v)).toString('base64url'))
    .join('.');
  return `${body}.${rsaSign('RSA-SHA256', Buffer.from(body), key).toString('base64url')}`;
}

it('verifies an actual independent RSA signature and returns only immutable identity facts', async () => {
  const owner = createSiwcIdentityVerifier(keys(publicA));
  const value = await owner.verify(
    signed({ email: 'synthetic@example.invalid', private_extra: 'ignored' }),
    expected(),
    signal(),
  );
  expect(value !== null).toBe(true);
  expect(value?.issuer).toBe(ISSUER);
  expect(value?.subject).toBe('synthetic-subject');
  expect(value?.audience).toBe(AUDIENCE);
  expect(value?.nonce === nonce).toBe(true);
  expect(value?.expiresAt).toBe((NOW + 3600) * 1000);
  expect(Object.keys(value!).sort()).toEqual([
    'audience',
    'expiresAt',
    'issuer',
    'nonce',
    'subject',
  ]);
  expect(Object.isFrozen(value)).toBe(true);
  owner.dispose();
});

it.each([
  { iss: 'https://untrusted.invalid' },
  { aud: 'other-client' },
  { nonce: 'wrong' },
  { exp: NOW - 30 },
])('rejects signed but unbound identity claims %#', async (change) => {
  const owner = createSiwcIdentityVerifier(keys(publicA));
  expect(await owner.verify(signed(change), expected(), signal())).toBeNull();
  owner.dispose();
});

it('rejects payload tampering and a different signing key', async () => {
  const owner = createSiwcIdentityVerifier(keys(publicA));
  const original = signed();
  const parts = original.split('.');
  parts[1] = Buffer.from(JSON.stringify(claims({ sub: 'tampered' }))).toString(
    'base64url',
  );
  expect(await owner.verify(parts.join('.'), expected(), signal())).toBeNull();
  expect(
    await owner.verify(signed({}, {}, second.privateKey), expected(), signal()),
  ).toBeNull();
  owner.dispose();
});

it('replaces a trusted key snapshot and stops accepting removed keys', async () => {
  const owner = createSiwcIdentityVerifier(keys(publicA));
  expect((await owner.verify(signed(), expected(), signal())) !== null).toBe(
    true,
  );
  expect(owner.replaceKeys(keys(publicB))).toBe(true);
  expect(await owner.verify(signed(), expected(), signal())).toBeNull();
  expect(
    (await owner.verify(
      signed({}, { kid: 'key-b' }, second.privateKey),
      expected(),
      signal(),
    )) !== null,
  ).toBe(true);
  owner.dispose();
  expect(owner.replaceKeys(keys(publicA))).toBe(false);
});

it('composes real signature verification with the transaction before fake credential installation', async () => {
  const verifier = createSiwcIdentityVerifier(keys(publicA));
  let authorize: URL | undefined;
  let installs = 0;
  const transaction = createSiwcAuthTransaction({
    hostId: 'synthetic-host',
    retainRegistration: () => true, // Explicit metadata fake; no durability claim.
    async openAuthorization(url) {
      authorize = new URL(url);
    },
    async exchange() {
      return {
        id_token: signed({ nonce: authorize!.searchParams.get('nonce') }),
        access_token: null,
        refresh_token: null,
        token_type: null,
        expires_in: null,
        scope: 'openid',
      };
    },
    verifyIdentity: verifier.verify,
    async prepareCredentials() {
      return {
        commit() {
          installs++;
          return true;
        },
        discard() {},
      };
    },
  });
  const redirectUri = 'http://127.0.0.1:54321/auth/callback';
  const result = transaction.begin({ redirectUri, account: null });
  const callback = new URL(redirectUri);
  callback.search = new URLSearchParams({
    state: authorize!.searchParams.get('state')!,
    client_id: AUDIENCE,
    code: 'synthetic-code',
  }).toString();
  transaction.callback(callback.href);
  expect(await result).toEqual({
    status: 'authenticated',
    inferenceAllowed: false,
  });
  expect(installs).toBe(1);
  transaction.dispose();
  verifier.dispose();
});

it.each([
  ...['iss', 'sub', 'aud', 'nonce', 'iat', 'exp'].map((field) => ({
    [field]: undefined,
  })),
  { sub: '' },
  { sub: 1 },
  { sub: 'x'.repeat(256) },
  { sub: 'private\nvalue' },
  { nonce: 'A'.repeat(43) },
  { nonce: 1 },
  { aud: [] },
  { aud: 1 },
  { aud: [AUDIENCE, 'untrusted-audience'], azp: AUDIENCE },
  { azp: 'other-client' },
  { azp: null },
  { iat: NOW + 6 },
  { iat: NOW - 606 },
  { iat: NOW + 0.5 },
  { exp: NOW },
  { exp: NOW - 1 },
  { exp: NOW + 0.5 },
  { exp: NOW + 86401 },
  { exp: Number.MAX_SAFE_INTEGER },
  { exp: 'later' },
  { exp: NOW + 1, iat: NOW + 1 },
  { nbf: NOW + 6 },
  { nbf: 'later' },
  { nbf: NOW + 0.5 },
  { nbf: NOW + 3600 },
  { nbf: 0 },
])(
  'rejects signed malformed, temporally invalid or unauthorized claims %#',
  async (change) => {
    const owner = createSiwcIdentityVerifier(keys(publicA));
    expect(await owner.verify(signed(change), expected(), signal())).toBeNull();
    owner.dispose();
  },
);

it.each([
  { aud: [AUDIENCE] },
  { azp: AUDIENCE },
  { nbf: NOW },
  { nbf: NOW + 5, iat: NOW + 5 },
  { iat: NOW - 605 },
  { exp: NOW + 86400 },
])(
  'accepts the explicitly bounded audience/clock/lifetime profile %#',
  async (change) => {
    const owner = createSiwcIdentityVerifier(keys(publicA));
    expect(
      (await owner.verify(signed(change), expected(), signal())) !== null,
    ).toBe(true);
    owner.dispose();
  },
);

it.each([
  { alg: 'HS256' },
  { alg: 'none' },
  { alg: 'RS384' },
  { alg: undefined },
  { kid: undefined },
  { kid: 'unlisted' },
  { kid: 'x'.repeat(129) },
  { kid: 'https://untrusted.invalid/key' },
  { typ: 'at+jwt' },
  { typ: 'unexpected' },
  { jku: 'https://untrusted.invalid/keys' },
  { x5u: 'https://untrusted.invalid/cert' },
  { jwk: { kty: 'RSA', kid: 'key-a' } },
  { x5c: ['untrusted'] },
  { crit: ['custom'], custom: true },
  { b64: true },
])(
  'never trusts token-selected algorithms, URLs or embedded keys %#',
  async (header) => {
    let requests = 0;
    vi.stubGlobal('fetch', () => {
      requests++;
      throw new Error('NETWORK_FORBIDDEN');
    });
    try {
      const owner = createSiwcIdentityVerifier(keys(publicA));
      expect(
        await owner.verify(signed({}, header), expected(), signal()),
      ).toBeNull();
      expect(requests).toBe(0);
      owner.dispose();
    } finally {
      vi.unstubAllGlobals();
    }
  },
);

it('rejects a properly computed HMAC using public RSA bytes and an unsigned token', async () => {
  const owner = createSiwcIdentityVerifier(keys(publicA));
  const prefix = [{ alg: 'HS256', kid: 'key-a' }, claims()]
    .map((v) => Buffer.from(JSON.stringify(v)).toString('base64url'))
    .join('.');
  const mac = createHmac(
    'sha256',
    Buffer.from(publicA.n as string, 'base64url'),
  )
    .update(prefix)
    .digest('base64url');
  expect(
    await owner.verify(`${prefix}.${mac}`, expected(), signal()),
  ).toBeNull();
  expect(await owner.verify(`${prefix}.`, expected(), signal())).toBeNull();
  owner.dispose();
});

it('allows absent JWT type while keeping the algorithm and trusted key fixed', async () => {
  const owner = createSiwcIdentityVerifier(keys(publicA));
  expect(
    (await owner.verify(
      signed({}, { typ: undefined }),
      expected(),
      signal(),
    )) !== null,
  ).toBe(true);
  owner.dispose();
});

it.each([
  undefined,
  null,
  1,
  true,
  {},
  [],
  '',
  'a.b.c',
  'a.b.c.d',
  'a..c',
  'x'.repeat(16385),
  'a.b.c\n',
])('bounds and sanitizes invalid compact token input %#', async (token) => {
  const owner = createSiwcIdentityVerifier(keys(publicA));
  expect(await owner.verify(token, expected(), signal())).toBeNull();
  owner.dispose();
});

it('bounds the encoded header before parsing or importing a key', async () => {
  const owner = createSiwcIdentityVerifier(keys(publicA));
  expect(
    await owner.verify(
      signed({}, { padding: 'x'.repeat(1500) }),
      expected(),
      signal(),
    ),
  ).toBeNull();
  owner.dispose();
});

it.each([
  undefined,
  null,
  true,
  '',
  [],
  {},
  Object.create({ issuer: ISSUER, audience: AUDIENCE, nonce }),
  { issuer: ISSUER, audience: AUDIENCE },
  { ...expected(), extra: true },
  { ...expected(), [Symbol('extra')]: true },
  { ...expected(), issuer: 'https://untrusted.invalid' },
  { ...expected(), audience: 'dynamic_agent_client' },
  { ...expected(), audience: '' },
  { ...expected(), audience: 'x'.repeat(129) },
  { ...expected(), nonce: '' },
  { ...expected(), nonce: 'A'.repeat(44) },
])(
  'requires a trusted, complete fixed-issuer expectation without coercion %#',
  async (context) => {
    const owner = createSiwcIdentityVerifier(keys(publicA));
    expect(await owner.verify(signed(), context, signal())).toBeNull();
    owner.dispose();
  },
);

it('copies caller-owned expectations before crypto and never invokes accessors', async () => {
  const owner = createSiwcIdentityVerifier(keys(publicA));
  let reads = 0;
  const accessor = Object.defineProperty(expected(), 'nonce', {
    get() {
      reads++;
      throw new Error('PRIVATE_DETAIL');
    },
  });
  expect(await owner.verify(signed(), accessor, signal())).toBeNull();
  expect(reads).toBe(0);
  const context = expected();
  const pending = owner.verify(signed(), context, signal());
  context.audience = 'mutated';
  expect((await pending)?.audience).toBe(AUDIENCE);
  owner.dispose();
});

it.each(['ownKeys', 'getPrototypeOf', 'getOwnPropertyDescriptor'])(
  'sanitizes expectation reflection failures at %s',
  async (trap) => {
    const owner = createSiwcIdentityVerifier(keys(publicA));
    const value = new Proxy(expected(), {
      [trap]() {
        throw new Error(`synthetic:${randomBytes(8).toString('hex')}`);
      },
    });
    expect(await owner.verify(signed(), value, signal())).toBeNull();
    owner.dispose();
  },
);

it.each(['replace', 'dispose'] as const)(
  'revokes verification reentered during expectation inspection by %s',
  async (operation) => {
    const owner = createSiwcIdentityVerifier(keys(publicA));
    const value = new Proxy(expected(), {
      ownKeys(target) {
        if (operation === 'replace') owner.replaceKeys(keys(publicA));
        else owner.dispose();
        return Reflect.ownKeys(target);
      },
    });
    expect(await owner.verify(signed(), value, signal())).toBeNull();
    owner.dispose();
  },
);

it.each([
  {},
  { kty: 'EC' },
  { alg: 'HS256' },
  { kid: '' },
  { kid: 'x'.repeat(129) },
  { use: 'enc' },
  { key_ops: ['sign'] },
  { key_ops: ['verify', 'verify'] },
  { e: 'Aw' },
  { n: 'A'.repeat(100) },
  { n: 'A'.repeat(684) },
  { n: '!'.repeat(342) },
  { n: 'A'.repeat(342) },
  { d: 'synthetic-private-field' },
  { k: 'synthetic-symmetric-field' },
  { x5u: 'https://untrusted.invalid/key' },
  { x5c: ['untrusted'] },
  { unknown: true },
])(
  'rejects weak, private, ambiguous or non-profile key metadata %#',
  async (change) => {
    const owner = createSiwcIdentityVerifier(keys(publicA));
    const candidate = Object.keys(change).length
      ? { ...publicA, ...change }
      : {};
    expect(owner.replaceKeys(keys(candidate))).toBe(false);
    expect(await owner.verify(signed(), expected(), signal())).toBeNull();
    owner.dispose();
  },
);

it.each([
  undefined,
  null,
  {},
  1,
  '',
  '{',
  'null',
  '[]',
  '{}',
  JSON.stringify({ keys: [] }),
  JSON.stringify({ keys: null }),
  'x'.repeat(65537),
  JSON.stringify({ keys: [], large: 'é'.repeat(40000) }),
])(
  'rejects invalid or oversized public snapshots and removes previous authority %#',
  async (snapshot) => {
    const owner = createSiwcIdentityVerifier(keys(publicA));
    expect(owner.replaceKeys(snapshot)).toBe(false);
    expect(await owner.verify(signed(), expected(), signal())).toBeNull();
    owner.dispose();
  },
);

it('requires one bounded unique public key ID and refuses duplicate/excessive snapshots', async () => {
  const owner = createSiwcIdentityVerifier(keys(publicA));
  for (const value of [
    keys(publicA, publicA),
    keys(
      ...Array.from({ length: 9 }, (_, i) => ({ ...publicA, kid: `key-${i}` })),
    ),
    JSON.stringify({ keys: [publicA], extra: true }),
    JSON.stringify({ keys: [null] }),
  ]) {
    expect(owner.replaceKeys(value)).toBe(false);
    expect(await owner.verify(signed(), expected(), signal())).toBeNull();
  }
  expect(
    owner.replaceKeys(
      keys(
        ...Array.from({ length: 8 }, (_, i) => ({
          ...publicA,
          kid: i === 0 ? 'key-a' : `key-${i}`,
        })),
      ),
    ),
  ).toBe(true);
  expect((await owner.verify(signed(), expected(), signal())) !== null).toBe(
    true,
  );
  owner.dispose();
});

it('accepts optional public metadata only when it agrees with verification use', async () => {
  const minimal = { ...publicA };
  delete minimal.use;
  const owner = createSiwcIdentityVerifier(keys(minimal));
  expect((await owner.verify(signed(), expected(), signal())) !== null).toBe(
    true,
  );
  expect(owner.replaceKeys(keys({ ...publicA, key_ops: ['verify'] }))).toBe(
    true,
  );
  expect((await owner.verify(signed(), expected(), signal())) !== null).toBe(
    true,
  );
  owner.dispose();
});

it('rejects an actual 1024-bit public key', async () => {
  const weak = generateKeyPairSync('rsa', { modulusLength: 1024 });
  const owner = createSiwcIdentityVerifier(
    keys({
      ...weak.publicKey.export({ format: 'jwk' }),
      kid: 'key-a',
      alg: 'RS256',
    }),
  );
  expect(
    await owner.verify(signed({}, {}, weak.privateKey), expected(), signal()),
  ).toBeNull();
  owner.dispose();
});

it('rejects the old signature when a trusted replacement reuses a kid with different key material', async () => {
  const owner = createSiwcIdentityVerifier(keys(publicA));
  expect(owner.replaceKeys(keys({ ...publicB, kid: 'key-a' }))).toBe(true);
  expect(await owner.verify(signed(), expected(), signal())).toBeNull();
  expect(
    (await owner.verify(
      signed({}, {}, second.privateKey),
      expected(),
      signal(),
    )) !== null,
  ).toBe(true);
  owner.dispose();
});

it.each(['replace', 'invalid', 'dispose', 'abort'] as const)(
  'discards asynchronous crypto completion after %s',
  async (operation) => {
    const owner = createSiwcIdentityVerifier(keys(publicA));
    const controller = new AbortController();
    const pending = owner.verify(signed(), expected(), controller.signal);
    if (operation === 'replace') owner.replaceKeys(keys(publicA));
    else if (operation === 'invalid') owner.replaceKeys('{}');
    else if (operation === 'dispose') owner.dispose();
    else controller.abort();
    expect(await pending).toBeNull();
    if (operation === 'replace' || operation === 'abort')
      expect(
        (await owner.verify(signed(), expected(), signal())) !== null,
      ).toBe(true);
    owner.dispose();
    owner.dispose();
    expect(owner.replaceKeys(keys(publicA))).toBe(false);
    expect(await owner.verify(signed(), expected(), signal())).toBeNull();
  },
);

it('does no verification work after an already aborted signal', async () => {
  const owner = createSiwcIdentityVerifier(keys(publicA));
  const controller = new AbortController();
  controller.abort();
  const value = new Proxy(
    {},
    {
      get() {
        throw new Error('CONTEXT_READ_FORBIDDEN');
      },
    },
  );
  expect(await owner.verify(signed(), value, controller.signal)).toBeNull();
  owner.dispose();
});

it.each([NaN, -1, 8640000000000001])(
  'fails closed on an unusable local clock %#',
  async (time) => {
    vi.mocked(Date.now).mockReturnValue(time);
    const owner = createSiwcIdentityVerifier(keys(publicA));
    expect(await owner.verify(signed(), expected(), signal())).toBeNull();
    owner.dispose();
  },
);

it.each(['expired', 'rollback', 'invalid'] as const)(
  'rechecks the clock after crypto for %s',
  async (operation) => {
    const owner = createSiwcIdentityVerifier(keys(publicA));
    const pending = owner.verify(
      signed({ exp: NOW + 1 }),
      expected(),
      signal(),
    );
    vi.mocked(Date.now).mockReturnValue(
      operation === 'expired'
        ? (NOW + 1) * 1000
        : operation === 'rollback'
          ? (NOW - 10) * 1000
          : NaN,
    );
    expect(await pending).toBeNull();
    owner.dispose();
  },
);

it.each(['signature', 'nonce'] as const)(
  'stops the transaction before any fake credential installation on bad %s',
  async (failure) => {
    const verifier = createSiwcIdentityVerifier(keys(publicA));
    let url: URL | undefined;
    let prepares = 0;
    const transaction = createSiwcAuthTransaction({
      hostId: 'synthetic-host',
      retainRegistration: () => true,
      async openAuthorization(value) {
        url = new URL(value);
      },
      async exchange() {
        return {
          id_token: signed(
            {
              nonce:
                failure === 'nonce'
                  ? 'A'.repeat(43)
                  : url!.searchParams.get('nonce'),
            },
            {},
            failure === 'signature' ? second.privateKey : first.privateKey,
          ),
          access_token: null,
          refresh_token: null,
          token_type: null,
          expires_in: null,
          scope: 'openid',
        };
      },
      verifyIdentity: verifier.verify,
      async prepareCredentials() {
        prepares++;
        return { commit: () => true, discard() {} };
      },
    });
    const redirectUri = 'http://127.0.0.1:54321/auth/callback';
    const result = transaction.begin({ redirectUri, account: null });
    const callback = new URL(redirectUri);
    callback.search = new URLSearchParams({
      state: url!.searchParams.get('state')!,
      code: 'synthetic-code',
      client_id: AUDIENCE,
    }).toString();
    transaction.callback(callback.href);
    expect(await result).toEqual({
      status: 'stopped',
      reason: 'verification-failed',
    });
    expect(prepares).toBe(0);
    expect(transaction.current()).toBeNull();
    transaction.dispose();
    verifier.dispose();
  },
);

it('requires the snapshot root and mandatory key parameters to be own fields', () => {
  const owner = createSiwcIdentityVerifier(keys(publicA));
  Object.defineProperty(Object.prototype, 'keys', {
    configurable: true,
    value: [publicA],
  });
  try {
    expect(owner.replaceKeys('{"unexpected":1}')).toBe(false);
  } finally {
    Reflect.deleteProperty(Object.prototype, 'keys');
  }
  const missing = { ...publicA };
  delete missing.alg;
  Object.defineProperty(Object.prototype, 'alg', {
    configurable: true,
    value: 'RS256',
  });
  try {
    expect(owner.replaceKeys(keys(missing))).toBe(false);
  } finally {
    Reflect.deleteProperty(Object.prototype, 'alg');
    owner.dispose();
  }
});

it('verifies an actual 4096-bit key at the configured upper bound', async () => {
  const strong = generateKeyPairSync('rsa', { modulusLength: 4096 });
  const owner = createSiwcIdentityVerifier(
    keys({
      ...strong.publicKey.export({ format: 'jwk' }),
      kid: 'key-a',
      alg: 'RS256',
    }),
  );
  expect(
    (await owner.verify(
      signed({}, {}, strong.privateKey),
      expected(),
      signal(),
    )) !== null,
  ).toBe(true);
  owner.dispose();
}, 20000);
