import { afterEach, expect, it, vi } from 'vitest';
import { MAX_IMAGE_BYTES, type ChatInput } from '../../src/core/provider';
import { SCREEN_CONSENT_VERSION } from '../../src/core/screen-authorization';
import { createScreenConsent } from '../../src/main/screen-consent';
import {
  createScreenRequest,
  type ScreenRequestPolicy,
  type ScreenRequestTicket,
} from '../../src/main/screen-request';
import { createPngEncoder } from '../../src/main/capture-png';
import { createMockProvider } from '../../src/providers/mock';
import { readSyntheticPng, syntheticBgra } from '../fixtures/png';
import corpus from '../fixtures/screen-intent.json';

const policy: ScreenRequestPolicy = {
  providerId: 'mock',
  accountId: 'account-1',
  authorizationId: 'session-1',
  targetId: 'target-incarnation-1',
  policyId: 'policy-incarnation-1',
  hardExcluded: false,
  neverIncludeScreen: false,
  providerAuthorized: true,
  visionSupported: true,
  targetAllowed: true,
  permissionGranted: true,
};
const submission = {
  run: 1,
  prompt: 'What is on my screen?',
  includeScreen: false,
};
const stopped = (reason: string, dispatchStarted = false) => ({
  status: 'stopped',
  reason,
  dispatchStarted,
});
const deferred = <T>() => {
  let resolve!: (value: T) => void;
  let reject!: (value: unknown) => void;
  const promise = new Promise<T>((yes, no) => {
    resolve = yes;
    reject = no;
  });
  return { promise, resolve, reject };
};
const empty = (bytes: Uint8Array) => bytes.every((value) => value === 0);
function setup(granted = true) {
  const consent = createScreenConsent();
  consent.updateDestination({
    providerId: policy.providerId,
    accountId: policy.accountId,
    authorizationId: policy.authorizationId,
    disclosureVersion: SCREEN_CONSENT_VERSION,
  });
  if (granted) consent.accept(consent.present());
  let current: unknown = { ...policy };
  const readPolicy = vi.fn(() => current);
  const originals: Uint8Array[] = [];
  const copies: Uint8Array[] = [];
  const tickets: ScreenRequestTicket[] = [];
  const capture = vi.fn(
    async (
      ticket: ScreenRequestTicket,
      signal: AbortSignal,
    ): Promise<unknown> => {
      expect(signal.aborted).toBe(false);
      const bytes = Uint8Array.of(7, 8, 9); // Contract-only synthetic bytes; real PNG exercised separately.
      originals.push(bytes);
      tickets.push(ticket);
      return { ticket, mimeType: 'image/png', bytes };
    },
  );
  const dispatch = vi.fn(
    async (
      _ticket: ScreenRequestTicket,
      input: ChatInput,
      signal: AbortSignal,
    ) => {
      expect(signal.aborted).toBe(false);
      if (!input.screenshot) throw new Error('IMAGE_EXPECTED');
      copies.push(input.screenshot.bytes);
    },
  );
  const owner = createScreenRequest({
    consent,
    readPolicy,
    capture,
    dispatch,
    timeoutMs: 100,
  });
  return {
    owner,
    consent,
    readPolicy,
    capture,
    dispatch,
    originals,
    copies,
    tickets,
    setPolicy(value: unknown) {
      current = value;
    },
  };
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

it('captures and dispatches once with an immutable bound ticket, then clears both image views', async () => {
  const f = setup();
  expect(f.capture).not.toHaveBeenCalled();
  expect(f.dispatch.mock.calls.length).toBe(0);
  expect(await f.owner.run(submission)).toEqual({ status: 'sent' });
  expect(f.capture).toHaveBeenCalledTimes(1);
  expect(f.dispatch.mock.calls.length).toBe(1);
  const ticket = f.tickets[0]!;
  expect(Object.isFrozen(ticket)).toBe(true);
  expect(ticket).toEqual({
    run: 1,
    providerId: policy.providerId,
    accountId: policy.accountId,
    authorizationId: policy.authorizationId,
    targetId: policy.targetId,
    policyId: policy.policyId,
  });
  expect(f.dispatch.mock.calls[0]![0]).toBe(ticket);
  expect(f.originals[0] !== f.copies[0]).toBe(true);
  expect(empty(f.originals[0]!)).toBe(true);
  expect(empty(f.copies[0]!)).toBe(true);
  expect(await f.owner.run(submission)).toEqual(stopped('stale-request'));
  expect(await f.owner.run({ ...submission, run: 2 })).toEqual({
    status: 'sent',
  });
});

it('keeps general/ambiguous questions text-only without consent and requires explicit Include for ambiguity', async () => {
  const f = setup(false);
  for (const [index, prompt] of [
    'What is a pivot table?',
    'Can you explain this?',
  ].entries())
    expect(
      (await f.owner.run({ ...submission, run: index + 1, prompt })).status,
    ).toBe('text-only');
  expect(f.capture).not.toHaveBeenCalled();
  expect(f.dispatch.mock.calls.length).toBe(0);
  expect(
    await f.owner.run({
      ...submission,
      run: 3,
      includeScreen: true,
      prompt: 'Can you explain this?',
    }),
  ).toEqual(stopped('consent-required'));
  f.consent.accept(f.consent.present());
  expect(
    await f.owner.run({
      ...submission,
      run: 4,
      includeScreen: true,
      prompt: 'Can you explain this?',
    }),
  ).toEqual({ status: 'sent' });
});

it.each(['hardExcluded', 'neverIncludeScreen'] as const)(
  'lets %s override explicit Include without capture',
  async (key) => {
    const f = setup();
    f.setPolicy({ ...policy, [key]: true });
    expect(
      (await f.owner.run({ ...submission, includeScreen: true })).status,
    ).toBe('text-only');
    expect(f.capture).not.toHaveBeenCalled();
    expect(f.dispatch.mock.calls.length).toBe(0);
  },
);

it.each([
  [{ providerAuthorized: false }, 'provider-unauthorized'],
  [{ visionSupported: false }, 'vision-unsupported'],
  [{ targetAllowed: false }, 'target-blocked'],
  [{ permissionGranted: false }, 'permission-denied'],
  [{ providerId: 'other-provider' }, 'consent-mismatch'],
  [{ accountId: 'other-account' }, 'consent-mismatch'],
  [{ authorizationId: 'new-session' }, 'policy-changed'],
] as const)(
  'independently checks submission prerequisites %#',
  async (change, reason) => {
    const f = setup();
    f.setPolicy({ ...policy, ...change });
    expect(await f.owner.run(submission)).toEqual(stopped(reason));
    expect(f.capture).not.toHaveBeenCalled();
    expect(f.dispatch.mock.calls.length).toBe(0);
  },
);

it.each([
  [{ hardExcluded: true }, 'excluded'],
  [{ neverIncludeScreen: true }, 'never-include'],
  [{ providerAuthorized: false }, 'provider-unauthorized'],
  [{ visionSupported: false }, 'vision-unsupported'],
  [{ targetAllowed: false }, 'target-blocked'],
  [{ permissionGranted: false }, 'permission-denied'],
  [{ providerId: 'other-provider' }, 'destination-changed'],
  [{ accountId: 'other-account' }, 'destination-changed'],
  [{ authorizationId: 'new-session' }, 'policy-changed'],
  [{ targetId: 'new-target' }, 'target-changed'],
  [{ policyId: 'new-policy' }, 'policy-changed'],
] as const)(
  'rechecks current policy after capture rather than reusing old eligibility %#',
  async (change, reason) => {
    const f = setup();
    const original = f.capture.getMockImplementation()!;
    f.capture.mockImplementation(async (ticket, signal) => {
      const result = await original(ticket, signal);
      f.setPolicy({ ...policy, ...change });
      return result;
    });
    expect(await f.owner.run(submission)).toEqual(stopped(reason));
    expect(f.dispatch.mock.calls.length).toBe(0);
    expect(empty(f.originals[0]!)).toBe(true);
  },
);

it('uses a fresh snapshot immediately before capture and rejects changed policy incarnation', async () => {
  const f = setup();
  f.readPolicy
    .mockReturnValueOnce(policy)
    .mockReturnValueOnce({ ...policy, policyId: 'new-policy' });
  expect(await f.owner.run(submission)).toEqual(stopped('policy-changed'));
  expect(f.capture).not.toHaveBeenCalled();
});

it('rejects malformed submissions without reading accessors or consuming a valid run', async () => {
  const f = setup();
  const getter = vi.fn(() => {
    throw new Error('ACCESSOR_MUST_NOT_RUN');
  });
  const invalid: unknown[] = [
    null,
    undefined,
    [],
    {},
    Object.create(submission),
    { ...submission, extra: true },
    { ...submission, [Symbol('extra')]: true },
  ];
  for (const key of Object.keys(submission)) {
    const missing: Record<string, unknown> = { ...submission };
    delete missing[key];
    invalid.push(missing);
    invalid.push(
      Object.defineProperty({ ...submission }, key, {
        get: getter,
      }),
    );
  }
  for (const run of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    '1',
    Number.MAX_SAFE_INTEGER + 1,
  ])
    invalid.push({ ...submission, run });
  for (const prompt of ['', ' ', 'x'.repeat(2001), 1, true])
    invalid.push({ ...submission, prompt });
  invalid.push(
    { ...submission, includeScreen: 1 },
    new Proxy(
      {},
      {
        ownKeys() {
          throw new Error('SYNTHETIC_PRIVATE_DETAIL');
        },
      },
    ),
  );
  for (const value of invalid)
    expect(await f.owner.run(value)).toEqual(stopped('invalid-input'));
  expect(f.readPolicy).not.toHaveBeenCalled();
  expect(f.capture).not.toHaveBeenCalled();
  expect(getter).not.toHaveBeenCalled();
  expect(
    await f.owner.run(Object.assign(Object.create(null), submission)),
  ).toEqual({ status: 'sent' });
});

