import { expect, it } from 'vitest';
import {
  evaluateScreenAuthorization,
  SCREEN_CONSENT_VERSION,
  type ScreenAuthorizationInput,
} from '../../src/core/screen-authorization';
import { classifyScreenIntent } from '../../src/core/screen-intent';

// Opaque synthetic handles, never real account details or window titles.
const ready: ScreenAuthorizationInput = {
  requestId: 'request-1',
  activeRequestId: 'request-1',
  submitted: true,
  cancelled: false,
  requestConsumed: false,
  screenRequested: true,
  hardExcluded: false,
  neverIncludeScreen: false,
  consentGranted: true,
  consentVersion: SCREEN_CONSENT_VERSION,
  consentProviderId: 'provider-1',
  consentAccountId: 'account-1',
  requestProviderId: 'provider-1',
  requestAccountId: 'account-1',
  selectedProviderId: 'provider-1',
  selectedAccountId: 'account-1',
  providerAuthorized: true,
  visionSupported: true,
  requestedTargetId: 'target-generation-1',
  currentTargetId: 'target-generation-1',
  targetAllowed: true,
  permissionGranted: true,
};
const denied = (reason: string) => ({ eligible: false, reason });
const denials: [Partial<ScreenAuthorizationInput>, string][] = [
  [{ hardExcluded: true }, 'excluded'],
  [{ neverIncludeScreen: true }, 'never-include'],
  [{ submitted: false }, 'not-submitted'],
  [{ cancelled: true }, 'cancelled'],
  [{ requestConsumed: true }, 'already-consumed'],
  [{ activeRequestId: 'request-2' }, 'stale-request'],
  [{ screenRequested: false }, 'text-only'],
  [{ consentGranted: false }, 'consent-required'],
  [{ consentVersion: 0 }, 'consent-required'],
  [{ consentVersion: SCREEN_CONSENT_VERSION + 1 }, 'consent-required'],
  [{ selectedProviderId: 'provider-2' }, 'destination-changed'],
  [{ selectedAccountId: 'account-2' }, 'destination-changed'],
  [{ consentProviderId: 'provider-2' }, 'consent-mismatch'],
  [{ consentAccountId: 'account-2' }, 'consent-mismatch'],
  [{ providerAuthorized: false }, 'provider-unauthorized'],
  [{ visionSupported: false }, 'vision-unsupported'],
  [{ currentTargetId: 'target-generation-2' }, 'target-changed'],
  [{ targetAllowed: false }, 'target-blocked'],
  [{ permissionGranted: false }, 'permission-denied'],
];

it('reports eligibility only when every prerequisite agrees, without retaining or returning identifiers', () => {
  const result = evaluateScreenAuthorization(Object.freeze({ ...ready }));
  expect(result).toEqual({ eligible: true, reason: 'prerequisites-met' });
  expect(
    evaluateScreenAuthorization(Object.assign(Object.create(null), ready)),
  ).toEqual(result);
  expect(Object.keys(result).sort()).toEqual(['eligible', 'reason']);
});

it.each(denials)(
  'denies each independently missing prerequisite %#',
  (change, reason) => {
    expect(evaluateScreenAuthorization({ ...ready, ...change })).toEqual(
      denied(reason),
    );
  },
);

it('fails closed for every combination of boolean prerequisite failures', () => {
  const keys = Object.keys(ready).filter(
    (key) => typeof ready[key as keyof ScreenAuthorizationInput] === 'boolean',
  );
  for (let mask = 0; mask < 2 ** keys.length; mask++) {
    const input: Record<string, unknown> = { ...ready };
    keys.forEach((key, index) => {
      if (mask & (1 << index)) input[key] = !input[key];
    });
    expect(evaluateScreenAuthorization(input).eligible).toBe(mask === 0);
  }
});

