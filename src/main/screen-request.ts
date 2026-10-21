import {
  MAX_IMAGE_BYTES,
  MAX_PROMPT_LENGTH,
  type ChatInput,
} from '../core/provider';
import {
  evaluateScreenAuthorization,
  type ScreenAuthorizationReason,
} from '../core/screen-authorization';
import {
  classifyScreenIntent,
  type ScreenIntentReason,
} from '../core/screen-intent';
import type { createScreenConsent } from './screen-consent';

export interface ScreenRequestPolicy {
  providerId: string;
  accountId: string;
  authorizationId: string;
  targetId: string;
  policyId: string;
  hardExcluded: boolean;
  neverIncludeScreen: boolean;
  providerAuthorized: boolean;
  visionSupported: boolean;
  targetAllowed: boolean;
  permissionGranted: boolean;
}
export type ScreenRequestTicket = Readonly<
  Pick<
    ScreenRequestPolicy,
    'providerId' | 'accountId' | 'authorizationId' | 'targetId' | 'policyId'
  > & { run: number }
>;
export type ScreenRequestFailure =
  | ScreenAuthorizationReason
  | 'unavailable'
  | 'disposed'
  | 'timeout'
  | 'policy-unavailable'
  | 'policy-changed'
  | 'capture-failed'
  | 'invalid-capture'
  | 'dispatch-failed';
export type ScreenRequestResult =
  | { status: 'sent' }
  | { status: 'text-only'; reason: ScreenIntentReason }
  | {
      status: 'stopped';
      reason: ScreenRequestFailure;
      dispatchStarted: boolean;
    };
export interface ScreenRequestHooks {
  consent: Pick<
    ReturnType<typeof createScreenConsent>,
    'current' | 'isCurrent'
  >;
  readPolicy: () => unknown;
  capture: (
    ticket: ScreenRequestTicket,
    signal: AbortSignal,
  ) => Promise<unknown>;
  dispatch: (
    ticket: ScreenRequestTicket,
    input: ChatInput,
    signal: AbortSignal,
  ) => Promise<void>;
  timeoutMs?: number;
}

const ids = [
  'providerId',
  'accountId',
  'authorizationId',
  'targetId',
  'policyId',
] as const;
const flags = [
  'hardExcluded',
  'neverIncludeScreen',
  'providerAuthorized',
  'visionSupported',
  'targetAllowed',
  'permissionGranted',
] as const;
const isId = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
const isRun = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value > 0;

/** Copy own data fields only; never invoke getters or echo reflective exceptions. */
function dataRecord(value: unknown, keys: readonly string[]) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const descriptors = Object.getOwnPropertyDescriptors(value);
    if (Reflect.ownKeys(descriptors).length !== keys.length) return null;
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const descriptor = descriptors[key];
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}

/** Capture transfers this view exclusively, even when the other fields are invalid. */
function ownedBytes(value: unknown): Uint8Array | null {
  try {
    if (!value || typeof value !== 'object') return null;
    const bytes: unknown = Object.getOwnPropertyDescriptor(
      value,
      'bytes',
    )?.value;
    return bytes instanceof Uint8Array && bytes.buffer instanceof ArrayBuffer
      ? bytes
      : null;
  } catch {
    return null;
  }
}
function clear(bytes: Uint8Array | null) {
  if (!bytes) return;
  try {
    Uint8Array.prototype.fill.call(bytes, 0);
  } catch {
    /* Detached storage has no accessible view. */
  }
}
const stopped = (
  reason: ScreenRequestFailure,
  dispatchStarted = false,
): ScreenRequestResult => ({ status: 'stopped', reason, dispatchStarted });
interface Active {
  run: number;
  reason: ScreenRequestFailure | null;
  dispatchStarted: boolean;
  stop: (reason: ScreenRequestFailure) => void;
}

/**
 * Unwired, trusted main-only hooks. No renderer facts or production capture here.
 * Snapshot/ticket validation proves correlation, not native identity or user intent provenance.
 * Adapters must pin this ticket's destination/target and revalidate before side
 * effects after their own awaits. Dispatch borrows bytes until its promise settles.
 */