it('fails closed on malformed/throwing policy snapshots without reading getters', async () => {
  const getter = vi.fn(() => {
    throw new Error('ACCESSOR_MUST_NOT_RUN');
  });
  const cases: unknown[] = [
    null,
    {},
    [],
    Object.create(policy),
    { ...policy, extra: true },
    { ...policy, [Symbol('extra')]: true },
    { ...policy, targetId: 'bad target' },
    { ...policy, accountId: 'x'.repeat(129) },
    { ...policy, targetAllowed: 1 },
  ];
  for (const key of Object.keys(policy)) {
    const missing: Record<string, unknown> = { ...policy };
    delete missing[key];
    cases.push(missing);
    cases.push(
      Object.defineProperty({ ...policy }, key, {
        get: getter,
      }),
    );
  }
  for (const value of cases) {
    const f = setup();
    f.setPolicy(value);
    expect(await f.owner.run(submission)).toEqual(
      stopped('policy-unavailable'),
    );
    expect(f.capture).not.toHaveBeenCalled();
  }
  const f = setup();
  expect(getter).not.toHaveBeenCalled();
  f.readPolicy.mockImplementation(() => {
    throw new Error('SYNTHETIC_PRIVATE_DETAIL');
  });
  expect(await f.owner.run(submission)).toEqual(stopped('policy-unavailable'));
});

