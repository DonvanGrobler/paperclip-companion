import {
  createHash,
  randomBytes,
  randomUUID,
  timingSafeEqual,
} from 'node:crypto';

export interface SiwcIdentity {
  issuer: string;
  subject: string;
}
export interface SiwcAccount extends SiwcIdentity {
  clientId: string;
}
export type SiwcAuthorization = Readonly<
  SiwcAccount & {
    authorizationId: string;
    inferenceAllowed: boolean;
    signal: AbortSignal;
  }
>;
export interface SiwcCodeExchange {
  endpoint: string;
  clientId: string;
  code: string;
  codeVerifier: string;
  redirectUri: string;
  resource: string;
}
export interface SiwcIdentityExpectation {
  issuer: string;
  audience: string;
  nonce: string;
}
export interface SiwcCredentialRecord extends SiwcAccount {
  hostId: string;
  accessToken: string | null;
  refreshToken: string | null;
  idToken: string;
  scopes: readonly string[];
  expiresAt: number | null;
}
export interface SiwcPreparedCredentials {
  /** Synchronous, atomic installation only. False/throw must leave the old record intact. */
  commit: () => boolean;
  /** Release staging only, including after commit; must not delete the installed record. */
  discard: () => void;
}
export interface SiwcAuthHooks {
  hostId: string;
  openAuthorization: (url: string, signal: AbortSignal) => Promise<void>;
  /** Synchronous durable nonsecret registration retention before code exchange. */
  retainRegistration: (
    registration: Readonly<{ hostId: string; clientId: string }>,
    signal: AbortSignal,
  ) => boolean;
  exchange: (
    request: Readonly<SiwcCodeExchange>,
    signal: AbortSignal,
  ) => Promise<unknown>;
  verifyIdentity: (
    idToken: string,
    expected: Readonly<SiwcIdentityExpectation>,
    signal: AbortSignal,
  ) => Promise<unknown>;
  prepareCredentials: (
    record: Readonly<SiwcCredentialRecord>,
    signal: AbortSignal,
  ) => Promise<SiwcPreparedCredentials>;
  timeoutMs?: number;
}
export type SiwcAuthFailure =
  | 'unavailable'
  | 'disposed'
  | 'invalid-input'
  | 'invalid-callback'
  | 'authorization-denied'
  | 'authorization-failed'
  | 'browser-failed'
  | 'registration-commit-failed'
  | 'exchange-failed'
  | 'invalid-grant'
  | 'verification-failed'
  | 'protected-commit-failed'
  | 'cancelled'
  | 'timeout'
  | 'context-changed';
export type SiwcAuthOutcome =
  | { status: 'authenticated'; inferenceAllowed: boolean }
  | { status: 'stopped'; reason: SiwcAuthFailure };

const ISSUER = 'https://auth.openai.com';
const RESOURCE = 'https://api.openai.com/v1';
const BOOTSTRAP = 'dynamic_agent_client';
const SCOPES =
  'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const stopped = (reason: SiwcAuthFailure): SiwcAuthOutcome => ({
  status: 'stopped',
  reason,
});
const boundedText = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= max &&
  /^[\x21-\x7e]+$/.test(value);
const isClientId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[A-Za-z0-9._-]{1,128}$/.test(value) &&
  value !== BOOTSTRAP;

