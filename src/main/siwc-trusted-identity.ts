import {
  createSiwcIdentityVerifier,
  readSiwcIdentityInput,
  type SiwcVerifiedIdentity,
} from './siwc-identity-verifier';
import {
  fetchSiwcPublicJson,
  type SiwcPublicJsonTransport,
} from './siwc-public-json';

const ISSUER = 'https://auth.openai.com';
const DISCOVERY = `${ISSUER}/.well-known/openid-configuration`;
const JWKS = `${ISSUER}/.well-known/jwks.json`;
function document(value: unknown) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (Reflect.ownKeys(value).length !== 2) return null;
  const body = Object.getOwnPropertyDescriptor(value, 'body');
  const cache = Object.getOwnPropertyDescriptor(value, 'cacheMs');
  if (
    !body ||
    !Object.hasOwn(body, 'value') ||
    !cache ||
    !Object.hasOwn(cache, 'value') ||
    typeof body.value !== 'string' ||
    body.value.length > 65536 ||
    Buffer.byteLength(body.value) > 65536 ||
    typeof cache.value !== 'number' ||
    !Number.isInteger(cache.value) ||
    cache.value < 0 ||
    cache.value > 300000
  )
    return null;
  return { body: body.value as string, cacheMs: cache.value as number };
}
function discovery(body: string): boolean {
  const value: unknown = JSON.parse(body);
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const data = value as Record<string, unknown>;
  if (
    ![
      'issuer',
      'authorization_endpoint',
      'token_endpoint',
      'jwks_uri',
      'id_token_signing_alg_values_supported',
    ].every((key) => Object.hasOwn(data, key))
  )
    return false;
  const algorithms = data.id_token_signing_alg_values_supported;
  return (
    data.issuer === ISSUER &&
    data.authorization_endpoint === `${ISSUER}/api/accounts/authorize` &&
    data.token_endpoint === `${ISSUER}/api/accounts/oauth/token` &&
    data.jwks_uri === JWKS &&
    Array.isArray(algorithms) &&
    algorithms.length <= 16 &&
    algorithms.every(
      (a) => typeof a === 'string' && /^[A-Za-z0-9_-]{1,32}$/.test(a),
    ) &&
    algorithms.includes('RS256')
  );
}
interface Keys {
  verifier: ReturnType<typeof createSiwcIdentityVerifier>;
  kids: Set<string>;
  until: number;
}
interface Work {
  version: number;
  deadline: number;
  controller: AbortController;
  keys: Keys | null;
  finish: (value: Readonly<SiwcVerifiedIdentity> | null) => void;
}

/** Unwired main-only fixed-issuer verification. Never a session, inference or capture grant. */
export function createSiwcTrustedIdentityVerifier(
  transport: SiwcPublicJsonTransport = fetchSiwcPublicJson,
) {
  let cache: Keys | null = null;
  let active: Work | null = null;
  let version = 0;
  let disposed = false;
  let changing = false;
  let lastFetch = -Infinity;
  let highWater = 0;
  function clearCache() {
    cache?.verifier.dispose();
    cache = null;
  }
  function now(): number | null {
    const value = performance.now();
    if (
      !Number.isFinite(value) ||
      value < highWater ||
      value > Number.MAX_SAFE_INTEGER - 300000
    ) {
      clearCache();
      return null;
    }
    highWater = value;
    return value;
  }
  function activeTime(work: Work): number | null {
    const time = now();
    return !disposed &&
      active === work &&
      version === work.version &&
      !work.controller.signal.aborted &&
      time !== null &&
      time < work.deadline
      ? time
      : null;
  }
  function invalidate() {
    version++;
    clearCache();
    active?.finish(null);
  }
  return Object.freeze({
    verify(
      token: unknown,
      expected: unknown,
      signal: AbortSignal,
    ): Promise<Readonly<SiwcVerifiedIdentity> | null> {
      const started = now();
      if (disposed || changing || active || signal.aborted || started === null)
        return Promise.resolve(null);
      return new Promise((resolve) => {
        let done = false;
        const stop = () => work.finish(null);
        const work: Work = {
          version,
          deadline: started + 5000,
          controller: new AbortController(),
          keys: null,
          finish(value) {
            if (done) return;
            done = true;
            if (active === work) active = null;
            clearTimeout(timer);
            signal.removeEventListener('abort', stop);
            const previous = changing;
            changing = true;
            work.controller.abort();
            if (work.keys !== cache) work.keys?.verifier.dispose();
            const time = now();
            const valid =
              !disposed &&
              version === work.version &&
              !signal.aborted &&
              time !== null &&
              time < work.deadline &&
              work.keys !== null &&
              time < work.keys.until;
            changing = previous;
            resolve(valid ? value : null);
          },
        };
        active = work; // Reserve before reflective context inspection or trusted hooks.
        const timer = setTimeout(stop, 5000);
        signal.addEventListener('abort', stop, { once: true });
        async function execute() {
          try {
            const input = readSiwcIdentityInput(token, expected);
            token = expected = undefined;
            if (!input) return;
            const time = activeTime(work);
            if (time === null) return;
            let keys = cache;
            if (!keys || time >= keys.until || !keys.kids.has(input.kid)) {
              if (time - lastFetch < 30000) return;
              clearCache();
              lastFetch = time; // Failed/cancelled attempts also consume the request budget.
              const metadata = document(
                await transport(DISCOVERY, work.controller.signal),
              );
              if (
                activeTime(work) === null ||
                !metadata ||
                !discovery(metadata.body) ||
                activeTime(work) === null
              )
                return;
              const publicKeys = document(
                await transport(JWKS, work.controller.signal),
              );
              if (activeTime(work) === null || !publicKeys) return;
              const verifier = createSiwcIdentityVerifier(null);
              keys = { verifier, kids: new Set(), until: 0 };
              work.keys = keys;
              if (
                !verifier.replaceKeys(publicKeys.body) ||
                activeTime(work) === null
              )
                return;
              const body = JSON.parse(publicKeys.body) as {
                keys: { kid: string }[];
              };
              keys.kids = new Set(body.keys.map((key) => key.kid));
              const ttl = Math.min(metadata.cacheMs, publicKeys.cacheMs);
              keys.until = ttl === 0 ? work.deadline : time + ttl;
              const completed = activeTime(work);
              if (completed === null || completed >= keys.until) return;
              if (ttl > 0) cache = keys;
            }
            work.keys = keys;
            if (!keys.kids.has(input.kid)) return;
            const identity = await keys.verifier.verify(
              input.token,
              input.expected,
              work.controller.signal,
            );
            if (activeTime(work) !== null) work.finish(identity);
          } catch {
            /* Fixed null outcome only; never expose transport/crypto inputs or errors. */
          } finally {
            work.finish(null);
          }
        }
        void execute();
      });
    },
    invalidate,
    dispose() {
      disposed = true;
      invalidate();
    },
  });
}
