import { expect, it, vi } from 'vitest';
import {
  createScreenConsent,
  type ScreenConsentGrant,
} from '../../src/main/screen-consent';
import {
  evaluateScreenAuthorization,
  SCREEN_CONSENT_VERSION,
  type ScreenAuthorizationInput,
} from '../../src/core/screen-authorization';
import {
  initialScreenPreview,
  screenPreviewReducer,
} from '../../src/core/screen-preview';

// Internal synthetic handles only; not native provider identities or credentials.
const destination = {
  providerId: 'provider-1',
  accountId: 'account-1',
  authorizationId: 'session-1',
  disclosureVersion: SCREEN_CONSENT_VERSION,
};
type Owner = ReturnType<typeof createScreenConsent>;
function accepted(owner: Owner): ScreenConsentGrant {
  const presentation = owner.present();
  expect(presentation).not.toBeNull();
  const grant = owner.accept(presentation);
  expect(grant).not.toBeNull();
  if (!grant) throw new Error('CONSENT_EXPECTED');
  return grant;
}
function ready() {
  const owner = createScreenConsent();
  expect(owner.updateDestination(destination)).toBe(true);
  return owner;
}

it('starts without consent and accepts only an explicit current presentation', () => {
  const owner = createScreenConsent();
  expect(owner.current()).toBeNull();
  expect(owner.present()).toBeNull();
  expect(owner.accept(undefined)).toBeNull();
  expect(owner.isCurrent(undefined)).toBe(false);
  owner.updateDestination(destination);
  expect(owner.current()).toBeNull();
  const presentation = owner.present();
  expect(presentation).not.toBeNull();
  const grant = owner.accept(presentation);
  expect(grant).not.toBeNull();
  expect(owner.current()).toBe(grant);
  expect(owner.isCurrent(grant)).toBe(true);
});

it('returns immutable copies and never rereads caller-owned context', () => {
  const input = { ...destination };
  const owner = createScreenConsent();
  owner.updateDestination(input);
  input.accountId = 'mutated';
  const presentation = owner.present();
  expect(presentation).toEqual(destination);
  expect(Object.isFrozen(presentation)).toBe(true);
  const grant = owner.accept(presentation);
  expect(grant?.accountId).toBe(destination.accountId);
  expect(Object.isFrozen(grant)).toBe(true);
  expect(grant?.signal.aborted).toBe(false);
  expect(Reflect.set(grant!, 'accountId', 'mutated')).toBe(false);
  expect(owner.isCurrent(grant)).toBe(true);
  expect(owner.present()).toBeNull();
  expect(owner.accept(presentation)).toBeNull();
});

it('rejects copied, serialized, older, other-owner and preview acknowledgements', () => {
  const owner = ready();
  const old = owner.present();
  const current = owner.present();
  const other = ready();
  const reviewed = screenPreviewReducer(initialScreenPreview, {
    type: 'review',
  });
  const previews = [
    reviewed,
    screenPreviewReducer(reviewed, { type: 'include', value: true }),
  ];
  for (const value of [
    undefined,
    null,
    true,
    '',
    {},
    destination,
    { ...current },
    JSON.parse(JSON.stringify(current)),
    old,
    other.present(),
    ...previews,
  ])
    expect(owner.accept(value)).toBeNull();
  const grant = owner.accept(current);
  expect(grant).not.toBeNull();
  for (const value of [
    null,
    undefined,
    {},
    { ...grant },
    other.current(),
    current,
  ])
    expect(owner.isCurrent(value)).toBe(false);
  expect(owner.isCurrent(grant)).toBe(true);
  expect(owner.accept(current)).toBeNull();
  expect(owner.accept(grant)).toBeNull();
});

it('keeps a pending presentation and grant for identical destination snapshots', () => {
  const owner = ready();
  const presentation = owner.present();
  expect(owner.updateDestination(Object.freeze({ ...destination }))).toBe(true);
  const grant = owner.accept(presentation);
  expect(grant).not.toBeNull();
  expect(
    owner.updateDestination(Object.assign(Object.create(null), destination)),
  ).toBe(true);
  expect(owner.current()).toBe(grant);
  expect(grant?.signal.aborted).toBe(false);
});

const changes = [
  { ...destination, providerId: 'provider-2' },
  { ...destination, accountId: 'account-2' },
  { ...destination, authorizationId: 'session-2' },
  { ...destination, disclosureVersion: 0 },
  { ...destination, disclosureVersion: SCREEN_CONSENT_VERSION + 1 },
  null,
  undefined,
] as const;

it.each(changes)(
  'invalidates pending choices and grants on destination/revision/disconnect change %#',
  (change) => {
    const owner = ready();
    const oldPresentation = owner.present();
    owner.updateDestination(change);
    expect(owner.accept(oldPresentation)).toBeNull();
    owner.updateDestination(destination);
    const grant = accepted(owner);
    const aborted = vi.fn();
    grant.signal.addEventListener('abort', aborted, { once: true });
    owner.updateDestination(change);
    expect(aborted).toHaveBeenCalledTimes(1);
    expect(grant.signal.aborted).toBe(true);
    expect(owner.current()).toBeNull();
    expect(owner.isCurrent(grant)).toBe(false);
    expect(owner.accept(oldPresentation)).toBeNull();
    owner.updateDestination(destination);
    expect(owner.current()).toBeNull();
    expect(owner.isCurrent(grant)).toBe(false);
    const replacement = accepted(owner);
    expect(replacement).not.toBe(grant);
    expect(owner.isCurrent(replacement)).toBe(true);
  },
);