/** Narrow local adapter records, not raw provider JSON. No accessors/coercion or private errors. */
function dataRecord(
  value: unknown,
  keys: readonly string[],
  optionalKeys: readonly string[] = [],
): Record<string, unknown> | null {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    const ownKeys = Reflect.ownKeys(value);
    const fields = [
      ...keys,
      ...optionalKeys.filter((key) => ownKeys.includes(key)),
    ];
    if (ownKeys.length !== fields.length) return null;
    const result: Record<string, unknown> = {};
    for (const key of fields) {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor || !Object.hasOwn(descriptor, 'value')) return null;
      result[key] = descriptor.value;
    }
    return result;
  } catch {
    return null;
  }
}
interface Context {
  redirectUri: string;
  account: Readonly<SiwcAccount> | null;
  clientId: string | null;
  idTokenHint: string | null;
}
function parseContext(value: unknown): Context | null {
  const data = dataRecord(value, ['redirectUri', 'account'], ['registration']);
  if (!data || typeof data.redirectUri !== 'string') return null;
  const port = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/auth\/callback$/.exec(
    data.redirectUri,
  )?.[1];
  if (!port || Number(port) > 65535) return null;
  let account: SiwcAccount | null = null;
  if (data.account !== null) {
    const selected = dataRecord(data.account, [
      'clientId',
      'issuer',
      'subject',
    ]);
    if (
      !selected ||
      !isClientId(selected.clientId) ||
      selected.issuer !== ISSUER ||
      !boundedText(selected.subject, 255)
    )
      return null;
    account = {
      clientId: selected.clientId,
      issuer: ISSUER,
      subject: selected.subject,
    };
  }
  let clientId = account?.clientId ?? null;
  let idTokenHint: string | null = null;
  if (Object.hasOwn(data, 'registration')) {
    const registration = dataRecord(data.registration, [
      'clientId',
      'idTokenHint',
    ]);
    if (
      !registration ||
      !isClientId(registration.clientId) ||
      (account && registration.clientId !== account.clientId)
    )
      return null;
    clientId = registration.clientId;
    if (registration.idTokenHint !== null) {
      const hint = dataRecord(registration.idTokenHint, [
        'issuer',
        'subject',
        'clientId',
        'idToken',
      ]);
      if (
        !account ||
        !hint ||
        hint.issuer !== account.issuer ||
        hint.subject !== account.subject ||
        hint.clientId !== clientId ||
        !boundedText(hint.idToken, 16384)
      )
        return null;
      idTokenHint = hint.idToken;
    }
  }
  return {
    redirectUri: data.redirectUri,
    account: account && Object.freeze(account),
    clientId,
    idTokenHint,
  };
}
interface Proof {
  state: string;
  nonce: string;
  verifier: string;
}
interface Callback {
  code: string;
  clientId: string;
}
function matchesProof(value: unknown, expected: string): boolean {
  return (
    typeof value === 'string' &&
    /^[A-Za-z0-9_-]{43}$/.test(value) &&
    timingSafeEqual(Buffer.from(value), Buffer.from(expected))
  );
}
function parseCallback(
  value: unknown,
  context: Context,
  proof: Proof,
): Callback | SiwcAuthFailure {
  if (
    typeof value !== 'string' ||
    value.length > 16384 ||
    !value.startsWith(`${context.redirectUri}?`) ||
    /[^\x21-\x7e]|#/.test(value) ||
    /%(?![0-9A-Fa-f]{2})/.test(value)
  )
    return 'invalid-callback';
  const url = new URL(value);
  if (url.hash) return 'invalid-callback';
  const params = url.searchParams;
  const allowed = [
    'state',
    'code',
    'client_id',
    'scope',
    'error',
    'error_description',
    'error_uri',
  ];
  for (const [key, field] of params) {
    if (
      !allowed.includes(key) ||
      params.getAll(key).length !== 1 ||
      field.length > 4096
    )
      return 'invalid-callback';
  }
  if (!matchesProof(params.get('state'), proof.state))
    return 'invalid-callback';
  if (params.has('error')) {
    if (params.has('code') || !boundedText(params.get('error'), 128))
      return 'invalid-callback';
    return params.get('error') === 'access_denied'
      ? 'authorization-denied'
      : 'authorization-failed';
  }
  if (params.has('error_description') || params.has('error_uri'))
    return 'invalid-callback';
  const code = params.get('code');
  const returnedId = params.get('client_id');
  const clientId = returnedId ?? context.clientId;
  if (
    !boundedText(code, 4096) ||
    !isClientId(clientId) ||
    (context.clientId !== null && context.clientId !== clientId)
  )
    return 'invalid-callback';
  return { code, clientId };
}
function parseGrant(value: unknown) {
  const data = dataRecord(value, [
    'access_token',
    'refresh_token',
    'id_token',
    'token_type',
    'expires_in',
    'scope',
  ]);
  if (
    !data ||
    (data.access_token !== null && !boundedText(data.access_token, 16384)) ||
    (data.refresh_token !== null && !boundedText(data.refresh_token, 16384)) ||
    !boundedText(data.id_token, 16384) ||
    (data.access_token === null
      ? data.token_type !== null && data.token_type !== 'Bearer'
      : data.token_type !== 'Bearer') ||
    (data.access_token === null
      ? data.expires_in !== null
      : typeof data.expires_in !== 'number' ||
        !Number.isInteger(data.expires_in) ||
        data.expires_in < 1 ||
        data.expires_in > 86400) ||
    typeof data.scope !== 'string' ||
    data.scope.length > 4096 ||
    !/^(?:[\x21\x23-\x5b\x5d-\x7e]+(?: [\x21\x23-\x5b\x5d-\x7e]+)*)?$/.test(
      data.scope,
    )
  )
    return null;
  const scopes = Object.freeze([
    ...new Set(data.scope ? data.scope.split(' ') : []),
  ]);
  if (
    scopes.includes('resource.invoke') &&
    scopes.includes('chatgpt.tokens.use.direct') &&
    data.access_token === null
  )
    return null;
  return {
    accessToken: data.access_token,
    refreshToken: data.refresh_token,
    idToken: data.id_token,
    scopes,
    expiresAt:
      data.access_token === null
        ? null
        : Date.now() + (data.expires_in as number) * 1000,
  };
}
function parseIdentity(
  value: unknown,
  expected: SiwcIdentityExpectation,
): SiwcIdentity | null {
  const data = dataRecord(value, [
    'issuer',
    'subject',
    'audience',
    'nonce',
    'expiresAt',
  ]);
  return data &&
    data.issuer === expected.issuer &&
    boundedText(data.subject, 255) &&
    data.audience === expected.audience &&
    matchesProof(data.nonce, expected.nonce) &&
    typeof data.expiresAt === 'number' &&
    Number.isSafeInteger(data.expiresAt) &&
    data.expiresAt > Date.now()
    ? { issuer: data.issuer, subject: data.subject }
    : null;
}
function preparedRecord(value: unknown): SiwcPreparedCredentials | null {
  const data = dataRecord(value, ['commit', 'discard']);
  return data &&
    typeof data.commit === 'function' &&
    typeof data.discard === 'function'
    ? (data as unknown as SiwcPreparedCredentials)
    : null;
}
interface Active {
  context: Context | null;
  proof: Proof | null;
  callback: Callback | null;
  claimed: boolean;
  committing: boolean;
  deadline: number;
  controller: AbortController;
  notify: () => void;
  finish: (outcome: SiwcAuthOutcome) => void;
}

