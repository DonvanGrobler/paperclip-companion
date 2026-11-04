import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { openSiwcRegistrationStore } from '../../src/main/siwc-registration-store';
import { afterEach, expect, it, vi } from 'vitest';
import {
  createSiwcAuthTransaction,
  type SiwcAccount,
  type SiwcAuthHooks,
  type SiwcCredentialRecord,
  type SiwcIdentityExpectation,
  type SiwcPreparedCredentials,
} from '../../src/main/siwc-auth-transaction';

afterEach(() => vi.useRealTimers());
const redirectUri = 'http://127.0.0.1:54321/auth/callback';
const issuer = 'https://auth.openai.com';
const clientId = 'synthetic-client-1';
const account: SiwcAccount = {
  issuer,
  subject: 'synthetic-subject-1',
  clientId,
};
const input = () => ({ redirectUri, account: null });
function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
}
function harness(overrides: Partial<SiwcAuthHooks> = {}) {
  // Ephemeral synthetic markers only. Never use real token formats or snapshot hook inputs.
  const markers = Array.from({ length: 3 }, () => `synthetic:${randomUUID()}`);
  const counts = {
    launch: 0,
    exchange: 0,
    verify: 0,
    prepare: 0,
    commit: 0,
    discard: 0,
  };
  let launch: URL | null = null;
  let signal: AbortSignal | null = null;
  let verifier = '';
  let installed: Readonly<SiwcCredentialRecord> | null = null;
  let grant: unknown = {
    access_token: markers[0],
    refresh_token: markers[1],
    id_token: markers[2],
    token_type: 'Bearer',
    expires_in: 3600,
    scope:
      'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
  };
  const hooks: SiwcAuthHooks = {
    hostId: 'synthetic-host-1',
    retainRegistration: () => true, // Explicit test fake, no persistence evidence.
    async openAuthorization(url, currentSignal) {
      counts.launch++;
      launch = new URL(url);
      signal = currentSignal;
    },
    async exchange(request) {
      counts.exchange++;
      verifier = request.codeVerifier;
      expect(request.endpoint).toBe(
        'https://auth.openai.com/api/accounts/oauth/token',
      );
      expect(request.clientId).toBe(clientId);
      expect(request.redirectUri).toBe(redirectUri);
      expect(request.resource).toBe('https://api.openai.com/v1');
      expect(Object.isFrozen(request)).toBe(true);
      return grant;
    },
    async verifyIdentity(token, expected) {
      counts.verify++;
      expect(token === markers[2]).toBe(true);
      expect(expected.issuer).toBe(issuer);
      expect(expected.audience).toBe(clientId);
      expect(expected.nonce === launch?.searchParams.get('nonce')).toBe(true);
      expect(Object.isFrozen(expected)).toBe(true);
      return {
        issuer,
        subject: account.subject,
        audience: expected.audience,
        nonce: expected.nonce,
        expiresAt: Date.now() + 3600000,
      };
    },
    async prepareCredentials(record) {
      counts.prepare++;
      expect(
        record.accessToken === markers[0] &&
          record.refreshToken === markers[1] &&
          record.idToken === markers[2],
      ).toBe(true);
      expect(Object.isFrozen(record) && Object.isFrozen(record.scopes)).toBe(
        true,
      );
      return {
        commit() {
          counts.commit++;
          installed = record;
          return true;
        },
        discard() {
          counts.discard++;
        },
      };
    },
    ...overrides,
  };
  const owner = createSiwcAuthTransaction(hooks);
  return {
    owner,
    counts,
    markers,
    hooks,
    get launch() {
      if (!launch) throw new Error('EXPECTED_SYNTHETIC_LAUNCH');
      return launch;
    },
    get signal() {
      return signal;
    },
    get verifier() {
      return verifier;
    },
    get installed() {
      return installed;
    },
    setGrant(value: unknown) {
      grant = value;
    },
    callback(edit?: (url: URL) => void) {
      if (!launch) throw new Error('EXPECTED_SYNTHETIC_LAUNCH');
      const url = new URL(redirectUri);
      url.searchParams.set('state', launch.searchParams.get('state')!);
      url.searchParams.set('code', `synthetic:${randomUUID()}`);
      url.searchParams.set('client_id', clientId);
      edit?.(url);
      return owner.callback(url.href);
    },
  };
}
async function flush() {
  for (let i = 0; i < 12; i++) await Promise.resolve();
}