it('withdraws consent synchronously, consumes the choice, and requires a fresh choice', () => {
  const owner = ready();
  const pending = owner.present();
  owner.withdraw();
  expect(owner.accept(pending)).toBeNull();
  const grant = accepted(owner);
  let currentAtAbort: unknown = grant;
  grant.signal.addEventListener('abort', () => {
    currentAtAbort = owner.current();
  });
  owner.withdraw();
  expect(currentAtAbort).toBeNull();
  expect(grant.signal.aborted).toBe(true);
  expect(owner.current()).toBeNull();
  expect(owner.isCurrent(grant)).toBe(false);
  owner.withdraw();
  expect(owner.isCurrent(accepted(owner))).toBe(true);
});

it('disposes permanently and does not restore consent into a restarted owner', () => {
  const owner = ready();
  const grant = accepted(owner);
  owner.dispose();
  owner.dispose();
  owner.withdraw();
  expect(grant.signal.aborted).toBe(true);
  expect(owner.updateDestination(destination)).toBe(false);
  expect(owner.present()).toBeNull();
  expect(owner.accept(grant)).toBeNull();
  expect(owner.current()).toBeNull();
  expect(owner.isCurrent(grant)).toBe(false);
  const restarted = ready();
  expect(restarted.current()).toBeNull();
  expect(restarted.isCurrent(grant)).toBe(false);
  expect(restarted.accept(grant)).toBeNull();
  const pendingOwner = ready();
  const pending = pendingOwner.present();
  pendingOwner.dispose();
  expect(pendingOwner.accept(pending)).toBeNull();
  expect(restarted.accept(pending)).toBeNull();
});

function invalidatedBy(value: unknown) {
  const owner = ready();
  const grant = accepted(owner);
  expect(owner.updateDestination(value)).toBe(false);
  expect(owner.current()).toBeNull();
  expect(owner.present()).toBeNull();
  expect(owner.isCurrent(grant)).toBe(false);
  expect(grant.signal.aborted).toBe(true);
}

it('rejects missing, inherited, extra and accessor fields without invoking getters', () => {
  for (const key of Object.keys(destination)) {
    const missing: Record<string, unknown> = { ...destination };
    delete missing[key];
    invalidatedBy(missing);
    let reads = 0;
    const accessor = Object.defineProperty({ ...destination }, key, {
      get() {
        reads++;
        throw new Error('SYNTHETIC_PRIVATE_DETAIL');
      },
    });
    invalidatedBy(accessor);
    expect(reads).toBe(0);
    for (const value of [null, undefined, {}, [], () => true])
      invalidatedBy({ ...destination, [key]: value });
  }
  for (const value of [
    true,
    1,
    '',
    [],
    {},
    new Date(),
    Object.create(destination),
    { ...destination, extra: true },
    { ...destination, [Symbol('extra')]: true },
    Object.defineProperty({ ...destination }, 'hidden', { value: true }),
  ])
    invalidatedBy(value);
});

it('bounds internal handles and requires the compiled disclosure revision without coercion', () => {
  for (const key of ['providerId', 'accountId', 'authorizationId']) {
    for (const value of ['', ' ', 'a b', 'é', 'x'.repeat(129), 'a\n', 1, true])
      invalidatedBy({ ...destination, [key]: value });
    const owner = createScreenConsent();
    expect(
      owner.updateDestination({ ...destination, [key]: 'x'.repeat(128) }),
    ).toBe(true);
    expect(accepted(owner)[key as 'providerId']).toBe('x'.repeat(128));
  }
  for (const value of [
    0,
    -1,
    1.5,
    NaN,
    Infinity,
    '1',
    true,
    Number.MAX_SAFE_INTEGER + 1,
  ])
    invalidatedBy({ ...destination, disclosureVersion: value });
});

it('sanitizes reflective failures and compares choice/grant identities without reading them', () => {
  for (const trap of [
    'ownKeys',
    'getPrototypeOf',
    'getOwnPropertyDescriptor',
  ]) {
    const value = new Proxy(
      { ...destination },
      {
        [trap]: () => {
          throw new Error('SYNTHETIC_PRIVATE_DETAIL');
        },
      },
    );
    invalidatedBy(value);
  }
  const owner = ready();
  const choice = owner.present();
  const hostile = new Proxy(
    {},
    {
      get: () => {
        throw new Error('SYNTHETIC_PRIVATE_DETAIL');
      },
    },
  );
  expect(owner.accept(hostile)).toBeNull();
  expect(owner.isCurrent(hostile)).toBe(false);
  expect(owner.accept(choice)).not.toBeNull();
});

