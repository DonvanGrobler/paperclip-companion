import { SCREEN_CONSENT_VERSION } from '../core/screen-authorization';

/** Main-owned opaque handles; never provider-native IDs, labels, tokens or URLs. */
export interface ScreenConsentDestination {
  providerId: string;
  accountId: string;
  authorizationId: string;
  disclosureVersion: number;
}
export type ScreenConsentPresentation = Readonly<ScreenConsentDestination>;
export type ScreenConsentGrant = Readonly<
  ScreenConsentDestination & { signal: AbortSignal }
>;

function parseDestination(value: unknown): ScreenConsentDestination | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== 4) return null;
    const data: Record<string, unknown> = {};
    for (const key of [
      'providerId',
      'accountId',
      'authorizationId',
      'disclosureVersion',
    ]) {
      const descriptor = descriptors[key];
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
      const field: unknown = descriptor.value;
      if (key === 'disclosureVersion') {
        if (field !== SCREEN_CONSENT_VERSION) return null;
      } else if (
        typeof field !== 'string' ||
        !field.length ||
        field.length > 128 ||
        /[^A-Za-z0-9_-]/.test(field)
      )
        return null;
      data[key] = field;
    }
    return data as unknown as ScreenConsentDestination;
  } catch {
    return null;
  }
}

/**
 * Unwired consent lifecycle, not an IPC API or capture/transmission permit.
 * Trusted main code owns destination facts and the explicit user-choice adapter.
 * Recheck isCurrent after every await and immediately before a side effect,
 * together with the independent request/target/exclusion/capability policy.
 */
export function createScreenConsent() {
  let destination: ScreenConsentDestination | null = null;
  let presentation: ScreenConsentPresentation | null = null;
  let grant: ScreenConsentGrant | null = null;
  let controller: AbortController | null = null;
  let changing = false;
  let disposed = false;

  const invalidate = () => {
    const previous = controller;
    presentation = null;
    grant = null;
    controller = null;
    // Drop authority before synchronous abort listeners can observe/reenter us.
    previous?.abort();
  };

  return Object.freeze({
    /** Null is disconnect. Invalid/unsupported context also revokes, returning false. */
    updateDestination(value: unknown): boolean {
      if (disposed || changing) return false;
      changing = true;
      try {
        const next = value === null ? null : parseDestination(value);
        // A reflective trap may have disposed the owner while parsing.
        if (disposed) return false;
        const same =
          destination === null
            ? next === null
            : next !== null &&
              destination.providerId === next.providerId &&
              destination.accountId === next.accountId &&
              destination.authorizationId === next.authorizationId &&
              destination.disclosureVersion === next.disclosureVersion;
        if (!same) {
          destination = next;
          invalidate();
        }
        return !disposed && (value === null || next !== null);
      } finally {
        changing = false;
      }
    },
    /** Latest presentation replaces any older unaccepted choice; no I/O. */
    present(): ScreenConsentPresentation | null {
      if (disposed || changing || !destination || grant) return null;
      presentation = Object.freeze({ ...destination });
      return presentation;
    },
    /** Only a trusted explicit affirmative choice may call this; identity is not a gesture proof. */
    accept(value: unknown): ScreenConsentGrant | null {
      if (
        disposed ||
        changing ||
        !destination ||
        !presentation ||
        value !== presentation
      )
        return null;
      controller = new AbortController();
      grant = Object.freeze({ ...destination, signal: controller.signal });
      presentation = null;
      return grant;
    },
    current(): ScreenConsentGrant | null {
      return disposed || changing ? null : grant;
    },
    /** Object identity detects switch-away/back and renewed consent for the same account. */
    isCurrent(value: unknown): boolean {
      return !disposed && !changing && grant !== null && value === grant;
    },
    withdraw(): void {
      if (disposed) return;
      const wasChanging = changing;
      changing = true;
      try {
        invalidate();
      } finally {
        changing = wasChanging;
      }
    },
    dispose(): void {
      if (disposed) return;
      disposed = true;
      destination = null;
      invalidate();
    },
  });
}