it.each(['throw', 'promise', 'undefined', 'truthy'])(
  'denies a %s retention result before exchange',
  async (kind) => {
    const h = harness({
      retainRegistration: (() => {
        if (kind === 'throw') throw new Error(`synthetic:${randomUUID()}`);
        return kind === 'promise'
          ? Promise.resolve(true)
          : kind === 'truthy'
            ? 1
            : undefined;
      }) as never,
    });
    try {
      const pending = h.owner.begin(input());
      h.callback();
      expect(await pending).toEqual({
        status: 'stopped',
        reason: 'registration-commit-failed',
      });
      expect(h.counts.exchange + h.counts.verify + h.counts.prepare).toBe(0);
    } finally {
      h.owner.dispose();
    }
  },
);
it('retains before exchange, identity verification and credential preparation', async () => {
  let retained = false;
  const h = harness({
    retainRegistration() {
      expect(h.counts.exchange + h.counts.verify + h.counts.prepare).toBe(0);
      retained = true;
      return true;
    },
  });
  try {
    const pending = h.owner.begin(input());
    h.callback();
    expect((await pending).status).toBe('authenticated');
    expect(retained && h.counts.exchange === 1 && h.counts.commit === 1).toBe(
      true,
    );
  } finally {
    h.owner.dispose();
  }
});
it.each(['cancel', 'invalidate', 'dispose', 'timeout'] as const)(
  'stops after %s inside retention without reaching exchange',
  async (action) => {
    vi.useFakeTimers();
    const h = harness({
      retainRegistration() {
        if (action === 'timeout') vi.advanceTimersByTime(120001);
        else h.owner[action]();
        return true;
      },
    });
    try {
      const pending = h.owner.begin(input());
      h.callback();
      expect(await pending).toEqual({
        status: 'stopped',
        reason:
          action === 'cancel'
            ? 'cancelled'
            : action === 'invalidate'
              ? 'context-changed'
              : action === 'dispose'
                ? 'disposed'
                : 'timeout',
      });
      expect(h.counts.exchange + h.counts.prepare).toBe(0);
      expect(h.owner.current()).toBeNull();
    } finally {
      h.owner.dispose();
    }
  },
);
it.each(['invalid-state', 'denied', 'cancelled'])(
  'never retains identifiers from an %s attempt',
  async (kind) => {
    let calls = 0;
    const h = harness({
      retainRegistration() {
        calls++;
        return true;
      },
    });
    try {
      const pending = h.owner.begin(input());
      if (kind === 'cancelled') h.owner.cancel();
      h.callback((url) => {
        if (kind === 'invalid-state') url.searchParams.set('state', 'bad');
        if (kind === 'denied') {
          url.searchParams.delete('code');
          url.searchParams.set('error', 'access_denied');
        }
      });
      expect((await pending).status).toBe('stopped');
      expect(calls).toBe(0);
    } finally {
      h.owner.dispose();
    }
  },
);
it('keeps the prior accepted session when replacement registration cannot be retained', async () => {
  let count = 0;
  const h = harness({
    retainRegistration() {
      return ++count === 1;
    },
  });
  try {
    const initial = h.owner.begin(input());
    h.callback();
    await initial;
    const previous = h.owner.current();
    const replacement = h.owner.begin(input());
    h.callback();
    expect(await replacement).toEqual({
      status: 'stopped',
      reason: 'registration-commit-failed',
    });
    expect(h.owner.current() === previous && h.counts.exchange === 1).toBe(
      true,
    );
  } finally {
    h.owner.dispose();
  }
});
it.each([
  null,
  {},
  { clientId, idTokenHint: null, extra: true },
  { clientId: 'dynamic_agent_client', idTokenHint: null },
  { clientId: 'other-client', idTokenHint: null },
  { clientId, idTokenHint: 'bare-token-denied' },
  { clientId, idTokenHint: { ...account, idToken: '' } },
  { clientId, idTokenHint: { ...account, idToken: 'x'.repeat(16385) } },
  { clientId, idTokenHint: { ...account, idToken: 'bad\nvalue' } },
  {
    clientId,
    idTokenHint: {
      ...account,
      idToken: 'synthetic',
      issuer: 'https://other.invalid',
    },
  },
  {
    clientId,
    idTokenHint: { ...account, idToken: 'synthetic', subject: 'other-subject' },
  },
  {
    clientId,
    idTokenHint: { ...account, idToken: 'synthetic', clientId: 'other-client' },
  },
  {
    clientId,
    idTokenHint: { ...account, idToken: 'synthetic', accessToken: 'forbidden' },
  },
])(
  'rejects invalid or incorrectly bound registration/hint contexts before launch %#',
  async (registration) => {
    const h = harness();
    try {
      expect(
        await h.owner.begin({ redirectUri, account, registration }),
      ).toEqual({ status: 'stopped', reason: 'invalid-input' });
      expect(h.counts.launch).toBe(0);
    } finally {
      h.owner.dispose();
    }
  },
);
it('rejects an identity hint for an unbound registration and any email login hint', async () => {
  const h = harness();
  try {
    for (const value of [
      {
        ...input(),
        registration: {
          clientId,
          idTokenHint: { ...account, idToken: 'synthetic' },
        },
      },
      { redirectUri, account, login_hint: 'synthetic@example.invalid' },
    ])
      expect(await h.owner.begin(value)).toEqual({
        status: 'stopped',
        reason: 'invalid-input',
      });
    expect(h.counts.launch).toBe(0);
  } finally {
    h.owner.dispose();
  }
});
it('never invokes a hint accessor and absorbs reflective hint exceptions', async () => {
  const h = harness();
  let reads = 0;
  const accessor = { ...account, idToken: 'synthetic' };
  Object.defineProperty(accessor, 'idToken', {
    get() {
      reads++;
      return 'synthetic';
    },
  });
  try {
    for (const idTokenHint of [
      accessor,
      new Proxy(accessor, {
        ownKeys() {
          throw new Error('PRIVATE');
        },
      }),
    ])
      expect(
        await h.owner.begin({
          redirectUri,
          account,
          registration: { clientId, idTokenHint },
        }),
      ).toEqual({ status: 'stopped', reason: 'invalid-input' });
    expect(reads + h.counts.launch).toBe(0);
  } finally {
    h.owner.dispose();
  }
});
it('copies bound hints before asynchronous browser work and still requires fresh matching identity', async () => {
  const h = harness({
    async verifyIdentity(_token, expected) {
      return {
        ...expected,
        subject: 'wrong-subject',
        expiresAt: Date.now() + 3600000,
      };
    },
  });
  const marker = `synthetic:${randomUUID()}`;
  const hint = { ...account, idToken: marker };
  const selected = { ...account };
  try {
    const pending = h.owner.begin({
      redirectUri,
      account: selected,
      registration: { clientId, idTokenHint: hint },
    });
    hint.idToken = 'changed';
    hint.subject = 'wrong-subject';
    selected.subject = 'wrong-subject';
    expect(h.launch.searchParams.get('id_token_hint') === marker).toBe(true);
    for (const denied of ['access_token', 'refresh_token', 'login_hint'])
      expect(h.launch.searchParams.has(denied)).toBe(false);
    h.callback();
    expect(await pending).toEqual({
      status: 'stopped',
      reason: 'verification-failed',
    });
    expect(h.counts.prepare).toBe(0);
  } finally {
    h.owner.dispose();
  }
});
it('rejects a changed callback client for a pending issued registration without retaining or exchanging', async () => {
  let retained = 0;
  const h = harness({
    retainRegistration() {
      retained++;
      return true;
    },
  });
  try {
    const pending = h.owner.begin({
      ...input(),
      registration: { clientId, idTokenHint: null },
    });
    h.callback((url) => url.searchParams.set('client_id', 'other-client'));
    expect((await pending).status).toBe('stopped');
    expect(retained + h.counts.exchange).toBe(0);
  } finally {
    h.owner.dispose();
  }
});
it('retains a client through failed exchange and restart, retrying only with fresh proof', async () => {
  const directory = fs.mkdtempSync(
    path.join(os.tmpdir(), 'paperclip-auth-registration-'),
  );
  let metadata = openSiwcRegistrationStore(directory)!;
  const hostId = metadata.read()!.hostId;
  const first = harness({
    hostId,
    retainRegistration: (record, signal) =>
      metadata.retainRegistration(record, signal),
    async exchange() {
      throw new Error('invalid_grant');
    },
  });
  let next: ReturnType<typeof harness> | null = null;
  try {
    const pending = first.owner.begin(input());
    const prior = first.launch;
    first.callback();
    expect(await pending).toEqual({
      status: 'stopped',
      reason: 'exchange-failed',
    });
    const slot = metadata.read()!.registrations[0]!;
    expect(slot.clientId === clientId).toBe(true);
    first.owner.dispose();
    metadata.dispose();
    metadata = openSiwcRegistrationStore(directory)!;
    expect(
      metadata.read()!.hostId === hostId &&
        metadata.read()!.registrations[0]?.registrationId ===
          slot.registrationId,
    ).toBe(true);
    next = harness({
      hostId,
      retainRegistration: (record, signal) =>
        metadata.retainRegistration(record, signal),
    });
    const retry = next.owner.begin({
      ...input(),
      registration: { clientId: slot.clientId, idTokenHint: null },
    });
    expect(
      next.launch.searchParams.get('client_id') === clientId &&
        !next.launch.searchParams.has('agent_name_hint'),
    ).toBe(true);
    for (const name of ['state', 'nonce', 'code_challenge'])
      expect(
        prior.searchParams.get(name) !== next.launch.searchParams.get(name),
      ).toBe(true);
    expect(
      next.owner.callback(
        new URL(
          redirectUri +
            '?state=' +
            prior.searchParams.get('state') +
            '&code=synthetic',
        ).href,
      ),
    ).toBe(false);
    expect(await retry).toEqual({
      status: 'stopped',
      reason: 'invalid-callback',
    });
    const fresh = next.owner.begin({
      ...input(),
      registration: { clientId: slot.clientId, idTokenHint: null },
    });
    next.callback((url) => url.searchParams.delete('client_id'));
    expect((await fresh).status).toBe('authenticated');
    expect(
      Object.keys(
        JSON.parse(
          fs.readFileSync(
            path.join(directory, 'registrations.v1.json'),
            'utf8',
          ),
        ) as object,
      ).sort(),
    ).toEqual(['hostId', 'registrations', 'version']);
  } finally {
    first.owner.dispose();
    next?.owner.dispose();
    metadata.dispose();
    fs.rmSync(directory, { recursive: true, force: true });
  }
});

