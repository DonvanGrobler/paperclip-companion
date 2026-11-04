import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  openSiwcRegistrationStore,
  type SiwcRegistrationStore,
} from '../../src/main/siwc-registration-store';

let directory: string;
let store: SiwcRegistrationStore | null;
const signal = () => new AbortController().signal;
const file = () => path.join(directory, 'registrations.v1.json');
beforeEach(() => {
  directory = fs.mkdtempSync(path.join(os.tmpdir(), 'paperclip-registration-'));
  store = null;
});
afterEach(() => {
  store?.dispose();
  vi.restoreAllMocks();
  vi.unstubAllEnvs();
  fs.rmSync(directory, { recursive: true, force: true });
});
function opened() {
  store = openSiwcRegistrationStore(directory);
  if (!store) throw new Error('EXPECTED_CATALOG');
  return store;
}
it('persists one UUID host before exposure and keeps it on reopen', () => {
  const first = opened();
  const initial = first.read();
  expect(
    initial !== null && /^urn:uuid:[0-9a-f-]{36}$/.test(initial.hostId),
  ).toBe(true);
  expect(fs.existsSync(file())).toBe(true);
  first.dispose();
  const next = opened().read();
  expect(next?.hostId === initial?.hostId).toBe(true);
  expect(next?.registrations.length).toBe(0);
});
it('retains distinct issued IDs idempotently in immutable local slots', () => {
  const owner = opened();
  const hostId = owner.read()!.hostId;
  expect(
    owner.retainRegistration({ hostId, clientId: 'synthetic-one' }, signal()),
  ).toBe(true);
  const first = owner.read()!;
  const bytes = fs.readFileSync(file());
  expect(
    owner.retainRegistration({ hostId, clientId: 'synthetic-one' }, signal()),
  ).toBe(true);
  expect(fs.readFileSync(file()).equals(bytes)).toBe(true);
  expect(
    owner.retainRegistration({ hostId, clientId: 'synthetic-two' }, signal()),
  ).toBe(true);
  const value = owner.read()!;
  expect(value.hostId === hostId && value.registrations.length === 2).toBe(
    true,
  );
  expect(
    value.registrations[0]?.registrationId ===
      first.registrations[0]?.registrationId,
  ).toBe(true);
  expect(
    value.registrations[0]?.registrationId !==
      value.registrations[1]?.registrationId,
  ).toBe(true);
  expect(
    Object.isFrozen(value) &&
      Object.isFrozen(value.registrations) &&
      Object.isFrozen(value.registrations[0]),
  ).toBe(true);
});
it.each(['{', 'null', '{"version":2}', 'x'.repeat(16385)])(
  'denies corrupt/future/oversized files without rotating or rewriting identifiers %#',
  (text) => {
    fs.writeFileSync(file(), text);
    expect(openSiwcRegistrationStore(directory) === null).toBe(true);
    expect(fs.readFileSync(file(), 'utf8') === text).toBe(true);
  },
);
it('disposal and aborted retention never mutate metadata', () => {
  const owner = opened();
  const hostId = owner.read()!.hostId;
  const before = fs.readFileSync(file());
  const controller = new AbortController();
  controller.abort();
  expect(
    owner.retainRegistration(
      { hostId, clientId: 'synthetic-one' },
      controller.signal,
    ),
  ).toBe(false);
  owner.dispose();
  expect(owner.read() === null).toBe(true);
  expect(
    owner.retainRegistration({ hostId, clientId: 'synthetic-one' }, signal()),
  ).toBe(false);
  expect(fs.readFileSync(file()).equals(before)).toBe(true);
});

