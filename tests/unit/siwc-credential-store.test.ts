import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createWindowsSiwcCredentialStore } from '../../src/main/siwc-credential-store';
import { createSiwcAuthTransaction } from '../../src/main/siwc-auth-transaction';

const signal = () => new AbortController().signal;
const record = () => ({
  issuer: 'https://auth.openai.com',
  subject: 'synthetic-subject',
  clientId: 'synthetic-client',
  hostId: 'synthetic-host',
  accessToken: randomBytes(24).toString('base64url'),
  refreshToken: randomBytes(24).toString('base64url'),
  idToken: randomBytes(24).toString('base64url'),
  scopes: ['openid'],
  expiresAt: Date.now() + 60_000,
});
function encryptionDouble() {
  const key = randomBytes(32);
  return {
    key,
    isAsyncEncryptionAvailable: vi.fn(async () => true),
    encryptStringAsync: vi.fn(async (text: string): Promise<Buffer> => {
      const iv = randomBytes(12);
      const cipher = createCipheriv('aes-256-gcm', key, iv);
      return Buffer.concat([
        iv,
        cipher.update(text, 'utf8'),
        cipher.final(),
        cipher.getAuthTag(),
      ]);
    }),
    decryptStringAsync: vi.fn(async (bytes: Buffer) => {
      const cipher = createDecipheriv(
        'aes-256-gcm',
        key,
        bytes.subarray(0, 12),
      );
      cipher.setAuthTag(bytes.subarray(-16));
      return {
        result: Buffer.concat([
          cipher.update(bytes.subarray(12, -16)),
          cipher.final(),
        ]).toString('utf8'),
        shouldReEncrypt: false,
      };
    }),
  };
}
let directory: string;
let crypto: ReturnType<typeof encryptionDouble>;
let store: ReturnType<typeof createWindowsSiwcCredentialStore>;
const installed = () => path.join(directory, 'credentials.v1.bin');
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function save() {
  const candidate = await store.prepare(record(), signal());
  expect(candidate.commit()).toBe(true);
  return fs.readFileSync(installed());
}
beforeEach(() => {
  vi.stubGlobal('process', { ...process, platform: 'win32' });
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'paperclip-credentials-'));
  crypto = encryptionDouble();
  store = createWindowsSiwcCredentialStore(directory, crypto);
});