it.each([
  'ticket-copy',
  'ticket-foreign',
  'mime',
  'empty',
  'large',
  'shared',
  'extra',
  'accessor',
  'null',
])(
  'rejects %s capture output and clears recognized exclusively owned views',
  async (mode) => {
    const f = setup();
    let bytes: Uint8Array | undefined;
    f.capture.mockImplementation(async (ticket) => {
      if (mode === 'null') return null;
      bytes =
        mode === 'shared'
          ? new Uint8Array(new SharedArrayBuffer(3)).fill(7)
          : new Uint8Array(
              mode === 'large' ? MAX_IMAGE_BYTES + 1 : mode === 'empty' ? 0 : 3,
            ).fill(7);
      const result = {
        ticket:
          mode === 'ticket-copy'
            ? { ...ticket }
            : mode === 'ticket-foreign'
              ? {}
              : ticket,
        mimeType: mode === 'mime' ? 'image/jpeg' : 'image/png',
        bytes,
      };
      if (mode === 'extra') return { ...result, extra: true };
      if (mode === 'accessor')
        return Object.defineProperty(result, 'mimeType', {
          get() {
            throw new Error('ACCESSOR_MUST_NOT_RUN');
          },
        });
      return result;
    });
    expect(await f.owner.run(submission)).toEqual(stopped('invalid-capture'));
    expect(f.dispatch.mock.calls.length).toBe(0);
    if (bytes && mode !== 'shared') expect(empty(bytes)).toBe(true);
    bytes?.fill(0);
  },
);