it('requires durable registration success before exchange, preserving a fixed failure result', async () => {
  let retained = 0;
  const h = harness({
    retainRegistration(record, signal) {
      retained++;
      expect(Object.isFrozen(record) && Object.keys(record).length === 2).toBe(
        true,
      );
      expect(
        record.hostId === 'synthetic-host-1' &&
          record.clientId === clientId &&
          !signal.aborted,
      ).toBe(true);
      return false;
    },
  });
  try {
    const pending = h.owner.begin(input());
    h.callback();
    expect(await pending).toEqual({
      status: 'stopped',
      reason: 'registration-commit-failed',
    });
    expect(retained).toBe(1);
    expect(h.counts.exchange).toBe(0);
    expect(h.owner.current()).toBeNull();
  } finally {
    h.owner.dispose();
  }
});
it('retries an issued but unbound registration with fresh proof and no bootstrap/name', async () => {
  const h = harness();
  try {
    const pending = h.owner.begin({
      ...input(),
      registration: { clientId, idTokenHint: null },
    });
    expect(h.counts.launch).toBe(1);
    expect(h.launch.searchParams.get('client_id')).toBe(clientId);
    expect(h.launch.searchParams.has('agent_name_hint')).toBe(false);
    expect(h.launch.searchParams.has('id_token_hint')).toBe(false);
    expect(h.callback((url) => url.searchParams.delete('client_id'))).toBe(
      true,
    );
    expect((await pending).status).toBe('authenticated');
  } finally {
    h.owner.dispose();
  }
});
it('uses a main-only bound retained ID hint only at the fixed authorization endpoint', async () => {
  const h = harness();
  const hint = `synthetic:${randomUUID()}:&?`;
  try {
    const pending = h.owner.begin({
      redirectUri,
      account,
      registration: { clientId, idTokenHint: { ...account, idToken: hint } },
    });
    expect(h.counts.launch).toBe(1);
    expect(h.launch.origin + h.launch.pathname).toBe(
      'https://auth.openai.com/api/accounts/authorize',
    );
    expect(h.launch.searchParams.get('id_token_hint') === hint).toBe(true);
    h.callback();
    expect((await pending).status).toBe('authenticated');
  } finally {
    h.owner.dispose();
  }
});
it('rejects a missing retention capability at construction instead of supplying a permissive default', () => {
  expect(() => harness({ retainRegistration: undefined as never })).toThrow(
    'Invalid sign-in configuration',
  );
});

it('does no work while idle and rejects calls after terminal disposal', async () => {
  vi.useFakeTimers();
  const h = harness();
  expect(h.owner.current()).toBeNull();
  expect(h.owner.callback(undefined)).toBe(false);
  expect(h.owner.cancel()).toBe(false);
  expect(vi.getTimerCount()).toBe(0);
  h.owner.dispose();
  h.owner.dispose();
  h.owner.invalidate();
  expect(await h.owner.begin(input())).toEqual({
    status: 'stopped',
    reason: 'disposed',
  });
  expect(h.counts).toEqual({
    launch: 0,
    exchange: 0,
    verify: 0,
    prepare: 0,
    commit: 0,
    discard: 0,
  });
});

it('binds initial registration, PKCE, validated identity and returned scopes before atomic installation', async () => {
  const h = harness();
  const result = h.owner.begin(input());
  const params = h.launch.searchParams;
  expect(h.launch.origin + h.launch.pathname).toBe(
    'https://auth.openai.com/api/accounts/authorize',
  );
  expect(params.get('client_id')).toBe('dynamic_agent_client');
  expect(params.get('agent_name_hint')).toBe('Paperclip Companion');
  expect(params.get('ext_agent_host_id')).toBe('synthetic-host-1');
  expect(params.get('redirect_uri')).toBe(redirectUri);
  expect(params.get('code_challenge_method')).toBe('S256');
  expect(params.get('resource')).toBe('https://api.openai.com/v1');
  expect(params.get('response_type')).toBe('code');
  expect(params.get('scope')).toBe(
    'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
  );
  expect(h.owner.current()).toBeNull();
  expect(h.counts.exchange).toBe(0);
  expect(h.callback()).toBe(true);
  expect(await result).toEqual({
    status: 'authenticated',
    inferenceAllowed: true,
  });
  expect(h.counts).toEqual({
    launch: 1,
    exchange: 1,
    verify: 1,
    prepare: 1,
    commit: 1,
    discard: 1,
  });
  expect(/^[A-Za-z0-9_-]{43}$/.test(h.verifier)).toBe(true);
  expect(
    createHash('sha256').update(h.verifier).digest('base64url') ===
      params.get('code_challenge'),
  ).toBe(true);
  const current = h.owner.current();
  expect(current?.subject).toBe(account.subject);
  expect(current?.clientId).toBe(clientId);
  expect(h.owner.isCurrent(current)).toBe(true);
  expect(h.owner.isCurrent({ ...current })).toBe(false);
  expect(current?.signal.aborted).toBe(false);
  expect(Object.isFrozen(current)).toBe(true);
  expect(Object.keys(current!).sort()).toEqual([
    'authorizationId',
    'clientId',
    'inferenceAllowed',
    'issuer',
    'signal',
    'subject',
  ]);
  expect(h.installed?.hostId).toBe('synthetic-host-1');
  h.owner.dispose();
});