it.each<[string, () => unknown]>([
  ['null', () => null],
  ['array', () => []],
  ['missing', () => ({})],
  ['foreign prototype', (): unknown => Object.create(record())],
  ['extra field', () => ({ ...record(), email: 'excluded' })],
  ['symbol field', () => ({ ...record(), [Symbol()]: true })],
  [
    'getter',
    () =>
      Object.defineProperty(record(), 'idToken', {
        get() {
          throw new Error('PRIVATE');
        },
      }),
  ],
  [
    'wrong issuer',
    () => ({ ...record(), issuer: 'https://untrusted.invalid' }),
  ],
  ['empty subject', () => ({ ...record(), subject: '' })],
  ['long subject', () => ({ ...record(), subject: 'x'.repeat(256) })],
  ['control subject', () => ({ ...record(), subject: 'x\n' })],
  ['client number', () => ({ ...record(), clientId: 5 })],
  ['client punctuation', () => ({ ...record(), clientId: 'bad/client' })],
  [
    'client bootstrap',
    () => ({ ...record(), clientId: 'dynamic_agent_client' }),
  ],
  ['host number', () => ({ ...record(), hostId: 1 })],
  ['host punctuation', () => ({ ...record(), hostId: 'bad host' })],
  ['empty ID token', () => ({ ...record(), idToken: '' })],
  ['oversized token', () => ({ ...record(), idToken: 'x'.repeat(16385) })],
  ['access type', () => ({ ...record(), accessToken: 2 })],
  ['refresh type', () => ({ ...record(), refreshToken: {} })],
  ['null access with expiry', () => ({ ...record(), accessToken: null })],
  ['missing expiry', () => ({ ...record(), expiresAt: null })],
  ['string expiry', () => ({ ...record(), expiresAt: 'future' })],
  ['fraction expiry', () => ({ ...record(), expiresAt: 2.5 })],
  ['zero expiry', () => ({ ...record(), expiresAt: 0 })],
  ['negative expiry', () => ({ ...record(), expiresAt: -1 })],
  ['far expiry', () => ({ ...record(), expiresAt: 8640000000000001 })],
  ['scopes object', () => ({ ...record(), scopes: {} })],
  [
    'scopes prototype',
    () => ({ ...record(), scopes: Object.setPrototypeOf([], null) }),
  ],
  [
    'too many scopes',
    () => ({
      ...record(),
      scopes: Array.from({ length: 2049 }, (_, i) => `s${i}`),
    }),
  ],
  ['sparse scopes', () => ({ ...record(), scopes: Array(1) })],
  [
    'scopes with extra property',
    () => ({ ...record(), scopes: Object.assign(['openid'], { extra: true }) }),
  ],
  [
    'scope getter',
    () => ({
      ...record(),
      scopes: Object.defineProperty(['openid'], '0', {
        get() {
          throw new Error('PRIVATE');
        },
      }),
    }),
  ],
  ['scope type', () => ({ ...record(), scopes: [1] })],
  ['scope whitespace', () => ({ ...record(), scopes: ['open id'] })],
  ['scope backslash', () => ({ ...record(), scopes: ['\\'] })],
  ['scope bounds', () => ({ ...record(), scopes: ['x'.repeat(4097)] })],
  ['duplicate scopes', () => ({ ...record(), scopes: ['openid', 'openid'] })],
  [
    'inference without access',
    () => ({
      ...record(),
      accessToken: null,
      expiresAt: null,
      scopes: ['resource.invoke', 'chatgpt.tokens.use.direct'],
    }),
  ],
  [
    'escaped payload bounds',
    () => ({
      ...record(),
      idToken: '\\'.repeat(16384),
      accessToken: '\\'.repeat(16384),
      refreshToken: '\\'.repeat(16384),
    }),
  ],
] as const)(
  'denies %s without encryption or persistence',
  async (_name, make) => {
    await expect(store.prepare(make(), signal())).rejects.toThrow(
      'CREDENTIAL_STORE_UNAVAILABLE',
    );
    expect(crypto.isAsyncEncryptionAvailable).not.toHaveBeenCalled();
    expect(fs.readdirSync(directory).length).toBe(0);
  },
);