it.each(['cancel', 'withdraw', 'invalidate', 'dispose', 'timeout'] as const)(
  'settles %s promptly, blocks overlap and discards late capture even after fresh consent',
  async (mode) => {
    vi.useFakeTimers();
    const f = setup();
    const held = deferred<unknown>();
    let ticket!: ScreenRequestTicket;
    let signal!: AbortSignal;
    f.capture.mockImplementation((t, s) => {
      ticket = t;
      signal = s;
      return held.promise;
    });
    const result = f.owner.run(submission);
    expect(f.owner.cancel(999)).toBe(false);
    if (mode === 'cancel') expect(f.owner.cancel(1)).toBe(true);
    else if (mode === 'withdraw') f.consent.withdraw();
    else if (mode === 'invalidate') f.owner.invalidate();
    else if (mode === 'dispose') f.owner.dispose();
    else await vi.advanceTimersByTimeAsync(100);
    const reason =
      mode === 'withdraw'
        ? 'consent-required'
        : mode === 'invalidate'
          ? 'policy-changed'
          : mode === 'cancel'
            ? 'cancelled'
            : mode === 'dispose'
              ? 'disposed'
              : mode;
    expect(await result).toEqual(stopped(reason));
    expect(vi.getTimerCount()).toBe(0);
    expect(signal.aborted).toBe(true);
    expect(await f.owner.run({ ...submission, run: 2 })).toEqual(
      stopped(mode === 'dispose' ? 'disposed' : 'unavailable'),
    );
    f.consent.accept(f.consent.present());
    const bytes = Uint8Array.of(8, 9, 10);
    held.resolve({ ticket, mimeType: 'image/png', bytes });
    await vi.advanceTimersByTimeAsync(0);
    expect(empty(bytes)).toBe(true);
    expect(f.dispatch.mock.calls.length).toBe(0);
    expect(vi.getTimerCount()).toBe(0);
    if (mode !== 'dispose') {
      f.capture.mockImplementation(async (t) => ({
        ticket: t,
        mimeType: 'image/png',
        bytes: Uint8Array.of(1),
      }));
      expect(await f.owner.run({ ...submission, run: 2 })).toEqual({
        status: 'sent',
      });
      expect(await f.owner.run(submission)).toEqual(stopped('stale-request'));
    }
  },
);

it.each(['cancel', 'withdraw', 'invalidate', 'dispose', 'timeout'] as const)(
  'reports %s after dispatch started and retains its borrowed copy until completion',
  async (mode) => {
    vi.useFakeTimers();
    const f = setup();
    const held = deferred<void>();
    const entered = deferred<void>();
    let copy!: Uint8Array;
    let signal!: AbortSignal;
    f.dispatch.mockImplementation((_ticket, input, s) => {
      copy = input.screenshot!.bytes;
      signal = s;
      entered.resolve();
      return held.promise;
    });
    const result = f.owner.run(submission);
    await entered.promise;
    expect(empty(f.originals[0]!)).toBe(true);
    if (mode === 'cancel') f.owner.cancel(1);
    else if (mode === 'withdraw') f.consent.withdraw();
    else if (mode === 'invalidate') f.owner.invalidate();
    else if (mode === 'dispose') f.owner.dispose();
    else await vi.advanceTimersByTimeAsync(100);
    const reason =
      mode === 'cancel'
        ? 'cancelled'
        : mode === 'withdraw'
          ? 'consent-required'
          : mode === 'invalidate'
            ? 'policy-changed'
            : mode === 'dispose'
              ? 'disposed'
              : 'timeout';
    expect(await result).toEqual(stopped(reason, true));
    expect(signal.aborted).toBe(true);
    expect(empty(copy)).toBe(false);
    expect(await f.owner.run({ ...submission, run: 2 })).toEqual(
      stopped(mode === 'dispose' ? 'disposed' : 'unavailable'),
    );
    held.resolve();
    await vi.advanceTimersByTimeAsync(0);
    expect(empty(copy)).toBe(true);
    expect(vi.getTimerCount()).toBe(0);
    expect(f.dispatch.mock.calls.length).toBe(1);
  },
);

it.each([
  'capture-throw',
  'capture-reject',
  'dispatch-throw',
  'dispatch-reject',
])('sanitizes %s, clears images and permits only a fresh run', async (mode) => {
  const f = setup();
  const originalCapture = f.capture.getMockImplementation()!;
  const originalDispatch = f.dispatch.getMockImplementation()!;
  const failure = () => {
    throw new Error('SYNTHETIC_PRIVATE_DETAIL');
  };
  if (mode === 'capture-throw') f.capture.mockImplementation(failure);
  if (mode === 'capture-reject')
    f.capture.mockRejectedValue(new Error('SYNTHETIC_PRIVATE_DETAIL'));
  if (mode.startsWith('dispatch'))
    f.dispatch.mockImplementation((_ticket, input) => {
      f.copies.push(input.screenshot!.bytes);
      if (mode === 'dispatch-throw')
        throw new Error('SYNTHETIC_PRIVATE_DETAIL');
      return Promise.reject(new Error('SYNTHETIC_PRIVATE_DETAIL'));
    });
  expect(await f.owner.run(submission)).toEqual(
    stopped(
      mode.startsWith('capture') ? 'capture-failed' : 'dispatch-failed',
      mode.startsWith('dispatch'),
    ),
  );
  expect(f.originals.every(empty)).toBe(true);
  expect(f.copies.every(empty)).toBe(true);
  expect(await f.owner.run(submission)).toEqual(stopped('stale-request'));
  f.capture.mockImplementation(originalCapture);
  f.dispatch.mockImplementation(originalDispatch);
  expect(await f.owner.run({ ...submission, run: 2 })).toEqual({
    status: 'sent',
  });
});

