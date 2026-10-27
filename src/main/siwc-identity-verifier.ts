import { timingSafeEqual } from 'node:crypto';
import {
  createLocalJWKSet,
  decodeProtectedHeader,
  jwtVerify,
  type JWK,
} from 'jose';

export interface SiwcVerifiedIdentity {
  issuer: string;
  subject: string;
  audience: string;
  nonce: string;
  expiresAt: number;
}

const ISSUER = 'https://auth.openai.com';
const id = (value: unknown): value is string =>
  typeof value === 'string' && /^[A-Za-z0-9._-]{1,128}$/.test(value);
const numericDate = (value: unknown): value is number =>
  typeof value === 'number' &&
  Number.isSafeInteger(value) &&
  value > 0 &&
  value <= 8640000000000;
const clock = (value: number) =>
  Number.isSafeInteger(value) && value > 0 && value <= 8640000000000000;
function object(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}
function expectedContext(value: unknown) {
  try {
    if (!object(value)) return null;
    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) return null;
    if (Reflect.ownKeys(value).length !== 3) return null;
    const data: Record<string, unknown> = {};
    for (const field of ['issuer', 'audience', 'nonce']) {
      const d = Object.getOwnPropertyDescriptor(value, field);
      if (!d || !Object.hasOwn(d, 'value')) return null;
      data[field] = d.value;
    }
    if (
      data.issuer !== ISSUER ||
      !id(data.audience) ||
      data.audience === 'dynamic_agent_client' ||
      typeof data.nonce !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(data.nonce)
    )
      return null;
    return { issuer: ISSUER, audience: data.audience, nonce: data.nonce };
  } catch {
    return null;
  }
}
/** Trusted main-only normalized public snapshot, never keys taken from a JWT. */
function keySnapshot(value: unknown) {
  if (
    typeof value !== 'string' ||
    value.length > 65536 ||
    Buffer.byteLength(value) > 65536
  )
    return null;
  const data: unknown = JSON.parse(value);
  if (
    !object(data) ||
    Object.keys(data).length !== 1 ||
    !Object.hasOwn(data, 'keys') ||
    !Array.isArray(data.keys) ||
    data.keys.length < 1 ||
    data.keys.length > 8
  )
    return null;
  const seen = new Set<string>();
  const keys: JWK[] = [];
  for (const key of data.keys as unknown[]) {
    if (
      !object(key) ||
      !['kty', 'kid', 'alg', 'n', 'e'].every((k) => Object.hasOwn(key, k)) ||
      Object.keys(key).some(
        (k) => !['kty', 'kid', 'alg', 'use', 'key_ops', 'n', 'e'].includes(k),
      ) ||
      key.kty !== 'RSA' ||
      key.alg !== 'RS256' ||
      !id(key.kid) ||
      seen.has(key.kid) ||
      (key.use !== undefined && key.use !== 'sig') ||
      (key.key_ops !== undefined &&
        (!Array.isArray(key.key_ops) ||
          key.key_ops.length !== 1 ||
          key.key_ops[0] !== 'verify')) ||
      key.e !== 'AQAB' ||
      typeof key.n !== 'string' ||
      !/^[A-Za-z0-9_-]{342,683}$/.test(key.n)
    )
      return null;
    const modulus = Buffer.from(key.n, 'base64url');
    const bits = (modulus.length - 1) * 8 + (32 - Math.clz32(modulus[0]!));
    if (bits < 2048 || bits > 4096 || modulus.toString('base64url') !== key.n)
      return null;
    seen.add(key.kid);
    // Copy only bounded public fields. jose handles key import and signature math.
    keys.push({
      kty: 'RSA',
      alg: 'RS256',
      kid: key.kid,
      use: 'sig',
      key_ops: ['verify'],
      n: key.n,
      e: 'AQAB',
    });
  }
  return createLocalJWKSet({ keys });
}

/**
 * Unwired main-only verifier. Caller supplies trusted issuer-bound public keys.
 * RS256 is a provisional conservative profile, not a production metadata claim.
 * No remote resolver, URL lookup, cache, storage, diagnostics or account authority.
 * Native crypto cannot be forcibly interrupted; late results are discarded.
 */
export function createSiwcIdentityVerifier(initialKeys: unknown) {
  let resolver: ReturnType<typeof createLocalJWKSet> | null = null;
  let generation = 0;
  let disposed = false;
  function replaceKeys(value: unknown): boolean {
    if (disposed) return false;
    generation++;
    resolver = null; // Invalid replacement also removes old key authority.
    try {
      resolver = keySnapshot(value);
    } catch {
      /* Fixed failure only. */
    }
    return resolver !== null;
  }
  replaceKeys(initialKeys);
  return Object.freeze({
    replaceKeys,
    async verify(
      token: unknown,
      expected: unknown,
      signal: AbortSignal,
    ): Promise<Readonly<SiwcVerifiedIdentity> | null> {
      const version = generation;
      const keys = resolver;
      try {
        if (
          disposed ||
          !keys ||
          signal.aborted ||
          typeof token !== 'string' ||
          token.length > 16384 ||
          !/^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(token)
        )
          return null;
        const context = expectedContext(expected);
        if (!context || disposed || version !== generation || signal.aborted)
          return null;
        if (token.indexOf('.') > 1024) return null;
        const header = decodeProtectedHeader(token);
        if (
          Object.keys(header).some((k) => !['alg', 'kid', 'typ'].includes(k)) ||
          header.alg !== 'RS256' ||
          !id(header.kid) ||
          (header.typ !== undefined && header.typ !== 'JWT')
        )
          return null;
        const started = Date.now();
        if (!clock(started)) return null;
        const { payload } = await jwtVerify(token, keys, {
          algorithms: ['RS256'],
          issuer: ISSUER,
          audience: context.audience,
          requiredClaims: ['iss', 'sub', 'aud', 'nonce', 'iat', 'exp'],
          maxTokenAge: 600,
          clockTolerance: 5,
          currentDate: new Date(started),
        });
        if (disposed || version !== generation || signal.aborted) return null;
        const completed = Date.now();
        const now = Math.floor(completed / 1000);
        const audience =
          typeof payload.aud === 'string'
            ? payload.aud
            : Array.isArray(payload.aud) && payload.aud.length === 1
              ? payload.aud[0]
              : null;
        if (
          !clock(completed) ||
          completed < started - 5000 ||
          audience !== context.audience ||
          (payload.azp !== undefined && payload.azp !== context.audience) ||
          typeof payload.sub !== 'string' ||
          !/^[\x21-\x7e]{1,255}$/.test(payload.sub) ||
          typeof payload.nonce !== 'string' ||
          !/^[A-Za-z0-9_-]{43}$/.test(payload.nonce) ||
          !timingSafeEqual(
            Buffer.from(payload.nonce),
            Buffer.from(context.nonce),
          ) ||
          !numericDate(payload.iat) ||
          !numericDate(payload.exp) ||
          payload.exp <= payload.iat ||
          payload.exp - payload.iat > 86400 ||
          payload.exp * 1000 <= completed ||
          payload.iat > now + 5 ||
          now - payload.iat > 605 ||
          (payload.nbf !== undefined &&
            (!numericDate(payload.nbf) ||
              payload.nbf > now + 5 ||
              payload.nbf >= payload.exp))
        )
          return null;
        return Object.freeze({
          issuer: ISSUER,
          subject: payload.sub,
          audience: context.audience,
          nonce: context.nonce,
          expiresAt: payload.exp * 1000,
        });
      } catch {
        return null;
      }
    },
    dispose(): void {
      disposed = true;
      generation++;
      resolver = null;
    },
  });
}