/**
 * Unwired main-only contract. All capabilities are trusted and must bound/abort
 * their own borrowed private data; no listener, actual verification or storage here.
 * Async preparation MUST NOT install. commit() is synchronous/atomic: entering it
 * linearizes before later cancellation. Invalidation still revokes memory authority;
 * it is not logout or credential deletion. Production adapters need separate review.
 */
export function createSiwcAuthTransaction({
  hostId,
  openAuthorization,
  retainRegistration,
  exchange,
  verifyIdentity,
  prepareCredentials,
  timeoutMs = 120000,
}: SiwcAuthHooks) {
  if (
    typeof hostId !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(hostId) ||
    typeof retainRegistration !== 'function' ||
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 300000
  )
    throw new Error('Invalid sign-in configuration');
  let active: Active | null = null;
  let authorization: SiwcAuthorization | null = null;
  let authorizationController: AbortController | null = null;
  let changing = false;
  let disposed = false;
  function critical(action: () => void) {
    const before = changing;
    changing = true;
    try {
      action();
    } finally {
      changing = before;
    }
  }
  function alive(work: Active): boolean {
    if (disposed || active !== work || work.controller.signal.aborted)
      return false;
    if (!work.committing && performance.now() >= work.deadline) {
      work.finish(stopped('timeout'));
      return false;
    }
    return true;
  }
  function invalidate(reason: SiwcAuthFailure) {
    critical(() => {
      const previous = authorizationController;
      authorization = null;
      authorizationController = null;
      active?.finish(stopped(reason));
      previous?.abort();
    });
  }
  return Object.freeze({
    /** Caller has already prepared the exact loopback listener; no listener is created here. */
    begin(value: unknown): Promise<SiwcAuthOutcome> {
      if (disposed) return Promise.resolve(stopped('disposed'));
      if (changing || active) return Promise.resolve(stopped('unavailable'));
      return new Promise((resolve) => {
        let done = false;
        let timer: ReturnType<typeof setTimeout> | undefined;
        let notify!: () => void;
        const received = new Promise<void>((yes) => {
          notify = yes;
        });
        const work: Active = {
          context: null,
          proof: null,
          callback: null,
          claimed: false,
          committing: false,
          deadline: Infinity,
          controller: new AbortController(),
          notify,
          finish(outcome) {
            if (done) return;
            done = true;
            critical(() => {
              if (active === work) active = null;
              clearTimeout(timer);
              work.context = null;
              work.proof = null;
              work.callback = null;
              work.notify();
              resolve(outcome);
              work.controller.abort();
            });
          },
        };
        active = work; // Reserve before reflective input inspection or any trusted hook.
        async function execute() {
          let phase: SiwcAuthFailure = 'invalid-input';
          let prepared: SiwcPreparedCredentials | null = null;
          try {
            const context = parseContext(value);
            value = undefined;
            if (!alive(work)) return;
            if (!context) {
              work.finish(stopped('invalid-input'));
              return;
            }
            work.context = context;
            work.deadline = performance.now() + timeoutMs;
            timer = setTimeout(
              () => work.finish(stopped('timeout')),
              timeoutMs,
            );
            phase = 'browser-failed';
            const fresh = () => randomBytes(32).toString('base64url');
            work.proof = { state: fresh(), nonce: fresh(), verifier: fresh() };
            const url = new URL(`${ISSUER}/api/accounts/authorize`);
            url.search = new URLSearchParams({
              client_id: context.clientId ?? BOOTSTRAP,
              ext_agent_host_id: hostId,
              response_type: 'code',
              redirect_uri: context.redirectUri,
              scope: SCOPES,
              resource: RESOURCE,
              state: work.proof.state,
              nonce: work.proof.nonce,
              code_challenge_method: 'S256',
              code_challenge: createHash('sha256')
                .update(work.proof.verifier)
                .digest('base64url'),
            }).toString();
            if (context.clientId === null)
              url.searchParams.set('agent_name_hint', 'Paperclip Companion');
            if (context.idTokenHint !== null)
              url.searchParams.set('id_token_hint', context.idTokenHint);
            await openAuthorization(url.href, work.controller.signal);
            if (!alive(work)) return;
            await received;
            if (!alive(work)) return;
            const callback = work.callback!;
            const proof = work.proof!;
            work.callback = null;
            phase = 'registration-commit-failed';
            const retained = retainRegistration(
              Object.freeze({ hostId, clientId: callback.clientId }),
              work.controller.signal,
            );
            if (!alive(work)) return;
            if (retained !== true) {
              work.finish(stopped('registration-commit-failed'));
              return;
            }
            phase = 'exchange-failed';
            const response = await exchange(
              Object.freeze({
                endpoint: `${ISSUER}/api/accounts/oauth/token`,
                clientId: callback.clientId,
                code: callback.code,
                codeVerifier: proof.verifier,
                redirectUri: context.redirectUri,
                resource: RESOURCE,
              }),
              work.controller.signal,
            );
            if (!alive(work)) return;
            const grant = parseGrant(response);
            if (!alive(work)) return;
            if (!grant) {
              work.finish(stopped('invalid-grant'));
              return;
            }
            phase = 'verification-failed';
            const expected = Object.freeze({
              issuer: ISSUER,
              audience: callback.clientId,
              nonce: proof.nonce,
            });
            const verified = await verifyIdentity(
              grant.idToken,
              expected,
              work.controller.signal,
            );
            if (!alive(work)) return;
            const identity = parseIdentity(verified, expected);
            if (!alive(work)) return;
            if (
              !identity ||
              (context.account &&
                (context.account.issuer !== identity.issuer ||
                  context.account.subject !== identity.subject))
            ) {
              work.finish(stopped('verification-failed'));
              return;
            }
            if (grant.expiresAt !== null && grant.expiresAt <= Date.now()) {
              work.finish(stopped('invalid-grant'));
              return;
            }
            const inferenceAllowed =
              grant.scopes.includes('resource.invoke') &&
              grant.scopes.includes('chatgpt.tokens.use.direct');
            const nextController = new AbortController();
            const next = Object.freeze({
              ...identity,
              clientId: callback.clientId,
              authorizationId: randomUUID(),
              inferenceAllowed,
              signal: nextController.signal,
            });
            const record = Object.freeze({
              ...identity,
              clientId: callback.clientId,
              hostId,
              ...grant,
            });
            phase = 'protected-commit-failed';
            const candidate = await prepareCredentials(
              record,
              work.controller.signal,
            );
            prepared = preparedRecord(candidate); // Inspect late staging only so it can be discarded.
            if (!alive(work)) return;
            if (
              !prepared ||
              (grant.expiresAt !== null && grant.expiresAt <= Date.now())
            ) {
              work.finish(stopped('protected-commit-failed'));
              return;
            }
            // No await between this generation check and synchronous atomic installation.
            // A cancellation before entry wins; cancel() after entry cannot undo a commit.
            work.committing = true;
            clearTimeout(timer);
            if (prepared.commit() !== true) {
              work.finish(stopped('protected-commit-failed'));
              return;
            }
            if (!alive(work)) return;
            critical(() => {
              const previous = authorizationController;
              authorization = next;
              authorizationController = nextController;
              work.finish({ status: 'authenticated', inferenceAllowed });
              previous?.abort();
            });
          } catch {
            work.finish(stopped(phase));
          } finally {
            const release = prepared;
            if (release)
              critical(() => {
                try {
                  release.discard();
                } catch {
                  /* Cleanup never exposes private errors or undoes commit. */
                }
              });
          }
        }
        void execute();
      });
    },
    /** Only the main-owned listener delivers a raw callback; consume at most once. */
    callback(value: unknown): boolean {
      const work = active;
      if (!work || work.claimed || !work.context || !work.proof || !alive(work))
        return false;
      work.claimed = true;
      try {
        const result = parseCallback(value, work.context, work.proof);
        if (typeof result === 'string') {
          work.finish(stopped(result));
          return false;
        }
        work.callback = result;
        work.notify();
        return true;
      } catch {
        work.finish(stopped('invalid-callback'));
        return false;
      }
    },
    current(): SiwcAuthorization | null {
      return disposed || changing ? null : authorization;
    },
    isCurrent(value: unknown): boolean {
      return (
        !disposed &&
        !changing &&
        authorization !== null &&
        value === authorization
      );
    },
    cancel(): boolean {
      if (!active || active.committing) return false;
      active.finish(stopped('cancelled'));
      return true;
    },
    /** Owning account registry calls even for switch-away/back; not logout or disk deletion. */
    invalidate(): void {
      invalidate('context-changed');
    },
    dispose(): void {
      disposed = true;
      invalidate('disposed');
    },
  });
}