it('generates fresh independent state, nonce and PKCE per attempt and rejects overlapping launch', async () => {
  const h = harness();
  const first = h.owner.begin(input());
  const original = h.launch;
  expect(await h.owner.begin(input())).toEqual({
    status: 'stopped',
    reason: 'unavailable',
  });
  expect(h.counts.launch).toBe(1);
  expect(h.owner.cancel()).toBe(true);
  expect(await first).toEqual({ status: 'stopped', reason: 'cancelled' });
  const second = h.owner.begin(input());
  for (const key of ['state', 'nonce', 'code_challenge']) {
    expect(/^[A-Za-z0-9_-]{43}$/.test(h.launch.searchParams.get(key)!)).toBe(
      true,
    );
    expect(
      h.launch.searchParams.get(key) === original.searchParams.get(key),
    ).toBe(false);
  }
  expect(
    new Set(
      ['state', 'nonce', 'code_challenge'].map((k) =>
        h.launch.searchParams.get(k),
      ),
    ).size,
  ).toBe(3);
  h.callback();
  expect((await second).status).toBe('authenticated');
  h.owner.dispose();
});

it.each([
  (u: URL) => u.searchParams.set('state', 'wrong'),
  (u: URL) => u.searchParams.delete('state'),
  (u: URL) => u.searchParams.append('state', 'duplicate'),
  (u: URL) => u.searchParams.append('code', 'duplicate'),
  (u: URL) => u.searchParams.append('client_id', clientId),
  (u: URL) => u.searchParams.delete('client_id'),
  (u: URL) => u.searchParams.set('client_id', 'dynamic_agent_client'),
  (u: URL) => u.searchParams.set('code', ''),
  (u: URL) => u.searchParams.set('code', 'x'.repeat(4097)),
  (u: URL) => u.searchParams.set('code', 'private\nvalue'),
  (u: URL) => {
    u.hostname = 'localhost';
  },
  (u: URL) => {
    u.port = '54322';
  },
  (u: URL) => {
    u.pathname = '/callback';
  },
  (u: URL) => {
    u.protocol = 'https:';
  },
  (u: URL) => {
    u.hash = 'fragment';
  },
  (u: URL) => u.searchParams.set('extra', 'untrusted'),
])('rejects an invalid callback before code exchange %#', async (edit) => {
  const h = harness();
  const result = h.owner.begin(input());
  expect(h.callback(edit)).toBe(false);
  expect(await result).toEqual({
    status: 'stopped',
    reason: 'invalid-callback',
  });
  expect(h.counts.exchange + h.counts.verify + h.counts.prepare).toBe(0);
  expect(h.signal?.aborted).toBe(true);
  h.owner.dispose();
});

it('reauthorizes only the selected issued client and identity, allowing its omitted callback ID', async () => {
  const h = harness();
  const selected = { ...account };
  const result = h.owner.begin({ redirectUri, account: selected });
  selected.subject = 'caller-mutated';
  expect(h.launch.searchParams.get('client_id')).toBe(clientId);
  expect(h.launch.searchParams.has('agent_name_hint')).toBe(false);
  expect(h.callback((u) => u.searchParams.delete('client_id'))).toBe(true);
  expect((await result).status).toBe('authenticated');
  h.owner.dispose();
});

it.each([
  'openid',
  'openid resource.invoke',
  'openid chatgpt.tokens.use.direct',
  '',
])(
  'keeps verified identity distinct from missing inference grants %#',
  async (scope) => {
    const h = harness();
    h.setGrant({
      access_token: h.markers[0],
      refresh_token: h.markers[1],
      id_token: h.markers[2],
      token_type: 'Bearer',
      expires_in: 3600,
      scope,
    });
    const result = h.owner.begin(input());
    h.callback((u) =>
      u.searchParams.set('scope', 'chatgpt.tokens.use.direct resource.invoke'),
    );
    expect(await result).toEqual({
      status: 'authenticated',
      inferenceAllowed: false,
    });
    expect(h.owner.current()?.inferenceAllowed).toBe(false);
    expect(h.counts.commit).toBe(1);
    h.owner.dispose();
  },
);

it('cancels promptly during asynchronous preparation and discards a late staged candidate without installing', async () => {
  const staged = deferred<SiwcPreparedCredentials>();
  let preparations = 0;
  let commits = 0;
  let discards = 0;
  const h = harness({
    async prepareCredentials() {
      preparations++;
      return staged.promise;
    },
  });
  const result = h.owner.begin(input());
  h.callback();
  await flush();
  expect(preparations).toBe(1);
  expect(h.owner.cancel()).toBe(true);
  expect(await result).toEqual({ status: 'stopped', reason: 'cancelled' });
  expect(h.signal?.aborted).toBe(true);
  staged.resolve({
    commit() {
      commits++;
      return true;
    },
    discard() {
      discards++;
    },
  });
  await flush();
  expect(commits).toBe(0);
  expect(discards).toBe(1);
  expect(h.owner.current()).toBeNull();
});

it('preserves a previously accepted authorization on failed replacement', async () => {
  const h = harness();
  const first = h.owner.begin(input());
  h.callback();
  await first;
  const previous = h.owner.current();
  h.setGrant({});
  const second = h.owner.begin({ redirectUri, account });
  h.callback();
  expect(await second).toEqual({ status: 'stopped', reason: 'invalid-grant' });
  expect(h.owner.current()).toBe(previous);
  expect(previous?.signal.aborted).toBe(false);
  expect(h.counts.commit).toBe(1);
  h.owner.dispose();
});

function validGrant(
  h: ReturnType<typeof harness>,
  change: Record<string, unknown> = {},
) {
  return {
    access_token: h.markers[0],
    refresh_token: h.markers[1],
    id_token: h.markers[2],
    token_type: 'Bearer',
    expires_in: 3600,
    scope: 'openid resource.invoke chatgpt.tokens.use.direct',
    ...change,
  };
}
function verified(
  expected: SiwcIdentityExpectation,
  change: Record<string, unknown> = {},
) {
  return {
    issuer,
    subject: account.subject,
    audience: expected.audience,
    nonce: expected.nonce,
    expiresAt: Date.now() + 3600000,
    ...change,
  };
}
function callbackFrom(authorization: URL, change?: (url: URL) => void) {
  const url = new URL(redirectUri);
  url.searchParams.set('code', `synthetic:${randomUUID()}`);
  url.searchParams.set('state', authorization.searchParams.get('state')!);
  url.searchParams.set('client_id', clientId);
  change?.(url);
  return url.href;
}

it.each([
  undefined,
  null,
  true,
  1,
  'input',
  [],
  {},
  new Date(),
  { redirectUri },
  { account: null },
  { ...input(), extra: true },
  { ...input(), [Symbol('extra')]: true },
  Object.create(input()),
  { ...input(), redirectUri: 1 },
  { ...input(), account: {} },
  { ...input(), account: { ...account, clientId: 'dynamic_agent_client' } },
  { ...input(), account: { ...account, clientId: 'x'.repeat(129) } },
  { ...input(), account: { ...account, issuer: 'https://untrusted.invalid' } },
  { ...input(), account: { ...account, subject: 'x'.repeat(256) } },
  { ...input(), account: { ...account, subject: 'private\nvalue' } },
  { ...input(), account: { ...account, extra: true } },
])(
  'rejects invalid local context without launching or touching credentials %#',
  async (value) => {
    const h = harness();
    expect(await h.owner.begin(value)).toEqual({
      status: 'stopped',
      reason: 'invalid-input',
    });
    expect(h.counts.launch + h.counts.exchange + h.counts.prepare).toBe(0);
    h.owner.dispose();
  },
);