it.each(['withdraw', 'change', 'disconnect', 'invalid', 'dispose'] as const)(
  'prevents reentrant grants or updates during %s invalidation',
  (operation) => {
    const owner = ready();
    const grant = accepted(owner);
    const reentered = vi.fn(() => {
      expect(owner.current()).toBeNull();
      expect(owner.present()).toBeNull();
      expect(owner.accept({ ...destination })).toBeNull();
      expect(owner.updateDestination(destination)).toBe(false);
      expect(owner.isCurrent(grant)).toBe(false);
      owner.withdraw();
    });
    grant.signal.addEventListener('abort', reentered, { once: true });
    if (operation === 'withdraw') owner.withdraw();
    else if (operation === 'dispose') owner.dispose();
    else
      owner.updateDestination(
        operation === 'change'
          ? { ...destination, accountId: 'account-2' }
          : operation === 'disconnect'
            ? null
            : {},
      );
    expect(reentered).toHaveBeenCalledTimes(1);
    expect(owner.current()).toBeNull();
    expect(owner.updateDestination(destination)).toBe(operation !== 'dispose');
  },
);

it('keeps disposal terminal when called from an abort or reflective callback', () => {
  const owner = ready();
  const grant = accepted(owner);
  grant.signal.addEventListener('abort', owner.dispose, { once: true });
  expect(
    owner.updateDestination({ ...destination, accountId: 'account-2' }),
  ).toBe(false);
  expect(owner.updateDestination(destination)).toBe(false);
  expect(owner.present()).toBeNull();
  const second = ready();
  const candidate = new Proxy(
    { ...destination },
    {
      ownKeys(target) {
        second.dispose();
        return Reflect.ownKeys(target);
      },
    },
  );
  expect(second.updateDestination(candidate)).toBe(false);
  expect(second.current()).toBeNull();
  expect(second.present()).toBeNull();
});

it.each([...changes, 'withdraw', 'dispose'] as const)(
  'invalidates delayed mock work even when the original destination returns %#',
  async (change) => {
    const owner = ready();
    const grant = accepted(owner);
    const providerSend = vi.fn();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const work = (async () => {
      await pending;
      // A future orchestrator must also recheck request/target/exclusions/capabilities.
      if (owner.isCurrent(grant)) providerSend();
    })();
    if (change === 'withdraw') owner.withdraw();
    else if (change === 'dispose') owner.dispose();
    else owner.updateDestination(change);
    owner.updateDestination(destination);
    if (change !== 'dispose') accepted(owner);
    finish();
    await work;
    expect(grant.signal.aborted).toBe(true);
    expect(providerSend).not.toHaveBeenCalled();
  },
);

it('honors withdrawal during context inspection without allowing reentrant acceptance', () => {
  const owner = ready();
  const grant = accepted(owner);
  const context = new Proxy(
    { ...destination },
    {
      ownKeys(target) {
        owner.withdraw();
        expect(owner.present()).toBeNull();
        return Reflect.ownKeys(target);
      },
    },
  );
  expect(owner.updateDestination(context)).toBe(true);
  expect(grant.signal.aborted).toBe(true);
  expect(owner.current()).toBeNull();
  expect(owner.isCurrent(grant)).toBe(false);
  expect(owner.isCurrent(accepted(owner))).toBe(true);
});

it('composes current consent facts with every independent authorization prerequisite', () => {
  const owner = ready();
  const grant = accepted(owner);
  const input: ScreenAuthorizationInput = {
    requestId: 'request-1',
    activeRequestId: 'request-1',
    submitted: true,
    cancelled: false,
    requestConsumed: false,
    screenRequested: true,
    hardExcluded: false,
    neverIncludeScreen: false,
    consentGranted: owner.isCurrent(grant),
    consentVersion: grant.disclosureVersion,
    consentProviderId: grant.providerId,
    consentAccountId: grant.accountId,
    requestProviderId: grant.providerId,
    requestAccountId: grant.accountId,
    selectedProviderId: destination.providerId,
    selectedAccountId: destination.accountId,
    providerAuthorized: true,
    visionSupported: true,
    requestedTargetId: 'target-1',
    currentTargetId: 'target-1',
    targetAllowed: true,
    permissionGranted: true,
  };
  expect(evaluateScreenAuthorization(input).eligible).toBe(true);
  const denied: Partial<ScreenAuthorizationInput>[] = [
    { submitted: false },
    { cancelled: true },
    { requestConsumed: true },
    { activeRequestId: 'request-2' },
    { screenRequested: false },
    { hardExcluded: true },
    { neverIncludeScreen: true },
    { providerAuthorized: false },
    { visionSupported: false },
    { currentTargetId: 'target-2' },
    { targetAllowed: false },
    { permissionGranted: false },
  ];
  for (const change of denied)
    expect(evaluateScreenAuthorization({ ...input, ...change }).eligible).toBe(
      false,
    );
  owner.withdraw();
  expect(
    evaluateScreenAuthorization({
      ...input,
      consentGranted: owner.isCurrent(grant),
    }),
  ).toEqual({ eligible: false, reason: 'consent-required' });
});