it('exclusions and Never win and Include never bypasses independent consent or permission', () => {
  expect(
    evaluateScreenAuthorization({
      ...ready,
      hardExcluded: true,
      neverIncludeScreen: true,
      consentGranted: false,
    }),
  ).toEqual(denied('excluded'));
  expect(
    evaluateScreenAuthorization({
      ...ready,
      neverIncludeScreen: true,
      cancelled: true,
    }),
  ).toEqual(denied('never-include'));
  for (const includeScreen of [false, true]) {
    const intent = classifyScreenIntent({
      prompt: 'What is on my screen?',
      submitted: true,
      hardExcluded: false,
      neverIncludeScreen: false,
      includeScreen,
    });
    expect(intent.kind).toBe('screen-context-requested');
    for (const [change, reason] of denials)
      expect(
        evaluateScreenAuthorization({
          ...ready,
          screenRequested: intent.kind === 'screen-context-requested',
          ...change,
        }),
      ).toEqual(denied(reason));
  }
});

it('re-evaluation detects revocation, cancellation and changed destinations or targets', () => {
  const input = { ...ready };
  expect(evaluateScreenAuthorization(input).eligible).toBe(true);
  for (const [change, reason] of denials) {
    Object.assign(input, ready, change);
    expect(evaluateScreenAuthorization(input)).toEqual(denied(reason));
  }
  // This stateless predicate does NOT consume requests or make cached results safe.
  expect(evaluateScreenAuthorization(ready).eligible).toBe(true);
});

it('rejects missing, wrongly typed, inherited, unknown and accessor fields without reading getters', () => {
  for (const key of Object.keys(ready)) {
    const missing: Record<string, unknown> = { ...ready };
    delete missing[key];
    expect(evaluateScreenAuthorization(missing)).toEqual(
      denied('invalid-input'),
    );
    for (const value of [null, undefined, {}, [], () => true])
      expect(evaluateScreenAuthorization({ ...ready, [key]: value })).toEqual(
        denied('invalid-input'),
      );
    let reads = 0;
    const accessor = Object.defineProperty({ ...ready }, key, {
      get() {
        reads++;
        throw new Error('SYNTHETIC_PRIVATE_DETAIL');
      },
    });
    expect(evaluateScreenAuthorization(accessor)).toEqual(
      denied('invalid-input'),
    );
    expect(reads).toBe(0);
  }
  for (const value of [
    null,
    undefined,
    true,
    1,
    '',
    [],
    {},
    Object.create(ready),
    new Date(),
    { ...ready, extra: true },
    { ...ready, [Symbol('extra')]: true },
  ])
    expect(evaluateScreenAuthorization(value)).toEqual(denied('invalid-input'));
  for (const trap of [
    'ownKeys',
    'getPrototypeOf',
    'getOwnPropertyDescriptor',
  ]) {
    const value = new Proxy(
      { ...ready },
      {
        [trap]: () => {
          throw new Error('SYNTHETIC_PRIVATE_DETAIL');
        },
      },
    );
    expect(evaluateScreenAuthorization(value)).toEqual(denied('invalid-input'));
  }
});

it('bounds opaque identifiers and validates versions and boolean types without coercion', () => {
  for (const [key, value] of Object.entries(ready)) {
    const invalid =
      typeof value === 'string'
        ? ['', ' ', 'a b', 'x'.repeat(129), 'é', 'a\n', 1, true]
        : typeof value === 'boolean'
          ? [0, 1, 'true', 'false']
          : [-1, 1.5, NaN, Infinity, '1', true, Number.MAX_SAFE_INTEGER + 1];
    for (const replacement of invalid)
      expect(
        evaluateScreenAuthorization({ ...ready, [key]: replacement }),
      ).toEqual(denied('invalid-input'));
  }
  expect(
    evaluateScreenAuthorization({
      ...ready,
      requestId: 'x'.repeat(128),
      activeRequestId: 'x'.repeat(128),
    }).eligible,
  ).toBe(true);
});