it.each([
  'http://localhost:54321/auth/callback',
  'https://127.0.0.1:54321/auth/callback',
  'http://127.0.0.1:54321/callback',
  'http://127.0.0.1:0/auth/callback',
  'http://127.0.0.1:65536/auth/callback',
  'http://127.0.0.1:054321/auth/callback',
  'http://127.0.0.1/auth/callback',
  'http://user@127.0.0.1:54321/auth/callback',
  `${redirectUri}?query`,
  `${redirectUri}#fragment`,
  `${redirectUri}/`,
  'http://127.1:54321/auth/callback',
])('rejects an unprepared or noncanonical redirect %#', async (value) => {
  const h = harness();
  expect(await h.owner.begin({ ...input(), redirectUri: value })).toEqual({
    status: 'stopped',
    reason: 'invalid-input',
  });
  expect(h.counts.launch).toBe(0);
});

it.each([0, -1, 300001, 1.5, NaN, Infinity])(
  'bounds attempt deadlines at construction %#',
  (timeoutMs) => {
    expect(() => harness({ timeoutMs })).toThrow(
      'Invalid sign-in configuration',
    );
  },
);
it.each(['', ' ', 'private\nvalue', 'x'.repeat(129)])(
  'bounds the main-owned installation identifier %#',
  (hostId) => {
    expect(() => harness({ hostId })).toThrow('Invalid sign-in configuration');
  },
);

it('copies null-prototype contexts and accepts only available-port syntax', async () => {
  const h = harness();
  for (const port of [1, 65535]) {
    const result = h.owner.begin(
      Object.assign(Object.create(null), input(), {
        redirectUri: `http://127.0.0.1:${port}/auth/callback`,
      }),
    );
    expect(h.counts.launch).toBeGreaterThan(0);
    h.owner.cancel();
    await result;
  }
  const result = h.owner.begin(
    Object.assign(Object.create(null), {
      redirectUri,
      account: Object.assign(Object.create(null), account),
    }),
  );
  h.callback();
  expect((await result).status).toBe('authenticated');
  h.owner.dispose();
});

it('rejects accessors and reflective exceptions without reading or leaking private details', async () => {
  const privateDetail = `synthetic:${randomUUID()}`;
  let reads = 0;
  const getter = Object.defineProperty(input(), 'account', {
    get() {
      reads++;
      throw new Error(privateDetail);
    },
  });
  const h = harness();
  for (const value of [
    getter,
    ...['ownKeys', 'getPrototypeOf', 'getOwnPropertyDescriptor'].map(
      (trap) =>
        new Proxy(input(), {
          [trap]() {
            throw new Error(privateDetail);
          },
        }),
    ),
  ])
    expect(await h.owner.begin(value)).toEqual({
      status: 'stopped',
      reason: 'invalid-input',
    });
  expect(reads).toBe(0);
  expect(h.counts.launch).toBe(0);
});

it.each(['cancel', 'invalidate', 'dispose'] as const)(
  'honors %s during reflective context inspection',
  async (operation) => {
    const h = harness();
    let nested: Promise<unknown> | undefined;
    const value = new Proxy(input(), {
      ownKeys(target) {
        nested = h.owner.begin(input());
        h.owner[operation]();
        return Reflect.ownKeys(target);
      },
    });
    expect(await h.owner.begin(value)).toEqual({
      status: 'stopped',
      reason:
        operation === 'invalidate'
          ? 'context-changed'
          : operation === 'dispose'
            ? 'disposed'
            : 'cancelled',
    });
    expect(await nested).toEqual({ status: 'stopped', reason: 'unavailable' });
    expect(h.counts.launch).toBe(0);
    h.owner.dispose();
  },
);

it.each([undefined, null, {}, '', 'not a URL', 'x'.repeat(16385)])(
  'consumes invalid raw callbacks without exchanging %#',
  async (value) => {
    const h = harness();
    const result = h.owner.begin(input());
    expect(h.owner.callback(value)).toBe(false);
    expect(await result).toEqual({
      status: 'stopped',
      reason: 'invalid-callback',
    });
    expect(h.counts.exchange).toBe(0);
  },
);

it.each([
  (value: string) => `${value}#`,
  (value: string) => `${value}&scope=%`,
  (value: string) => `${value}&scope=x\ny`,
  (value: string) => `${value}&scope=${'x'.repeat(4097)}`,
  (value: string) => value.replace('127.0.0.1', '2130706433'),
  (value: string) => value.replace('127.0.0.1', '127.1'),
  (value: string) => value.replace('127.0.0.1', 'untrusted.invalid@127.0.0.1'),
])(
  'rejects normalized, malformed and oversized callback representations %#',
  async (edit) => {
    const h = harness();
    const result = h.owner.begin(input());
    expect(h.owner.callback(edit(callbackFrom(h.launch)))).toBe(false);
    expect(await result).toEqual({
      status: 'stopped',
      reason: 'invalid-callback',
    });
    expect(h.counts.exchange).toBe(0);
  },
);

it.each([
  ['access_denied', 'authorization-denied'],
  ['server_error', 'authorization-failed'],
])(
  'consumes validated OAuth errors with a fixed local result %#',
  async (error, reason) => {
    const h = harness();
    const result = h.owner.begin(input());
    h.callback((u) => {
      u.searchParams.delete('code');
      u.searchParams.set('error', error!);
      u.searchParams.set('error_description', `synthetic:${randomUUID()}`);
      u.searchParams.set('error_uri', 'https://untrusted.invalid/private');
    });
    expect(await result).toEqual({ status: 'stopped', reason });
    expect(h.counts.exchange + h.counts.prepare).toBe(0);
  },
);

it.each([
  (u: URL) => u.searchParams.set('error', 'access_denied'),
  (u: URL) => {
    u.searchParams.delete('code');
    u.searchParams.set('error', '');
  },
  (u: URL) => {
    u.searchParams.delete('code');
    u.searchParams.set('error', 'access_denied');
    u.searchParams.set('state', 'wrong');
  },
  (u: URL) => u.searchParams.set('error_description', 'unsolicited'),
  (u: URL) => u.searchParams.set('error_uri', 'https://untrusted.invalid'),
])('rejects ambiguous or unbound OAuth error callbacks %#', async (edit) => {
  const h = harness();
  const result = h.owner.begin(input());
  h.callback(edit);
  expect(await result).toEqual({
    status: 'stopped',
    reason: 'invalid-callback',
  });
  expect(h.counts.exchange).toBe(0);
});