it('requires each own data field without invoking inherited values', async () => {
  const input = record();
  Reflect.deleteProperty(input, 'idToken');
  Object.assign(input, { extra: true });
  await expect(store.prepare(input, signal())).rejects.toThrow(
    'CREDENTIAL_STORE_UNAVAILABLE',
  );
  expect(crypto.encryptStringAsync).not.toHaveBeenCalled();
});
it.each([false, true])(
  'allows bounded identity-only records, optional refresh: %s',
  async (refresh) => {
    const input = {
      ...record(),
      accessToken: null,
      refreshToken: refresh ? record().refreshToken : null,
      expiresAt: null,
      scopes: [],
    };
    const candidate = await store.prepare(
      Object.assign(Object.create(null), input),
      signal(),
    );
    expect(candidate.commit()).toBe(true);
    const loaded = await store.load(signal());
    expect(
      loaded.status === 'loaded' &&
        loaded.record.accessToken === null &&
        loaded.record.expiresAt === null,
    ).toBe(true);
  },
);
it('copies records before async preparation and treats restored expiry as data', async () => {
  const input = { ...record(), expiresAt: 1 };
  const expected = input.idToken;
  const pending = store.prepare(input, signal());
  input.idToken = record().idToken;
  input.scopes.push('mutated');
  expect((await pending).commit()).toBe(true);
  const loaded = await store.load(signal());
  expect(
    loaded.status === 'loaded' &&
      loaded.record.idToken === expected &&
      loaded.record.expiresAt === 1 &&
      loaded.record.scopes.length === 1,
  ).toBe(true);
});
it.each(['availability', 'encryption'] as const)(
  'denies cancellation during %s and rejects late completion after a fresh commit',
  async (phase) => {
    const controller = new AbortController();
    const available = deferred<boolean>();
    const encrypted = deferred<Buffer>();
    const encrypt = crypto.encryptStringAsync.getMockImplementation()!;
    if (phase === 'availability')
      crypto.isAsyncEncryptionAvailable.mockReturnValueOnce(available.promise);
    else crypto.encryptStringAsync.mockReturnValueOnce(encrypted.promise);
    const pending = store.prepare(record(), controller.signal).then(
      () => false,
      (e: Error) => e.message === 'CREDENTIAL_STORE_UNAVAILABLE',
    );
    await vi.waitFor(() =>
      expect(
        phase === 'availability'
          ? crypto.isAsyncEncryptionAvailable
          : crypto.encryptStringAsync,
      ).toHaveBeenCalled(),
    );
    controller.abort();
    const before = await save();
    available.resolve(true);
    const late = await encrypt(
      JSON.stringify({ version: 1, record: record() }),
    );
    encrypted.resolve(late);
    expect(await pending).toBe(true);
    expect(fs.readFileSync(installed()).equals(before)).toBe(true);
    if (phase === 'encryption')
      expect(late.every((byte) => byte === 0)).toBe(true);
    before.fill(0);
    late.fill(0);
  },
);
it.each(['availability', 'encryption', 'prepared'] as const)(
  'disposal is terminal during %s',
  async (phase) => {
    const delayed = deferred<boolean>();
    const encrypted = deferred<Buffer>();
    if (phase === 'availability')
      crypto.isAsyncEncryptionAvailable.mockReturnValueOnce(delayed.promise);
    if (phase === 'encryption')
      crypto.encryptStringAsync.mockReturnValueOnce(encrypted.promise);
    const pending = store.prepare(record(), signal()).then(
      (value) => value,
      () => null,
    );
    if (phase === 'prepared') {
      const candidate = await pending;
      store.dispose();
      expect(candidate?.commit()).toBe(false);
      candidate?.discard();
    } else {
      await vi.waitFor(() =>
        expect(
          phase === 'availability'
            ? crypto.isAsyncEncryptionAvailable
            : crypto.encryptStringAsync,
        ).toHaveBeenCalled(),
      );
      store.dispose();
      delayed.resolve(true);
      encrypted.resolve(randomBytes(32));
      expect(await pending).toBeNull();
    }
    expect((await store.load(signal())).status).toBe('stopped');
    await expect(store.prepare(record(), signal())).rejects.toThrow(
      'CREDENTIAL_STORE_UNAVAILABLE',
    );
    expect(fs.readdirSync(directory).length).toBe(0);
  },
);
it('rejects overlap, then permits new work after discard without an old discard stealing it', async () => {
  const old = await store.prepare(record(), signal());
  await expect(store.prepare(record(), signal())).rejects.toThrow(
    'CREDENTIAL_STORE_UNAVAILABLE',
  );
  expect((await store.load(signal())).status).toBe('unavailable');
  old.discard();
  const fresh = await store.prepare(record(), signal());
  old.discard();
  expect(fresh.commit()).toBe(true);
});
it('denies already-aborted work without consulting encryption', async () => {
  const controller = new AbortController();
  controller.abort();
  await expect(store.prepare(record(), controller.signal)).rejects.toThrow(
    'CREDENTIAL_STORE_UNAVAILABLE',
  );
  expect((await store.load(controller.signal)).status).toBe('stopped');
  expect(crypto.isAsyncEncryptionAvailable).not.toHaveBeenCalled();
});
it.each([
  'mkdirSync',
  'openSync',
  'writeFileSync',
  'fsyncSync',
  'closeSync',
  'renameSync',
] as const)('preserves previous credentials when %s fails', async (method) => {
  const before = await save();
  const original = fs[method].bind(fs) as (...args: unknown[]) => unknown;
  vi.spyOn(fs, method).mockImplementationOnce(((...args: unknown[]) => {
    // Close the descriptor even while modelling an OS close error.
    if (method === 'closeSync') original(...args);
    throw new Error('PRIVATE');
  }) as never);
  if (method === 'renameSync')
    expect((await store.prepare(record(), signal())).commit()).toBe(false);
  else
    await expect(store.prepare(record(), signal())).rejects.toThrow(
      'CREDENTIAL_STORE_UNAVAILABLE',
    );
  expect(fs.readFileSync(installed()).equals(before)).toBe(true);
  expect(fs.readdirSync(directory).length).toBe(1);
  before.fill(0);
});
it('ignores cleanup failure and never loads its encrypted orphan', async () => {
  const candidate = await store.prepare(record(), signal());
  vi.spyOn(fs, 'unlinkSync').mockImplementationOnce(() => {
    throw new Error('PRIVATE');
  });
  expect(() => candidate.discard()).not.toThrow();
  expect(candidate.commit()).toBe(false);
  expect((await store.load(signal())).status).toBe('missing');
});
it.each(['availability', 'encrypt'] as const)(
  'hides %s exceptions and releases ownership',
  async (phase) => {
    if (phase === 'availability')
      crypto.isAsyncEncryptionAvailable.mockRejectedValueOnce(
        new Error('PRIVATE'),
      );
    else crypto.encryptStringAsync.mockRejectedValueOnce(new Error('PRIVATE'));
    await expect(store.prepare(record(), signal())).rejects.toThrow(
      'CREDENTIAL_STORE_UNAVAILABLE',
    );
    expect((await store.prepare(record(), signal())).commit()).toBe(true);
  },
);
it.each([null, Buffer.alloc(0), Buffer.alloc(98305)] as const)(
  'denies invalid encrypted output without staging',
  async (bytes) => {
    crypto.encryptStringAsync.mockResolvedValueOnce(bytes as Buffer);
    await expect(store.prepare(record(), signal())).rejects.toThrow(
      'CREDENTIAL_STORE_UNAVAILABLE',
    );
    expect(fs.readdirSync(directory).length).toBe(0);
  },
);
it.each(['relative', '', 'bad\0path'])(
  'rejects untrusted directory configuration',
  (directory) => {
    expect(() => createWindowsSiwcCredentialStore(directory, crypto)).toThrow(
      'CREDENTIAL_STORE_CONFIGURATION',
    );
  },
);
it('rechecks cancellation after reflective record inspection', async () => {
  const controller = new AbortController();
  const value = new Proxy(record(), {
    ownKeys(target) {
      controller.abort();
      return Reflect.ownKeys(target);
    },
  });
  await expect(store.prepare(value, controller.signal)).rejects.toThrow(
    'CREDENTIAL_STORE_UNAVAILABLE',
  );
  expect(crypto.isAsyncEncryptionAvailable).not.toHaveBeenCalled();
});
it.each(['null', 'undefined', 'private'])(
  'load handles arbitrary availability rejection %s',
  async (kind) => {
    crypto.isAsyncEncryptionAvailable.mockRejectedValueOnce(
      kind === 'null'
        ? null
        : kind === 'undefined'
          ? undefined
          : new Error('PRIVATE'),
    );
    expect((await store.load(signal())).status).toBe('unavailable');
  },
);
it.each(['availability', 'decrypt'] as const)(
  'load discards late %s completion after abort',
  async (phase) => {
    const before = await save();
    const controller = new AbortController();
    const available = deferred<boolean>();
    const decrypted = deferred<{ result: string; shouldReEncrypt: boolean }>();
    if (phase === 'availability')
      crypto.isAsyncEncryptionAvailable.mockReturnValueOnce(available.promise);
    else crypto.decryptStringAsync.mockReturnValueOnce(decrypted.promise);
    const pending = store.load(controller.signal);
    await vi.waitFor(() =>
      expect(
        phase === 'availability'
          ? crypto.isAsyncEncryptionAvailable.mock.calls.length > 1
          : crypto.decryptStringAsync.mock.calls.length > 0,
      ).toBe(true),
    );
    controller.abort();
    const fresh = await store.prepare(record(), signal());
    available.resolve(true);
    decrypted.resolve({
      result: JSON.stringify({ version: 1, record: record() }),
      shouldReEncrypt: false,
    });
    expect((await pending).status).toBe('stopped');
    expect(fresh.commit()).toBe(true);
    before.fill(0);
  },
);
it('load forwards key rotation advice without an automatic write', async () => {
  const before = await save();
  const decrypt = crypto.decryptStringAsync.getMockImplementation()!;
  crypto.decryptStringAsync.mockImplementationOnce(async (bytes) => ({
    ...(await decrypt(bytes)),
    shouldReEncrypt: true,
  }));
  const value = await store.load(signal());
  expect(value.status === 'loaded' && value.shouldReEncrypt).toBe(true);
  expect(fs.readFileSync(installed()).equals(before)).toBe(true);
  before.fill(0);
});
it.each<[string, () => string]>([
  ['wrong version', () => JSON.stringify({ version: 2, record: record() })],
  ['malformed JSON', () => '{'],
  ['null JSON', () => 'null'],
  ['missing record', () => JSON.stringify({ version: 1, extra: true })],
  ['invalid record', () => JSON.stringify({ version: 1, record: {} })],
  ['oversized text', () => 'x'.repeat(65537)],
  ['oversized UTF8', () => 'é'.repeat(40000)],
] as const)(
  'denies decrypted %s without changing the installed file',
  async (_name, make) => {
    const before = await save();
    crypto.decryptStringAsync.mockResolvedValueOnce({
      result: make(),
      shouldReEncrypt: false,
    });
    expect((await store.load(signal())).status).toBe('invalid');
    expect(fs.readFileSync(installed()).equals(before)).toBe(true);
    before.fill(0);
  },
);
it.each([
  null,
  {},
  { result: 2, shouldReEncrypt: false },
  { result: '{}', shouldReEncrypt: 'yes' },
])('denies invalid decrypt result', async (value) => {
  (await save()).fill(0);
  crypto.decryptStringAsync.mockResolvedValueOnce(value as never);
  expect((await store.load(signal())).status).toBe('invalid');
});
it.each([0, 98305])(
  'rejects ciphertext size %i before decryption',
  async (size) => {
    fs.writeFileSync(installed(), Buffer.alloc(size));
    expect((await store.load(signal())).status).toBe('invalid');
    expect(crypto.decryptStringAsync).not.toHaveBeenCalled();
  },
);
it('rejects non-file storage and filesystem read errors', async () => {
  fs.mkdirSync(installed());
  expect((await store.load(signal())).status).toBe('invalid');
  fs.rmSync(installed(), { recursive: true });
  (await save()).fill(0);
  vi.spyOn(fs, 'openSync').mockImplementationOnce(() => {
    throw new Error('PRIVATE');
  });
  expect((await store.load(signal())).status).toBe('unavailable');
});
it('loads missing directory without creating it', async () => {
  fs.rmSync(directory, { recursive: true });
  expect((await store.load(signal())).status).toBe('missing');
  expect(fs.existsSync(directory)).toBe(false);
});
it('rejects a non-directory private location without touching another file', async () => {
  fs.rmSync(directory, { recursive: true });
  fs.writeFileSync(directory, 'synthetic');
  await expect(store.prepare(record(), signal())).rejects.toThrow(
    'CREDENTIAL_STORE_UNAVAILABLE',
  );
  expect((await store.load(signal())).status).toBe('unavailable');
});
it('denies a directory symlink before staging', async () => {
  const stat = fs.lstatSync(directory);
  vi.spyOn(fs, 'lstatSync').mockReturnValueOnce(
    Object.assign(stat, { isSymbolicLink: () => true }) as never,
  );
  await expect(store.prepare(record(), signal())).rejects.toThrow(
    'CREDENTIAL_STORE_UNAVAILABLE',
  );
  expect(fs.readdirSync(directory).length).toBe(0);
});
it('denies an installed symlink before opening it', async () => {
  (await save()).fill(0);
  const directoryStat = fs.lstatSync(directory);
  const fileStat = fs.lstatSync(installed());
  vi.spyOn(fs, 'lstatSync')
    .mockReturnValueOnce(directoryStat as never)
    .mockReturnValueOnce(
      Object.assign(fileStat, { isSymbolicLink: () => true }) as never,
    );
  expect((await store.load(signal())).status).toBe('invalid');
  expect(crypto.decryptStringAsync).not.toHaveBeenCalled();
});
it.each(['non-file', 'empty', 'oversized'] as const)(
  'rechecks opened file type/size: %s',
  async (kind) => {
    (await save()).fill(0);
    const stat = fs.statSync(installed());
    vi.spyOn(fs, 'fstatSync').mockReturnValueOnce(
      Object.assign(stat, {
        size: kind === 'empty' ? 0 : kind === 'oversized' ? 98305 : stat.size,
        isFile: () => kind !== 'non-file',
      }) as never,
    );
    expect((await store.load(signal())).status).toBe('invalid');
  },
);
it('reads short chunks to EOF rather than accepting a truncated prefix', async () => {
  (await save()).fill(0);
  const read = fs.readSync;
  vi.spyOn(fs, 'readSync').mockImplementation(((
    fd: number,
    buffer: Buffer,
    offset: number,
    length: number,
    position: number | null,
  ) => read(fd, buffer, offset, Math.min(length, 7), position)) as never);
  expect((await store.load(signal())).status).toBe('loaded');
});
it.each([0, 98305])(
  'denies a file that changes size while being read: %i',
  async (length) => {
    (await save()).fill(0);
    vi.spyOn(fs, 'readSync').mockReturnValueOnce(length);
    expect((await store.load(signal())).status).toBe('invalid');
    expect(crypto.decryptStringAsync).not.toHaveBeenCalled();
  },
);
it('discards failed late availability/decryption and reflected disposal during load', async () => {
  (await save()).fill(0);
  const controller = new AbortController();
  crypto.decryptStringAsync.mockImplementationOnce(async () => {
    controller.abort();
    throw new Error('PRIVATE');
  });
  expect((await store.load(controller.signal)).status).toBe('stopped');
  crypto.decryptStringAsync.mockResolvedValueOnce(
    new Proxy(
      { result: '{}', shouldReEncrypt: false },
      {
        ownKeys(target) {
          store.dispose();
          return Reflect.ownKeys(target);
        },
      },
    ),
  );
  expect((await store.load(signal())).status).toBe('stopped');
});
it('rechecks disposal while validating restored scope metadata', async () => {
  (await save()).fill(0);
  // JSON itself cannot contain traps; intercept parsing to exercise the generation guard.
  const parse = JSON.parse;
  vi.spyOn(JSON, 'parse').mockImplementationOnce((text: string) => {
    const value = parse(text) as { record: ReturnType<typeof record> };
    value.record.scopes = new Proxy(value.record.scopes, {
      ownKeys(target) {
        store.dispose();
        return Reflect.ownKeys(target);
      },
    });
    return value;
  });
  expect((await store.load(signal())).status).toBe('stopped');
});