const host = 'urn:uuid:11111111-1111-4111-8111-111111111111';
const slot = '22222222-2222-4222-8222-222222222222';
const catalog = () => ({
  version: 1,
  hostId: host,
  registrations: [] as unknown[],
});
it.each([
  undefined,
  null,
  '',
  'relative',
  'x'.repeat(2049),
  '/bad\0path',
  '/bad\npath',
])('rejects invalid directory configuration before IO %#', (value) => {
  const io = vi.spyOn(fs, 'lstatSync');
  expect(openSiwcRegistrationStore(value as string) === null).toBe(true);
  expect(io).not.toHaveBeenCalled();
});
it('creates a trusted missing directory and distinct installations', () => {
  const initial = opened().read()!;
  const other = openSiwcRegistrationStore(path.join(directory, 'another'))!;
  try {
    expect(other.read()!.hostId !== initial.hostId).toBe(true);
  } finally {
    other.dispose();
  }
});
it.each([
  {},
  [],
  { ...catalog(), version: 2 },
  { ...catalog(), extra: true },
  { ...catalog(), hostId: null },
  { ...catalog(), hostId: 'synthetic' },
  { ...catalog(), hostId: host.replace('-4111-', '-1111-') },
  { ...catalog(), registrations: null },
  { ...catalog(), registrations: Array.from({ length: 33 }, () => ({})) },
  { ...catalog(), registrations: [{}] },
  { ...catalog(), registrations: [{ registrationId: null, clientId: 'one' }] },
  { ...catalog(), registrations: [{ registrationId: 'bad', clientId: 'one' }] },
  {
    ...catalog(),
    registrations: [{ registrationId: slot, clientId: 'dynamic_agent_client' }],
  },
  {
    ...catalog(),
    registrations: [{ registrationId: slot, clientId: 'x'.repeat(129) }],
  },
  {
    ...catalog(),
    registrations: [
      { registrationId: slot, clientId: 'one', idToken: 'forbidden' },
    ],
  },
  {
    ...catalog(),
    registrations: [
      { registrationId: slot, clientId: 'one' },
      { registrationId: slot, clientId: 'two' },
    ],
  },
  {
    ...catalog(),
    registrations: [
      { registrationId: slot, clientId: 'one' },
      {
        registrationId: '33333333-3333-4333-8333-333333333333',
        clientId: 'one',
      },
    ],
  },
])(
  'fails closed on invalid committed schema without overwriting it %#',
  (value) => {
    const before = JSON.stringify(value);
    fs.writeFileSync(file(), before);
    expect(openSiwcRegistrationStore(directory) === null).toBe(true);
    expect(fs.readFileSync(file(), 'utf8') === before).toBe(true);
  },
);
it.each([Buffer.alloc(0), Buffer.from([0xff, 0xfe])])(
  'rejects empty or malformed UTF-8 committed bytes %#',
  (bytes) => {
    fs.writeFileSync(file(), bytes);
    expect(openSiwcRegistrationStore(directory) === null).toBe(true);
    expect(fs.readFileSync(file()).equals(bytes)).toBe(true);
  },
);
it.each([
  null,
  [],
  {},
  { clientId: false },
  { hostId: host, clientId: 'one' },
  { clientId: 'one', extra: true },
  { clientId: '' },
  { clientId: null },
  { clientId: 'dynamic_agent_client' },
  { clientId: 'x'.repeat(129) },
  { clientId: 'one/two' },
  { clientId: 'one', subject: 'private' },
])(
  'rejects invalid retention records without changing the catalog %#',
  (value) => {
    const owner = opened();
    const before = fs.readFileSync(file());
    const input =
      value && !Array.isArray(value)
        ? { hostId: owner.read()!.hostId, ...value }
        : value;
    expect(owner.retainRegistration(input, signal())).toBe(false);
    expect(fs.readFileSync(file()).equals(before)).toBe(true);
  },
);
it('accepts null-prototype records but never invokes accessors or inherits fields', () => {
  const owner = opened();
  const value = { hostId: owner.read()!.hostId, clientId: 'one' };
  let reads = 0;
  const accessor = { ...value };
  Object.defineProperty(accessor, 'clientId', {
    get() {
      reads++;
      return 'one';
    },
  });
  for (const invalid of [
    accessor,
    Object.create(value),
    { ...value, [Symbol('extra')]: true },
  ])
    expect(owner.retainRegistration(invalid, signal())).toBe(false);
  expect(reads).toBe(0);
  expect(
    owner.retainRegistration(
      Object.assign(Object.create(null), value),
      signal(),
    ),
  ).toBe(true);
});
it.each(['getPrototypeOf', 'ownKeys', 'getOwnPropertyDescriptor'])(
  'hides a throwing %s trap and remains usable',
  (trap) => {
    const owner = opened();
    const value = { hostId: owner.read()!.hostId, clientId: 'one' };
    expect(
      owner.retainRegistration(
        new Proxy(value, {
          [trap]() {
            throw new Error('PRIVATE');
          },
        }),
        signal(),
      ),
    ).toBe(false);
    expect(owner.retainRegistration(value, signal())).toBe(true);
  },
);
it.each(['abort', 'dispose'] as const)(
  'rechecks %s after reflective input and denies reentry',
  (action) => {
    const owner = opened();
    const value = { hostId: owner.read()!.hostId, clientId: 'one' };
    const before = fs.readFileSync(file());
    const controller = new AbortController();
    const input = new Proxy(value, {
      ownKeys(target) {
        expect(owner.read() === null).toBe(true);
        expect(owner.retainRegistration(value, signal())).toBe(false);
        if (action === 'abort') controller.abort();
        else owner.dispose();
        return Reflect.ownKeys(target);
      },
    });
    expect(owner.retainRegistration(input, controller.signal)).toBe(false);
    expect(fs.readFileSync(file()).equals(before)).toBe(true);
  },
);
it('bounds registrations without eviction and preserves slots across reopen', () => {
  const owner = opened();
  const hostId = owner.read()!.hostId;
  for (let i = 0; i < 32; i++)
    expect(
      owner.retainRegistration(
        { hostId, clientId: `synthetic-${i}` },
        signal(),
      ),
    ).toBe(true);
  const before = fs.readFileSync(file());
  const slots = owner.read()!.registrations.map((item) => item.registrationId);
  expect(new Set(slots).size).toBe(32);
  expect(before.length <= 16384).toBe(true);
  expect(
    owner.retainRegistration({ hostId, clientId: 'synthetic-32' }, signal()),
  ).toBe(false);
  expect(
    owner.retainRegistration({ hostId, clientId: 'synthetic-0' }, signal()),
  ).toBe(true);
  expect(fs.readFileSync(file()).equals(before)).toBe(true);
  owner.dispose();
  expect(
    opened()
      .read()!
      .registrations.map((item) => item.registrationId),
  ).toEqual(slots);
});
it.each(['replace', 'remove', 'unavailable'] as const)(
  'permanently blocks a stale owner after %s rather than rewriting identity',
  (action) => {
    const owner = opened();
    const hostId = owner.read()!.hostId;
    const before = fs.readFileSync(file());
    if (action === 'replace')
      fs.writeFileSync(file(), JSON.stringify(catalog()));
    else if (action === 'remove') fs.unlinkSync(file());
    else
      vi.spyOn(fs, 'lstatSync').mockImplementationOnce(() => {
        throw new Error('PRIVATE');
      });
    expect(owner.read() === null).toBe(true);
    fs.writeFileSync(file(), before);
    expect(
      owner.retainRegistration({ hostId, clientId: 'one' }, signal()),
    ).toBe(false);
    expect(owner.read() === null).toBe(true);
    expect(fs.readFileSync(file()).equals(before)).toBe(true);
  },
);
it('also checks external changes on retention without a prior read', () => {
  const owner = opened();
  const hostId = owner.read()!.hostId;
  const replacement = JSON.stringify(catalog());
  fs.writeFileSync(file(), replacement);
  expect(owner.retainRegistration({ hostId, clientId: 'one' }, signal())).toBe(
    false,
  );
  expect(fs.readFileSync(file(), 'utf8') === replacement).toBe(true);
});
it('adopts only the valid winner of an initial no-clobber collision', () => {
  const winner = JSON.stringify(catalog());
  const original = fs.linkSync.bind(fs);
  vi.spyOn(fs, 'linkSync').mockImplementationOnce((source, destination) => {
    fs.writeFileSync(destination, winner, { flag: 'wx' });
    original(source, destination); // Actual native EEXIST, never replacement.
  });
  const owner = opened();
  expect(owner.read()!.hostId === host).toBe(true);
  expect(fs.readFileSync(file(), 'utf8') === winner).toBe(true);
  expect(fs.readdirSync(directory).length).toBe(1);
});
it('does not repair a corrupt winner of an initial collision', () => {
  const original = fs.linkSync.bind(fs);
  vi.spyOn(fs, 'linkSync').mockImplementationOnce((source, destination) => {
    fs.writeFileSync(destination, '{', { flag: 'wx' });
    original(source, destination);
  });
  expect(openSiwcRegistrationStore(directory) === null).toBe(true);
  expect(fs.readFileSync(file(), 'utf8')).toBe('{');
});
it.each([
  'openSync',
  'writeFileSync',
  'fsyncSync',
  'closeSync',
  'linkSync',
] as const)(
  'denies an initial %s failure without exposing an uncommitted host',
  (method) => {
    const original = fs[method].bind(fs) as (...args: unknown[]) => unknown;
    vi.spyOn(fs, method).mockImplementationOnce(((...args: unknown[]) => {
      if (method === 'closeSync') original(...args);
      throw new Error('PRIVATE');
    }) as never);
    expect(openSiwcRegistrationStore(directory) === null).toBe(true);
    expect(fs.existsSync(file())).toBe(false);
    expect(fs.readdirSync(directory).length).toBe(0);
  },
);
it.each(['writeFileSync', 'fsyncSync', 'renameSync'] as const)(
  'preserves committed metadata after update %s failure',
  (method) => {
    const owner = opened();
    const hostId = owner.read()!.hostId;
    const before = fs.readFileSync(file());
    vi.spyOn(fs, method).mockImplementationOnce(() => {
      throw new Error('PRIVATE');
    });
    expect(
      owner.retainRegistration({ hostId, clientId: 'one' }, signal()),
    ).toBe(false);
    expect(fs.readFileSync(file()).equals(before)).toBe(true);
    expect(fs.readdirSync(directory).length).toBe(1);
    expect(
      owner.retainRegistration({ hostId, clientId: 'one' }, signal()),
    ).toBe(true);
  },
);
it('never removes a stage it failed to create exclusively', () => {
  const original = fs.openSync.bind(fs);
  let foreign = '';
  vi.spyOn(fs, 'openSync').mockImplementation(((
    name: string,
    flags: string,
    mode?: number,
  ) => {
    if (flags === 'wx') {
      foreign = name;
      const descriptor = original(name, 'wx', mode);
      fs.writeFileSync(descriptor, 'foreign');
      fs.closeSync(descriptor);
    }
    return original(name, flags, mode);
  }) as never);
  expect(openSiwcRegistrationStore(directory) === null).toBe(true);
  expect(fs.readFileSync(foreign, 'utf8')).toBe('foreign');
});
it('ignores orphan stages after cleanup failure and never restores them', () => {
  vi.spyOn(fs, 'unlinkSync').mockImplementationOnce(() => {
    throw new Error('PRIVATE');
  });
  const owner = opened();
  const hostId = owner.read()!.hostId;
  expect(fs.readdirSync(directory).length).toBe(2);
  owner.dispose();
  expect(opened().read()!.hostId === hostId).toBe(true);
});
it.each([
  'directory',
  'file',
  'symlink',
  'oversized',
  'opened-type',
  'opened-size',
] as const)('denies unsafe %s file metadata', (kind) => {
  opened().dispose();
  const actual = fs.lstatSync(file());
  if (kind === 'opened-type' || kind === 'opened-size')
    vi.spyOn(fs, 'fstatSync').mockReturnValueOnce({
      ...actual,
      isFile: () => kind !== 'opened-type',
      size: 16385,
    } as fs.Stats);
  else {
    const invalid = {
      ...actual,
      isDirectory: () => false,
      isFile: () => kind !== 'file',
      isSymbolicLink: () => kind === 'symlink',
      size: kind === 'oversized' ? 16385 : actual.size,
    } as fs.Stats;
    if (kind === 'directory')
      vi.spyOn(fs, 'lstatSync').mockReturnValueOnce(invalid);
    else
      vi.spyOn(fs, 'lstatSync')
        .mockReturnValueOnce(fs.lstatSync(directory))
        .mockReturnValueOnce(invalid);
  }
  expect(openSiwcRegistrationStore(directory) === null).toBe(true);
});
it('reads partial native chunks until EOF', () => {
  const owner = opened();
  const hostId = owner.read()!.hostId;
  owner.dispose();
  const original = fs.readSync.bind(fs);
  vi.spyOn(fs, 'readSync').mockImplementation(((
    fd: number,
    bytes: Buffer,
    offset: number,
    length: number,
    position: null,
  ) => original(fd, bytes, offset, Math.min(3, length), position)) as never);
  expect(opened().read()!.hostId === hostId).toBe(true);
});
it.each([0, 16385])(
  'rejects changed stream length %s despite an earlier valid stat',
  (count) => {
    opened().dispose();
    vi.spyOn(fs, 'readSync').mockReturnValueOnce(count);
    expect(openSiwcRegistrationStore(directory) === null).toBe(true);
  },
);
it.each(['abort', 'dispose'] as const)(
  'may retain nonsecret metadata after synchronous install %s but returns no authorization success',
  (action) => {
    const owner = opened();
    const hostId = owner.read()!.hostId;
    const controller = new AbortController();
    const original = fs.renameSync.bind(fs);
    vi.spyOn(fs, 'renameSync').mockImplementationOnce((source, destination) => {
      original(source, destination);
      if (action === 'abort') controller.abort();
      else owner.dispose();
    });
    expect(
      owner.retainRegistration({ hostId, clientId: 'one' }, controller.signal),
    ).toBe(false);
    owner.dispose();
    expect(opened().read()!.registrations[0]?.clientId === 'one').toBe(true);
  },
);
it('restores installation and registration IDs in a separate native Node process', async () => {
  vi.stubEnv('NODE_OPTIONS', '--no-warnings');
  vi.stubEnv('PAPERCLIP_REGISTRATION_PRIVATE', 'synthetic');
  const owner = opened();
  const hostId = owner.read()!.hostId;
  expect(owner.retainRegistration({ hostId, clientId: 'one' }, signal())).toBe(
    true,
  );
  const expected = owner.read()!;
  owner.dispose();
  const result = await new Promise<boolean>((resolve) => {
    const child = spawn(
      process.execPath,
      [
        fileURLToPath(
          new URL('../fixtures/siwc-registration-child.ts', import.meta.url),
        ),
        directory,
      ],
      {
        stdio: ['pipe', 'pipe', 'pipe'],
        shell: false,
        windowsHide: true,
        detached: false,
        env: process.env.SystemRoot
          ? { SystemRoot: process.env.SystemRoot }
          : {},
      },
    );
    let output = '';
    let errors = false;
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, 5000);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.stdout.on('data', (bytes: Buffer) => {
      output = (output + bytes.toString()).slice(0, 16);
    });
    child.stderr.on('data', () => {
      errors = true;
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0 && !errors && output === 'true');
    });
    child.stdin.on('error', () => {
      /* Process error/close determines the fixed outcome. */
    });
    child.stdin.end(JSON.stringify(expected)); // Nonsecret synthetic identifiers only.
  });
  expect(result).toBe(true);
}, 15000);