it('consumes a callback once, rejects replay and does not confuse another generation', async () => {
  const h = harness();
  const first = h.owner.begin(input());
  const raw = callbackFrom(h.launch);
  expect(h.owner.callback(raw)).toBe(true);
  expect(h.owner.callback(raw)).toBe(false);
  expect((await first).status).toBe('authenticated');
  expect(h.owner.callback(raw)).toBe(false);
  expect(h.counts.exchange).toBe(1);
  const second = h.owner.begin(input());
  expect(h.owner.callback(raw)).toBe(false);
  expect(await second).toEqual({
    status: 'stopped',
    reason: 'invalid-callback',
  });
  expect(h.counts.exchange).toBe(1);
  h.owner.dispose();
});

it('rejects a returning client ID replacement before exchange', async () => {
  const h = harness();
  const result = h.owner.begin({ redirectUri, account });
  h.callback((u) => u.searchParams.set('client_id', 'synthetic-other-client'));
  expect(await result).toEqual({
    status: 'stopped',
    reason: 'invalid-callback',
  });
  expect(h.counts.exchange).toBe(0);
});

it.each([
  { access_token: '' },
  { access_token: 1 },
  { access_token: 'x'.repeat(16385) },
  { refresh_token: 1 },
  { id_token: 'private\nvalue' },
  { token_type: 'Other' },
  { expires_in: '3600' },
  { expires_in: 0 },
  { expires_in: -1 },
  { expires_in: 86401 },
  { expires_in: 1.5 },
  { expires_in: Infinity },
  { expires_in: NaN },
  { scope: null },
  { scope: 'x'.repeat(4097) },
  { scope: 'openid\nchatgpt.tokens.use.direct' },
  { scope: 'openid  chatgpt.tokens.use.direct' },
  { scope: 'openid "private"' },
])(
  'rejects malformed token grants before verification or installation %#',
  async (change) => {
    const h = harness();
    h.setGrant(validGrant(h, change));
    const result = h.owner.begin(input());
    h.callback();
    expect(await result).toEqual({
      status: 'stopped',
      reason: 'invalid-grant',
    });
    expect(h.counts.verify + h.counts.prepare + h.counts.commit).toBe(0);
  },
);

it('rejects inherited/extra/accessor grant fields and accepts immutable normalized data', async () => {
  const h = harness();
  let reads = 0;
  for (const make of [
    () => Object.create(validGrant(h)),
    () => ({ ...validGrant(h), extra: true }),
    () =>
      Object.defineProperty(validGrant(h), 'id_token', {
        get() {
          reads++;
          return h.markers[2];
        },
      }),
  ]) {
    h.setGrant(make());
    const result = h.owner.begin(input());
    h.callback();
    expect(await result).toEqual({
      status: 'stopped',
      reason: 'invalid-grant',
    });
  }
  expect(reads).toBe(0);
  h.setGrant(
    Object.freeze(
      Object.assign(
        Object.create(null),
        validGrant(h, {
          scope:
            'openid resource.invoke chatgpt.tokens.use.direct resource.invoke',
        }),
      ),
    ),
  );
  const result = h.owner.begin(input());
  h.callback();
  expect(await result).toEqual({
    status: 'authenticated',
    inferenceAllowed: true,
  });
  expect(h.installed?.scopes.length).toBe(3);
  h.owner.dispose();
});

it.each([
  { issuer: 'https://untrusted.invalid' },
  { subject: '' },
  { subject: 1 },
  { subject: 'x'.repeat(256) },
  { audience: 'synthetic-other-client' },
  { nonce: 'wrong' },
  { nonce: 'A'.repeat(43) },
  { expiresAt: 'later' },
  { expiresAt: 0 },
  { expiresAt: Infinity },
  { extra: true },
])(
  'requires the verifier to supply the complete bound validated identity %#',
  async (change) => {
    const h = harness({
      async verifyIdentity(_token, expected) {
        return verified(expected, change);
      },
    });
    const result = h.owner.begin(input());
    h.callback();
    expect(await result).toEqual({
      status: 'stopped',
      reason: 'verification-failed',
    });
    expect(h.counts.prepare + h.counts.commit).toBe(0);
  },
);

it('rejects a different verified subject for a selected account', async () => {
  const h = harness({
    async verifyIdentity(_token, expected) {
      return verified(expected, { subject: 'synthetic-other-subject' });
    },
  });
  const result = h.owner.begin({ redirectUri, account });
  h.callback();
  expect(await result).toEqual({
    status: 'stopped',
    reason: 'verification-failed',
  });
  expect(h.counts.prepare).toBe(0);
});

it.each([
  'browser',
  'exchange',
  'verification',
  'preparation',
  'commit',
] as const)(
  'sanitizes a private exception in %s without installing or replacing an account',
  async (phase) => {
    const detail = `synthetic:${randomUUID()}`;
    const fail = () => {
      throw new Error(detail);
    };
    const h = harness(
      phase === 'browser'
        ? {
            async openAuthorization() {
              fail();
            },
          }
        : phase === 'exchange'
          ? {
              async exchange() {
                fail();
              },
            }
          : phase === 'verification'
            ? {
                async verifyIdentity() {
                  fail();
                },
              }
            : phase === 'preparation'
              ? {
                  async prepareCredentials() {
                    fail();
                    throw new Error('UNREACHABLE');
                  },
                }
              : {
                  async prepareCredentials() {
                    return {
                      commit() {
                        fail();
                        return false;
                      },
                      discard() {},
                    };
                  },
                },
    );
    const result = h.owner.begin(input());
    if (phase !== 'browser') h.callback();
    const outcome = await result;
    expect(outcome).toEqual({
      status: 'stopped',
      reason:
        phase === 'browser'
          ? 'browser-failed'
          : phase === 'exchange'
            ? 'exchange-failed'
            : phase === 'verification'
              ? 'verification-failed'
              : 'protected-commit-failed',
    });
    expect(JSON.stringify(outcome).includes(detail)).toBe(false);
    expect(h.owner.current()).toBeNull();
    expect(h.counts.commit).toBe(0);
  },
);

it('rejects false atomic commit without losing an already accepted account', async () => {
  let failCommit = false;
  let installs = 0;
  let discards = 0;
  const h = harness({
    async prepareCredentials() {
      return {
        commit() {
          if (failCommit) return false;
          installs++;
          return true;
        },
        discard() {
          discards++;
        },
      };
    },
  });
  const first = h.owner.begin(input());
  h.callback();
  await first;
  const old = h.owner.current();
  failCommit = true;
  const second = h.owner.begin({ redirectUri, account });
  h.callback();
  expect(await second).toEqual({
    status: 'stopped',
    reason: 'protected-commit-failed',
  });
  expect(h.owner.current()).toBe(old);
  expect(old?.signal.aborted).toBe(false);
  expect(installs).toBe(1);
  expect(discards).toBe(2);
  h.owner.dispose();
});