it('exclusive-open collision never deletes a file this operation did not create', async () => {
  const open = fs.openSync;
  let foreign: string | undefined;
  vi.spyOn(fs, 'openSync').mockImplementationOnce(((file: string) => {
    foreign = file;
    const descriptor = open(file, 'wx', 0o600);
    try {
      fs.writeFileSync(descriptor, randomBytes(32));
    } finally {
      fs.closeSync(descriptor);
    }
    throw Object.assign(new Error('PRIVATE'), { code: 'EEXIST' });
  }) as never);
  await expect(store.prepare(record(), signal())).rejects.toThrow(
    'CREDENTIAL_STORE_UNAVAILABLE',
  );
  expect(!!foreign && fs.existsSync(foreign)).toBe(true);
  expect((await store.load(signal())).status).toBe('missing');
});
it.each([false, true])(
  'transaction composes with encrypted storage, cancel during native work: %s',
  async (cancel) => {
    const value = record();
    const delayed = deferred<boolean>();
    if (cancel)
      crypto.isAsyncEncryptionAvailable.mockReturnValueOnce(delayed.promise);
    let authorization: URL | undefined;
    const owner = createSiwcAuthTransaction({
      hostId: value.hostId,
      retainRegistration: () => true, // Metadata is a fake in this storage-only composition.
      async openAuthorization(url) {
        authorization = new URL(url);
      },
      async exchange() {
        return {
          access_token: value.accessToken,
          refresh_token: value.refreshToken,
          id_token: value.idToken,
          token_type: 'Bearer',
          expires_in: 60,
          scope: 'openid',
        };
      },
      async verifyIdentity(_token, expected) {
        return {
          ...expected,
          subject: value.subject,
          expiresAt: Date.now() + 60_000,
        };
      },
      prepareCredentials: store.prepare,
    });
    try {
      const pending = owner.begin({
        redirectUri: 'http://127.0.0.1:54321/auth/callback',
        account: null,
      });
      await vi.waitFor(() => expect(!!authorization).toBe(true));
      owner.callback(
        `http://127.0.0.1:54321/auth/callback?state=${authorization!.searchParams.get('state')}&code=synthetic-code&client_id=${value.clientId}`,
      );
      if (cancel) {
        await vi.waitFor(() =>
          expect(crypto.isAsyncEncryptionAvailable).toHaveBeenCalled(),
        );
        expect(owner.cancel()).toBe(true);
        expect(await pending).toEqual({
          status: 'stopped',
          reason: 'cancelled',
        });
        const fresh = await store.prepare(value, signal());
        expect(fresh.commit()).toBe(true);
        delayed.resolve(true);
        await vi.waitFor(() =>
          expect(crypto.encryptStringAsync.mock.calls.length).toBe(1),
        );
        expect(owner.current()).toBeNull();
      } else {
        expect(await pending).toEqual({
          status: 'authenticated',
          inferenceAllowed: false,
        });
      }
      const loaded = await store.load(signal());
      expect(
        loaded.status === 'loaded' && loaded.record.idToken === value.idToken,
      ).toBe(true);
    } finally {
      owner.dispose();
    }
  },
);
afterEach(() => {
  store.dispose();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  crypto.key.fill(0);
  fs.rmSync(directory, { recursive: true, force: true });
});
describe('protected staged credentials', () => {
  it('encrypts before staging, commits once and restores through a fresh owner', async () => {
    const value = record();
    expect((await store.load(signal())).status).toBe('missing');
    const candidate = await store.prepare(value, signal());
    expect(fs.existsSync(installed())).toBe(false);
    expect(fs.readdirSync(directory).length).toBe(1);
    const stage = fs.readFileSync(
      path.join(directory, fs.readdirSync(directory)[0]!),
    );
    expect(stage.includes(Buffer.from(value.idToken))).toBe(false);
    stage.fill(0);
    expect(candidate.commit()).toBe(true);
    expect(candidate.commit()).toBe(false);
    candidate.discard();
    store.dispose();
    store = createWindowsSiwcCredentialStore(directory, crypto);
    const loaded = await store.load(signal());
    expect(loaded.status).toBe('loaded');
    expect(
      loaded.status === 'loaded' && loaded.record.idToken === value.idToken,
    ).toBe(true);
    expect(
      loaded.status === 'loaded' &&
        Object.isFrozen(loaded.record) &&
        Object.isFrozen(loaded.record.scopes),
    ).toBe(true);
  });
  it('cancellation discards staging and preserves the installed record', async () => {
    const previous = await store.prepare(record(), signal());
    expect(previous.commit()).toBe(true);
    const before = fs.readFileSync(installed());
    const controller = new AbortController();
    const next = await store.prepare(record(), controller.signal);
    controller.abort();
    expect(next.commit()).toBe(false);
    expect(fs.readFileSync(installed()).equals(before)).toBe(true);
    expect(fs.readdirSync(directory).length).toBe(1);
    before.fill(0);
  });
  it('fails closed before any filesystem write when encryption is unavailable', async () => {
    crypto.isAsyncEncryptionAvailable.mockResolvedValue(false);
    await expect(store.prepare(record(), signal())).rejects.toThrow(
      'CREDENTIAL_STORE_UNAVAILABLE',
    );
    expect(fs.readdirSync(directory).length).toBe(0);
    expect(crypto.encryptStringAsync).not.toHaveBeenCalled();
    expect((await store.load(signal())).status).toBe('unavailable');
  });
  it.each(['linux', 'darwin'])(
    'denies unsupported %s before encryption',
    async (platform) => {
      vi.stubGlobal('process', { ...process, platform });
      await expect(store.prepare(record(), signal())).rejects.toThrow(
        'CREDENTIAL_STORE_UNAVAILABLE',
      );
      expect((await store.load(signal())).status).toBe('unavailable');
      expect(crypto.isAsyncEncryptionAvailable).not.toHaveBeenCalled();
    },
  );
  it('never promotes an interrupted encrypted stage', async () => {
    const prepared = await store.prepare(record(), signal());
    const orphan = fs.readFileSync(
      path.join(directory, fs.readdirSync(directory)[0]!),
    );
    prepared.discard();
    fs.writeFileSync(
      path.join(directory, 'credential-interrupted.stage'),
      orphan,
    );
    orphan.fill(0);
    expect((await store.load(signal())).status).toBe('missing');
    expect(fs.existsSync(installed())).toBe(false);
  });
  it('rejects corrupt ciphertext without exposing the decryption exception', async () => {
    fs.writeFileSync(installed(), randomBytes(80));
    expect((await store.load(signal())).status).toBe('invalid');
  });
});