it('handles reentrant submit, cancel and disposal before a side effect', async () => {
  const f = setup();
  let nested!: Promise<unknown>;
  f.readPolicy.mockImplementation(() => {
    nested = f.owner.run({ ...submission, run: 2 });
    f.owner.dispose();
    return policy;
  });
  expect(await f.owner.run(submission)).toEqual(stopped('disposed'));
  expect(await nested).toEqual(stopped('unavailable'));
  expect(f.capture).not.toHaveBeenCalled();
  f.owner.dispose();
  f.owner.invalidate();
  expect(f.owner.cancel(1)).toBe(false);
  expect(await f.owner.run({ ...submission, run: 3 })).toEqual(
    stopped('disposed'),
  );
});

it('copies only the returned view and clears only that transferred view', async () => {
  const f = setup();
  const backing = new Uint8Array(9).fill(33);
  f.capture.mockImplementation(async (ticket) => ({
    ticket,
    mimeType: 'image/png',
    bytes: backing.subarray(3, 6),
  }));
  f.dispatch.mockImplementation(async (_ticket, input) => {
    expect(
      input.screenshot?.bytes.length === 3 &&
        input.screenshot.bytes.every((x) => x === 33),
    ).toBe(true);
  });
  expect(
    await f.owner.run({ ...submission, prompt: ' What is on my screen? ' }),
  ).toEqual({ status: 'sent' });
  expect(backing.subarray(3, 6).every((x) => x === 0)).toBe(true);
  expect(
    backing.subarray(0, 3).every((x) => x === 33) &&
      backing.subarray(6).every((x) => x === 33),
  ).toBe(true);
  backing.fill(0);
});

it('validates deadline construction and leaves no idle work', () => {
  const f = setup();
  vi.useFakeTimers();
  for (const timeoutMs of [0, 30001, 1.5, NaN, Infinity])
    expect(() =>
      createScreenRequest({
        consent: f.consent,
        readPolicy: f.readPolicy,
        capture: f.capture,
        dispatch: f.dispatch,
        timeoutMs,
      }),
    ).toThrow('Invalid screen request deadline');
  expect(vi.getTimerCount()).toBe(0);
  f.owner.dispose();
  expect(f.capture).not.toHaveBeenCalled();
  expect(f.dispatch.mock.calls.length).toBe(0);
});

it('runs the existing non-screen corpus through the owner with zero capture/dispatch calls', async () => {
  const f = setup(false);
  const prompts = [corpus.development, corpus.evaluation].flatMap((split) =>
    Object.entries(split)
      .filter(([label]) => label !== 'clear')
      .flatMap(([, values]) => values),
  );
  expect(prompts.length).toBeGreaterThanOrEqual(150);
  for (const [index, prompt] of prompts.entries())
    expect(
      (await f.owner.run({ ...submission, run: index + 1, prompt })).status,
    ).toBe('text-only');
  expect(f.capture).not.toHaveBeenCalled();
  expect(f.dispatch.mock.calls.length).toBe(0);
});