it('keeps a successful commit despite private cleanup failure', async () => {
  const h = harness({
    async prepareCredentials() {
      return {
        commit: () => true,
        discard() {
          throw new Error(`synthetic:${randomUUID()}`);
        },
      };
    },
  });
  const result = h.owner.begin(input());
  h.callback();
  expect(await result).toEqual({
    status: 'authenticated',
    inferenceAllowed: true,
  });
  expect(h.owner.isCurrent(h.owner.current())).toBe(true);
  h.owner.dispose();
});

it.each(['browser', 'exchange', 'verification', 'preparation'] as const)(
  'times out bounded public work despite an uncooperative %s hook',
  async (phase) => {
    vi.useFakeTimers();
    const pending = deferred<never>();
    const h = harness({
      timeoutMs: 100,
      ...(phase === 'browser'
        ? { openAuthorization: () => pending.promise }
        : phase === 'exchange'
          ? { exchange: () => pending.promise }
          : phase === 'verification'
            ? { verifyIdentity: () => pending.promise }
            : { prepareCredentials: () => pending.promise }),
    });
    const result = h.owner.begin(input());
    if (phase !== 'browser') h.callback();
    await flush();
    await vi.advanceTimersByTimeAsync(100);
    expect(await result).toEqual({ status: 'stopped', reason: 'timeout' });
    expect(h.owner.current()).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
    pending.reject(new Error(`synthetic:${randomUUID()}`));
    await flush();
    expect(h.owner.current()).toBeNull();
    expect(h.counts.commit).toBe(0);
  },
);

it('checks the monotonic deadline at callback entry before a delayed timer fires', async () => {
  const h = harness({ timeoutMs: 1 });
  const result = h.owner.begin(input());
  const now = vi
    .spyOn(performance, 'now')
    .mockReturnValue(Number.MAX_SAFE_INTEGER);
  expect(h.callback()).toBe(false);
  now.mockRestore();
  expect(await result).toEqual({ status: 'stopped', reason: 'timeout' });
  expect(h.counts.exchange).toBe(0);
});

it.each(['cancel', 'invalidate', 'dispose'] as const)(
  'rejects late exchange and prevents resurrection after %s',
  async (operation) => {
    const exchanged = deferred<unknown>();
    const h = harness({ exchange: () => exchanged.promise });
    const result = h.owner.begin(input());
    h.callback();
    await flush();
    h.owner[operation]();
    expect(await result).toEqual({
      status: 'stopped',
      reason:
        operation === 'cancel'
          ? 'cancelled'
          : operation === 'invalidate'
            ? 'context-changed'
            : 'disposed',
    });
    exchanged.resolve(validGrant(h));
    await flush();
    expect(h.counts.verify + h.counts.prepare).toBe(0);
    expect(h.owner.current()).toBeNull();
  },
);

it('keeps a late old generation from overwriting a newer successful authorization', async () => {
  const oldStage = deferred<SiwcPreparedCredentials>();
  let preparations = 0;
  let staleCommits = 0;
  let staleDiscards = 0;
  const h = harness({
    async prepareCredentials() {
      if (++preparations === 1) return oldStage.promise;
      return { commit: () => true, discard() {} };
    },
  });
  const first = h.owner.begin(input());
  h.callback();
  await flush();
  h.owner.invalidate();
  await first;
  const second = h.owner.begin(input());
  h.callback();
  await second;
  const current = h.owner.current();
  oldStage.resolve({
    commit() {
      staleCommits++;
      return true;
    },
    discard() {
      staleDiscards++;
    },
  });
  await flush();
  expect(staleCommits).toBe(0);
  expect(staleDiscards).toBe(1);
  expect(h.owner.current()).toBe(current);
  expect(h.owner.isCurrent(current)).toBe(true);
  h.owner.dispose();
});

it('renews authorization incarnation even when the same account reconnects', async () => {
  const h = harness();
  const first = h.owner.begin(input());
  h.callback();
  await first;
  const previous = h.owner.current();
  const second = h.owner.begin({ redirectUri, account });
  expect(h.owner.current()).toBe(previous);
  h.callback();
  await second;
  const next = h.owner.current();
  expect(next === previous).toBe(false);
  expect(next?.authorizationId === previous?.authorizationId).toBe(false);
  expect(previous?.signal.aborted).toBe(true);
  expect(h.owner.isCurrent(previous)).toBe(false);
  h.owner.invalidate();
  expect(next?.signal.aborted).toBe(true);
  expect(h.owner.current()).toBeNull();
  const restarted = harness();
  expect(restarted.owner.isCurrent(next)).toBe(false);
  restarted.owner.dispose();
});

it('reserves ownership before a browser hook can reenter and buffers its immediate callback until launch succeeds', async () => {
  let launches = 0;
  let exchanges = 0;
  const opened = deferred<void>();
  let nested: Promise<unknown> | undefined;
  const h = harness({
    async openAuthorization(url) {
      launches++;
      nested = h.owner.begin(input());
      expect(h.owner.callback(callbackFrom(new URL(url)))).toBe(true);
      return opened.promise;
    },
    async exchange() {
      exchanges++;
      return validGrant(h);
    },
    async verifyIdentity(_token, expected) {
      return verified(expected);
    },
  });
  const result = h.owner.begin(input());
  await flush();
  expect(await nested).toEqual({ status: 'stopped', reason: 'unavailable' });
  expect(launches).toBe(1);
  expect(exchanges).toBe(0);
  opened.resolve();
  expect((await result).status).toBe('authenticated');
  expect(exchanges).toBe(1);
  h.owner.dispose();
});

it('rejects callback work if browser launch fails after a synchronous callback', async () => {
  const h = harness({
    async openAuthorization(url) {
      h.owner.callback(callbackFrom(new URL(url)));
      throw new Error(`synthetic:${randomUUID()}`);
    },
  });
  expect(await h.owner.begin(input())).toEqual({
    status: 'stopped',
    reason: 'browser-failed',
  });
  expect(h.counts.exchange).toBe(0);
});

it.each(['cancel', 'invalidate', 'dispose'] as const)(
  'prevents callback reentry during %s abort notification',
  async (operation) => {
    let nested: Promise<unknown> | undefined;
    const h = harness();
    const result = h.owner.begin(input());
    h.signal!.addEventListener(
      'abort',
      () => {
        nested = h.owner.begin(input());
        expect(h.owner.current()).toBeNull();
        expect(h.owner.callback(undefined)).toBe(false);
        h.owner.invalidate();
      },
      { once: true },
    );
    h.owner[operation]();
    await result;
    expect(await nested).toEqual({
      status: 'stopped',
      reason: operation === 'dispose' ? 'disposed' : 'unavailable',
    });
    expect(h.counts.launch).toBe(1);
    h.owner.dispose();
  },
);

it('linearizes synchronous commit before later cancellation and still permits terminal disposal', async () => {
  let cancelled: boolean | undefined;
  let installed = false;
  const h = harness({
    async prepareCredentials() {
      return {
        commit() {
          cancelled = h.owner.cancel();
          installed = true;
          return true;
        },
        discard() {},
      };
    },
  });
  const result = h.owner.begin(input());
  h.callback();
  expect((await result).status).toBe('authenticated');
  expect(cancelled).toBe(false);
  expect(installed).toBe(true);
  const grant = h.owner.current();
  h.owner.dispose();
  expect(grant?.signal.aborted).toBe(true);
  expect(h.owner.current()).toBeNull();
});

