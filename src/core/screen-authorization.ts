/** Provisional disclosure revision, not persisted or accepted by the current app. */
export const SCREEN_CONSENT_VERSION = 1;

const schema = {
  requestId: 'id',
  activeRequestId: 'id',
  submitted: 'boolean',
  cancelled: 'boolean',
  requestConsumed: 'boolean',
  screenRequested: 'boolean',
  hardExcluded: 'boolean',
  neverIncludeScreen: 'boolean',
  consentGranted: 'boolean',
  consentVersion: 'version',
  consentProviderId: 'id',
  consentAccountId: 'id',
  requestProviderId: 'id',
  requestAccountId: 'id',
  selectedProviderId: 'id',
  selectedAccountId: 'id',
  providerAuthorized: 'boolean',
  visionSupported: 'boolean',
  requestedTargetId: 'id',
  currentTargetId: 'id',
  targetAllowed: 'boolean',
  permissionGranted: 'boolean',
} as const;

/** Trusted main-owned facts only, NEVER a renderer-supplied authorization payload. */
export type ScreenAuthorizationInput = {
  [K in keyof typeof schema]: (typeof schema)[K] extends 'boolean'
    ? boolean
    : (typeof schema)[K] extends 'version'
      ? number
      : string;
};
export type ScreenAuthorizationReason =
  | 'invalid-input'
  | 'excluded'
  | 'never-include'
  | 'not-submitted'
  | 'cancelled'
  | 'already-consumed'
  | 'stale-request'
  | 'text-only'
  | 'consent-required'
  | 'destination-changed'
  | 'consent-mismatch'
  | 'provider-unauthorized'
  | 'vision-unsupported'
  | 'target-changed'
  | 'target-blocked'
  | 'permission-denied';
export type ScreenAuthorizationDecision =
  | { eligible: false; reason: ScreenAuthorizationReason }
  | { eligible: true; reason: 'prerequisites-met' };

function parseInput(value: unknown): ScreenAuthorizationInput | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).some((key) => !Object.hasOwn(schema, key)))
      return null;
    const data: Record<string, unknown> = {};
    for (const [key, type] of Object.entries(schema)) {
      const descriptor = descriptors[key];
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
      const field: unknown = descriptor.value;
      if (type === 'boolean') {
        if (typeof field !== 'boolean') return null;
      } else if (type === 'version') {
        if (
          typeof field !== 'number' ||
          !Number.isSafeInteger(field) ||
          field < 0
        )
          return null;
      } else if (
        typeof field !== 'string' ||
        field.length === 0 ||
        field.length > 128 ||
        /[^A-Za-z0-9_-]/.test(field)
      )
        return null;
      data[key] = field;
    }
    return data as ScreenAuthorizationInput;
  } catch {
    return null;
  }
}

/**
 * Pure snapshot eligibility, not a reusable permit or capture/transmission API.
 * Future orchestration must own these facts, revalidate at each side effect and
 * atomically enforce single use. This predicate cannot prove freshness or provenance.
 */
export function evaluateScreenAuthorization(
  value: unknown,
): ScreenAuthorizationDecision {
  const deny = (
    reason: ScreenAuthorizationReason,
  ): ScreenAuthorizationDecision => ({ eligible: false, reason });
  const data = parseInput(value);
  if (!data) return deny('invalid-input');
  if (data.hardExcluded) return deny('excluded');
  if (data.neverIncludeScreen) return deny('never-include');
  if (!data.submitted) return deny('not-submitted');
  if (data.cancelled) return deny('cancelled');
  if (data.requestConsumed) return deny('already-consumed');
  if (data.requestId !== data.activeRequestId) return deny('stale-request');
  if (!data.screenRequested) return deny('text-only');
  if (!data.consentGranted || data.consentVersion !== SCREEN_CONSENT_VERSION)
    return deny('consent-required');
  if (
    data.requestProviderId !== data.selectedProviderId ||
    data.requestAccountId !== data.selectedAccountId
  )
    return deny('destination-changed');
  if (
    data.consentProviderId !== data.selectedProviderId ||
    data.consentAccountId !== data.selectedAccountId
  )
    return deny('consent-mismatch');
  if (!data.providerAuthorized) return deny('provider-unauthorized');
  if (!data.visionSupported) return deny('vision-unsupported');
  if (data.requestedTargetId !== data.currentTargetId)
    return deny('target-changed');
  if (!data.targetAllowed) return deny('target-blocked');
  if (!data.permissionGranted) return deny('permission-denied');
  return { eligible: true, reason: 'prerequisites-met' };
}