it('composes the memory-only PNG encoder and offline vision provider using synthetic pixels', async () => {
  const f = setup();
  const encoder = createPngEncoder();
  const provider = createMockProvider({
    scenario: 'vision-success',
    vision: true,
  });
  await provider.connect();
  let source: Uint8Array | undefined;
  let copy: Uint8Array | undefined;
  let chunks = 0;
  f.capture.mockImplementation(async (ticket, signal) => {
    const frame = syntheticBgra();
    try {
      const image = await encoder.encode(frame, 'straight', signal);
      if (image.status !== 'image') throw new Error('PNG_EXPECTED');
      source = image.bytes;
      return { ticket, mimeType: image.mimeType, bytes: image.bytes };
    } finally {
      frame.bytes.fill(0);
    }
  });
  f.dispatch.mockImplementation(async (ticket, input, signal) => {
    expect(ticket.providerId).toBe(provider.id);
    copy = input.screenshot!.bytes;
    const decoded = readSyntheticPng(copy);
    try {
      expect(
        decoded.width === 2 &&
          decoded.height === 2 &&
          decoded.rgba[0] === 255 &&
          decoded.rgba[1] === 0,
      ).toBe(true);
    } finally {
      decoded.rgba.fill(0);
    }
    // The mock is already connected. No awaited routing/auth step after the owner's final check.
    for await (const chunk of provider.streamReply(input, signal)) {
      expect(typeof chunk === 'string' && chunk.length > 0).toBe(true);
      chunks++;
    }
  });
  try {
    expect(await f.owner.run(submission)).toEqual({ status: 'sent' });
    expect(chunks).toBe(2);
    expect(Boolean(source && empty(source) && copy && empty(copy))).toBe(true);
  } finally {
    source?.fill(0);
    copy?.fill(0);
    encoder.dispose();
    await provider.disconnect();
  }
});

it('rejects trailing-newline internal handles before capture', async () => {
  for (const key of [
    'providerId',
    'accountId',
    'authorizationId',
    'targetId',
    'policyId',
  ]) {
    const f = setup();
    f.setPolicy({ ...policy, [key]: 'handle\n' });
    expect(await f.owner.run(submission)).toEqual(
      stopped('policy-unavailable'),
    );
    expect(f.capture).not.toHaveBeenCalled();
  }
});

it('rechecks cancellation during the final policy read and never dispatches the copied image', async () => {
  const f = setup();
  f.readPolicy
    .mockReturnValueOnce(policy)
    .mockReturnValueOnce(policy)
    .mockImplementationOnce(() => {
      f.owner.cancel(1);
      return policy;
    });
  expect(await f.owner.run(submission)).toEqual(stopped('cancelled'));
  expect(f.dispatch.mock.calls.length).toBe(0);
  expect(empty(f.originals[0]!)).toBe(true);
});

it('fails closed if the final policy read becomes unavailable', async () => {
  const f = setup();
  f.readPolicy
    .mockReturnValueOnce(policy)
    .mockReturnValueOnce(policy)
    .mockReturnValueOnce(null);
  expect(await f.owner.run(submission)).toEqual(stopped('policy-unavailable'));
  expect(f.dispatch.mock.calls.length).toBe(0);
  expect(empty(f.originals[0]!)).toBe(true);
});

it('handles disposal from reflection while the submission is being parsed', async () => {
  const f = setup();
  const value = new Proxy(
    { ...submission },
    {
      ownKeys(target) {
        f.owner.dispose();
        return Reflect.ownKeys(target);
      },
    },
  );
  expect(await f.owner.run(value)).toEqual(stopped('disposed'));
  expect(f.readPolicy).not.toHaveBeenCalled();
  expect(f.capture).not.toHaveBeenCalled();
  expect(f.owner.cancel(0)).toBe(false);
});

it('retains the default five-second deadline, rejects overlap and handles a late rejection', async () => {
  vi.useFakeTimers();
  const f = setup();
  const held = deferred<unknown>();
  f.capture.mockImplementation(() => held.promise);
  const owner = createScreenRequest({
    consent: f.consent,
    readPolicy: f.readPolicy,
    capture: f.capture,
    dispatch: f.dispatch,
  });
  const result = owner.run(submission);
  let settled = false;
  void result.then(() => {
    settled = true;
  });
  await vi.advanceTimersByTimeAsync(4999);
  expect(settled).toBe(false);
  expect(await owner.run({ ...submission, run: 2 })).toEqual(
    stopped('unavailable'),
  );
  await vi.advanceTimersByTimeAsync(1);
  expect(await result).toEqual(stopped('timeout'));
  expect(vi.getTimerCount()).toBe(0);
  expect(owner.cancel(1)).toBe(false);
  held.reject(new Error('SYNTHETIC_PRIVATE_DETAIL'));
  await vi.advanceTimersByTimeAsync(0);
  expect(f.dispatch.mock.calls.length).toBe(0);
  f.capture.mockImplementation(async (ticket) => ({
    ticket,
    mimeType: 'image/png',
    bytes: Uint8Array.of(1),
  }));
  expect(await owner.run({ ...submission, run: 2 })).toEqual({
    status: 'sent',
  });
});