it('does not activate a committed candidate when synchronous invalidation follows the commit claim', async () => {
  let committed = false;
  const h = harness({
    async prepareCredentials() {
      return {
        commit() {
          committed = true;
          h.owner.invalidate();
          return true;
        },
        discard() {},
      };
    },
  });
  const result = h.owner.begin(input());
  h.callback();
  expect(await result).toEqual({
    status: 'stopped',
    reason: 'context-changed',
  });
  expect(committed).toBe(true);
  expect(h.owner.current()).toBeNull();
  h.owner.dispose();
});

it('makes disposal from the prior authorization abort listener terminal', async () => {
  const h = harness();
  const first = h.owner.begin(input());
  h.callback();
  await first;
  const previous = h.owner.current();
  previous!.signal.addEventListener('abort', h.owner.dispose, { once: true });
  const second = h.owner.begin({ redirectUri, account });
  h.callback();
  await second;
  expect(h.owner.current()).toBeNull();
  expect(await h.owner.begin(input())).toEqual({
    status: 'stopped',
    reason: 'disposed',
  });
});

it('retains verified identity when a normalized identity-only grant has no access or refresh token', async () => {
  const h = harness({
    async prepareCredentials(record) {
      expect(
        record.accessToken === null &&
          record.refreshToken === null &&
          record.expiresAt === null,
      ).toBe(true);
      return { commit: () => true, discard() {} };
    },
  });
  h.setGrant(
    validGrant(h, {
      access_token: null,
      refresh_token: null,
      token_type: null,
      expires_in: null,
      scope: 'openid profile email',
    }),
  );
  const result = h.owner.begin(input());
  h.callback();
  expect(await result).toEqual({
    status: 'authenticated',
    inferenceAllowed: false,
  });
  expect(h.owner.current()?.subject).toBe(account.subject);
  h.owner.dispose();
});

it('permits a nonrefreshable access grant while refusing a missing token for granted inference', async () => {
  const h = harness({
    async prepareCredentials(record) {
      expect(record.refreshToken === null && record.accessToken !== null).toBe(
        true,
      );
      return { commit: () => true, discard() {} };
    },
  });
  h.setGrant(validGrant(h, { refresh_token: null }));
  const first = h.owner.begin(input());
  h.callback();
  expect(await first).toEqual({
    status: 'authenticated',
    inferenceAllowed: true,
  });
  const old = h.owner.current();
  h.setGrant(
    validGrant(h, {
      access_token: null,
      refresh_token: null,
      expires_in: null,
    }),
  );
  const second = h.owner.begin(input());
  h.callback();
  expect(await second).toEqual({ status: 'stopped', reason: 'invalid-grant' });
  expect(h.owner.current()).toBe(old);
  h.owner.dispose();
});

it.each([
  {},
  { commit: true, discard() {} },
  { commit: () => true, discard: null },
])('rejects a malformed staged-commit capability %#', async (candidate) => {
  const h = harness({
    async prepareCredentials() {
      return candidate as unknown as SiwcPreparedCredentials;
    },
  });
  const result = h.owner.begin(input());
  h.callback();
  expect(await result).toEqual({
    status: 'stopped',
    reason: 'protected-commit-failed',
  });
  expect(h.owner.current()).toBeNull();
});

it.each(['grant', 'identity', 'stage'] as const)(
  'honors cancellation during %s record inspection',
  async (phase) => {
    let discarded = 0;
    const h = harness({
      async exchange() {
        const grant = validGrant(h);
        return phase !== 'grant'
          ? grant
          : new Proxy(grant, {
              ownKeys(target) {
                h.owner.cancel();
                return Reflect.ownKeys(target);
              },
            });
      },
      async verifyIdentity(_token, expected) {
        const identity = verified(expected);
        return phase !== 'identity'
          ? identity
          : new Proxy(identity, {
              ownKeys(target) {
                h.owner.cancel();
                return Reflect.ownKeys(target);
              },
            });
      },
      async prepareCredentials() {
        const staged = {
          commit() {
            throw new Error('STALE_COMMIT_FORBIDDEN');
          },
          discard() {
            discarded++;
          },
        };
        return new Proxy(staged, {
          ownKeys(target) {
            h.owner.cancel();
            return Reflect.ownKeys(target);
          },
        });
      },
    });
    const result = h.owner.begin(input());
    h.callback();
    expect(await result).toEqual({ status: 'stopped', reason: 'cancelled' });
    expect(h.owner.current()).toBeNull();
    expect(discarded).toBe(phase === 'stage' ? 1 : 0);
  },
);

it.each(['verification', 'preparation'] as const)(
  'prevents an access grant that expires during %s from being installed',
  async (phase) => {
    vi.useFakeTimers();
    const wait = deferred<void>();
    let commits = 0;
    let discards = 0;
    const h = harness({
      async verifyIdentity(_token, expected) {
        if (phase === 'verification') await wait.promise;
        return verified(expected);
      },
      async prepareCredentials() {
        if (phase === 'preparation') await wait.promise;
        return {
          commit() {
            commits++;
            return true;
          },
          discard() {
            discards++;
          },
        };
      },
    });
    h.setGrant(validGrant(h, { expires_in: 1 }));
    const result = h.owner.begin(input());
    h.callback();
    await flush();
    await vi.advanceTimersByTimeAsync(1000);
    wait.resolve();
    expect(await result).toEqual({
      status: 'stopped',
      reason:
        phase === 'verification' ? 'invalid-grant' : 'protected-commit-failed',
    });
    expect(commits).toBe(0);
    expect(discards).toBe(phase === 'preparation' ? 1 : 0);
  },
);

it('drops a late verified identity after account invalidation', async () => {
  const identity = deferred<unknown>();
  let expected: SiwcIdentityExpectation | undefined;
  const h = harness({
    async verifyIdentity(_token, constraints) {
      expected = constraints;
      return identity.promise;
    },
  });
  const result = h.owner.begin(input());
  h.callback();
  await flush();
  h.owner.invalidate();
  expect(await result).toEqual({
    status: 'stopped',
    reason: 'context-changed',
  });
  identity.resolve(verified(expected!));
  await flush();
  expect(h.counts.prepare).toBe(0);
  expect(h.owner.current()).toBeNull();
});

it('does not inspect callback values before the input context is ready', async () => {
  let accepted: boolean | undefined;
  const h = harness();
  const value = new Proxy(input(), {
    ownKeys(target) {
      accepted = h.owner.callback({});
      return Reflect.ownKeys(target);
    },
  });
  const result = h.owner.begin(value);
  expect(accepted).toBe(false);
  h.owner.cancel();
  await result;
});