export function createScreenRequest({
  consent,
  readPolicy,
  capture,
  dispatch,
  timeoutMs = 5000,
}: ScreenRequestHooks) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
    throw new Error('Invalid screen request deadline');
  let active: Active | null = null;
  let lastRun = 0;
  let disposed = false;
  function policySnapshot(): ScreenRequestPolicy | null {
    try {
      const data = dataRecord(readPolicy(), [...ids, ...flags]);
      if (
        !data ||
        ids.some((key) => !isId(data[key])) ||
        flags.some((key) => typeof data[key] !== 'boolean')
      )
        return null;
      return data as unknown as ScreenRequestPolicy;
    } catch {
      return null;
    }
  }
  return Object.freeze({
    run(value: unknown): Promise<ScreenRequestResult> {
      if (disposed) return Promise.resolve(stopped('disposed'));
      if (active) return Promise.resolve(stopped('unavailable'));
      return new Promise((resolve) => {
        let timer: ReturnType<typeof setTimeout> | undefined;
        let settled = false;
        const settle = (result: ScreenRequestResult) => {
          if (settled) return;
          settled = true;
          resolve(result);
        };
        const controller = new AbortController();
        const work: Active = {
          run: 0,
          reason: null,
          dispatchStarted: false,
          stop(reason) {
            if (work.reason) return;
            work.reason = reason;
            clearTimeout(timer);
            settle(stopped(reason, work.dispatchStarted));
            controller.abort();
          },
        };
        // Reserve before parsing/callbacks, including reflective reentrancy.
        active = work;
        async function execute(): Promise<ScreenRequestResult> {
          let consentSignal: AbortSignal | undefined;
          let source: Uint8Array | null = null;
          let image: Uint8Array | null = null;
          let phase: ScreenRequestFailure = 'policy-unavailable';
          const revoked = () => work.stop('consent-required');
          try {
            const request = dataRecord(value, [
              'run',
              'prompt',
              'includeScreen',
            ]);
            if (work.reason) return stopped(work.reason);
            if (
              !request ||
              !isRun(request.run) ||
              typeof request.prompt !== 'string' ||
              !request.prompt.trim() ||
              request.prompt.length > MAX_PROMPT_LENGTH ||
              typeof request.includeScreen !== 'boolean'
            )
              return stopped('invalid-input');
            if (request.run <= lastRun) return stopped('stale-request');
            work.run = request.run;
            lastRun = request.run; // Every valid attempt is consumed; retry needs a new submitted run.
            timer = setTimeout(() => work.stop('timeout'), timeoutMs);
            const initial = policySnapshot();
            if (work.reason) return stopped(work.reason);
            if (!initial) return stopped('policy-unavailable');
            const intent = classifyScreenIntent({
              prompt: request.prompt,
              submitted: true,
              hardExcluded: initial.hardExcluded,
              neverIncludeScreen: initial.neverIncludeScreen,
              includeScreen: request.includeScreen,
            });
            if (intent.kind === 'text-only')
              return { status: 'text-only', reason: intent.reason };
            const grant = consent.current();
            if (!grant) return stopped('consent-required');
            consentSignal = grant.signal;
            consentSignal.addEventListener('abort', revoked, { once: true });
            const ticket: ScreenRequestTicket = Object.freeze({
              run: work.run,
              providerId: initial.providerId,
              accountId: initial.accountId,
              authorizationId: initial.authorizationId,
              targetId: initial.targetId,
              policyId: initial.policyId,
            });
            function check(): ScreenRequestFailure | null {
              if (work.reason) return work.reason;
              const current = policySnapshot();
              if (work.reason) return work.reason;
              if (!current) return 'policy-unavailable';
              if (!consent.isCurrent(grant) || grant!.signal.aborted)
                return 'consent-required';
              const requestId = `request-${ticket.run}`;
              const decision = evaluateScreenAuthorization({
                requestId,
                activeRequestId: requestId,
                submitted: true,
                cancelled: false,
                requestConsumed: false,
                screenRequested: true,
                hardExcluded: current.hardExcluded,
                neverIncludeScreen: current.neverIncludeScreen,
                consentGranted: true,
                consentVersion: grant!.disclosureVersion,
                consentProviderId: grant!.providerId,
                consentAccountId: grant!.accountId,
                requestProviderId: ticket.providerId,
                requestAccountId: ticket.accountId,
                selectedProviderId: current.providerId,
                selectedAccountId: current.accountId,
                providerAuthorized: current.providerAuthorized,
                visionSupported: current.visionSupported,
                requestedTargetId: ticket.targetId,
                currentTargetId: current.targetId,
                targetAllowed: current.targetAllowed,
                permissionGranted: current.permissionGranted,
              });
              if (!decision.eligible) return decision.reason;
              return current.authorizationId !== grant!.authorizationId ||
                current.authorizationId !== ticket.authorizationId ||
                current.policyId !== ticket.policyId
                ? 'policy-changed'
                : null;
            }
            const beforeCapture = check();
            if (beforeCapture) return stopped(beforeCapture);
            phase = 'capture-failed';
            const captured = await capture(ticket, controller.signal);
            source = ownedBytes(captured);
            if (work.reason) return stopped(work.reason);
            const data = dataRecord(captured, ['ticket', 'mimeType', 'bytes']);
            if (
              !data ||
              data.ticket !== ticket ||
              data.mimeType !== 'image/png' ||
              !source ||
              data.bytes !== source ||
              source.byteLength < 1 ||
              source.byteLength > MAX_IMAGE_BYTES
            )
              return stopped('invalid-capture');
            image = new Uint8Array(source);
            clear(source);
            source = null;
            const beforeDispatch = check();
            if (beforeDispatch) return stopped(beforeDispatch);
            work.dispatchStarted = true; // Atomic reservation before any dispatch callback/reentry.
            phase = 'dispatch-failed';
            await dispatch(
              ticket,
              {
                prompt: request.prompt.trim(),
                screenshot: { mimeType: 'image/png', bytes: image },
              },
              controller.signal,
            );
            return work.reason
              ? stopped(work.reason, true)
              : { status: 'sent' };
          } catch {
            return stopped(work.reason ?? phase, work.dispatchStarted);
          } finally {
            clear(source);
            clear(image);
            clearTimeout(timer);
            consentSignal?.removeEventListener('abort', revoked);
            if (active === work) active = null;
          }
        }
        void execute().then(settle);
      });
    },
    cancel(run: unknown): boolean {
      if (!isRun(run) || !active || active.run !== run || active.reason)
        return false;
      active.stop('cancelled');
      return true;
    },
    /** Owning registry must call on observed policy/target changes, even if later restored. */
    invalidate(): void {
      active?.stop('policy-changed');
    },
    dispose(): void {
      disposed = true;
      active?.stop('disposed');
    },
  });
}
