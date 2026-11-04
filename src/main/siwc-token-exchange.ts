import https from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { checkServerIdentity } from 'node:tls';

export interface SiwcNormalizedGrant {
  access_token: string | null;
  refresh_token: string | null;
  id_token: string;
  token_type: string | null;
  expires_in: number | null;
  scope: string;
}

const ENDPOINT = 'https://auth.openai.com/api/accounts/oauth/token';
const RESOURCE = 'https://api.openai.com/v1';
const RESPONSE_LIMIT = 98304;
const FAILURE = 'SIWC_EXCHANGE_FAILED';

function text(value: unknown, max: number): value is string {
  return (
    typeof value === 'string' &&
    value.length > 0 &&
    value.length <= max &&
    /^[\x21-\x7e]+$/.test(value)
  );
}
function input(value: unknown) {
  try {
    if (!value || typeof value !== 'object' || Array.isArray(value))
      return null;
    const proto = Object.getPrototypeOf(value);
    if (proto !== Object.prototype && proto !== null) return null;
    const keys = [
      'endpoint',
      'clientId',
      'code',
      'codeVerifier',
      'redirectUri',
      'resource',
    ];
    if (Reflect.ownKeys(value).length !== keys.length) return null;
    const result: Record<string, unknown> = {};
    for (const key of keys) {
      const item = Object.getOwnPropertyDescriptor(value, key);
      if (!item || !Object.hasOwn(item, 'value')) return null;
      result[key] = item.value;
    }
    if (
      result.endpoint !== ENDPOINT ||
      result.resource !== RESOURCE ||
      typeof result.clientId !== 'string' ||
      !/^[A-Za-z0-9._-]{1,128}$/.test(result.clientId) ||
      result.clientId === 'dynamic_agent_client' ||
      !text(result.code, 4096) ||
      typeof result.codeVerifier !== 'string' ||
      !/^[A-Za-z0-9_-]{43}$/.test(result.codeVerifier) ||
      typeof result.redirectUri !== 'string'
    )
      return null;
    const port =
      /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/auth\/callback$/.exec(
        result.redirectUri,
      )?.[1];
    if (!port || Number(port) > 65535) return null;
    return {
      clientId: result.clientId,
      code: result.code,
      codeVerifier: result.codeVerifier,
      redirectUri: result.redirectUri,
    };
  } catch {
    return null;
  }
}
// Called only after JSON.parse succeeds. Nested extensions are ignored, but
// duplicate top-level members would make token-response interpretation ambiguous.
function uniqueTopLevelMembers(source: string): boolean {
  const names = new Set<string>();
  let depth = 0;
  for (let i = 0; i < source.length; i++) {
    const character = source[i];
    if (character === '"') {
      const start = i;
      while (++i < source.length) {
        if (source[i] === '\\') {
          i++;
          continue;
        }
        if (source[i] === '"') break;
      }
      if (depth !== 1) continue;
      let next = i + 1;
      while (next < source.length && /[ \t\r\n]/.test(source[next]!)) next++;
      if (source[next] !== ':') continue;
      const name: unknown = JSON.parse(source.slice(start, i + 1));
      if (typeof name !== 'string' || names.has(name)) return false;
      names.add(name);
    } else if (character === '{' || character === '[') depth++;
    else if (character === '}' || character === ']') depth--;
  }
  return true;
}
function normalized(value: unknown): Readonly<SiwcNormalizedGrant> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const data = value as Record<string, unknown>;
  const own = (key: string) =>
    Object.hasOwn(data, key) ? data[key] : undefined;
  const access = own('access_token') ?? null;
  const refresh = own('refresh_token') ?? null;
  const id = own('id_token');
  const type = own('token_type') ?? null;
  const expiry = own('expires_in') ?? null;
  const rawScope = own('scope');
  const scope = rawScope === undefined ? '' : rawScope;
  if (
    (access !== null && !text(access, 16384)) ||
    (refresh !== null && !text(refresh, 16384)) ||
    !text(id, 16384) ||
    (type !== null && !text(type, 128)) ||
    (expiry !== null &&
      (typeof expiry !== 'number' || !Number.isFinite(expiry))) ||
    typeof scope !== 'string' ||
    scope.length > 4096
  )
    return null;
  return Object.freeze({
    access_token: access,
    refresh_token: refresh,
    id_token: id,
    token_type: type,
    expires_in: expiry,
    scope,
  });
}
function close(value: { destroy: () => unknown } | undefined) {
  try {
    value?.destroy();
  } catch {
    // Cleanup failure cannot leak private native errors or prevent settlement.
  }
}

/** Unwired, main-only code exchange; returned data is not verified identity or authority. */
export async function exchangeSiwcCode(
  request: unknown,
  signal: AbortSignal,
): Promise<Readonly<SiwcNormalizedGrant>> {
  if (signal.aborted) throw new Error(FAILURE);
  const value = input(request);
  if (!value || signal.aborted) throw new Error(FAILURE);
  const body = new URLSearchParams({
    grant_type: 'authorization_code',
    client_id: value.clientId,
    code: value.code,
    code_verifier: value.codeVerifier,
    redirect_uri: value.redirectUri,
    resource: RESOURCE,
  }).toString();
  const deadline = performance.now() + 10000;
  const expired = () => performance.now() >= deadline;
  return new Promise((resolve, reject) => {
    let done = false;
    let outgoing: ClientRequest | undefined;
    let incoming: IncomingMessage | undefined;
    const finish = (grant: Readonly<SiwcNormalizedGrant> | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      close(incoming);
      close(outgoing);
      if (grant && !signal.aborted && !expired()) resolve(grant);
      else reject(new Error(FAILURE));
    };
    const stop = () => finish(null);
    const timer = setTimeout(stop, 10000);
    signal.addEventListener('abort', stop, { once: true });
    try {
      if (signal.aborted || expired()) {
        stop();
        return;
      }
      outgoing = https.request(
        ENDPOINT,
        {
          method: 'POST',
          agent: false,
          rejectUnauthorized: true,
          minVersion: 'TLSv1.2',
          checkServerIdentity,
          maxHeaderSize: 8192,
          signal,
          headers: {
            accept: 'application/json',
            'accept-encoding': 'identity',
            'content-type': 'application/x-www-form-urlencoded',
            'content-length': String(Buffer.byteLength(body)),
          },
        },
        (response) => {
          if (done || signal.aborted || expired()) {
            close(response);
            stop();
            return;
          }
          incoming = response;
          void (async () => {
            const chunks: Buffer[] = [];
            let bytes: Buffer | undefined;
            try {
              const type = response.headers['content-type'];
              const encoding = response.headers['content-encoding'];
              const length = response.headers['content-length'];
              if (
                done ||
                signal.aborted ||
                expired() ||
                response.statusCode !== 200 ||
                typeof type !== 'string' ||
                !/^application\/json(?:;\s*charset=(?:utf-8|"utf-8"))?$/i.test(
                  type.trim(),
                ) ||
                (encoding !== undefined &&
                  (typeof encoding !== 'string' ||
                    encoding.toLowerCase() !== 'identity')) ||
                (length !== undefined &&
                  (typeof length !== 'string' ||
                    !/^(0|[1-9][0-9]{0,5})$/.test(length) ||
                    Number(length) > RESPONSE_LIMIT))
              ) {
                stop();
                return;
              }
              let total = 0;
              for await (const chunk of response) {
                if (
                  done ||
                  signal.aborted ||
                  expired() ||
                  !Buffer.isBuffer(chunk) ||
                  total + chunk.length > RESPONSE_LIMIT
                ) {
                  stop();
                  return;
                }
                total += chunk.length;
                chunks.push(Buffer.from(chunk));
              }
              if (
                !total ||
                (length !== undefined && Number(length) !== total)
              ) {
                stop();
                return;
              }
              bytes = Buffer.concat(chunks, total);
              const source = new TextDecoder('utf-8', { fatal: true }).decode(
                bytes,
              );
              const data: unknown = JSON.parse(source);
              if (!uniqueTopLevelMembers(source)) {
                stop();
                return;
              }
              if (done || signal.aborted || expired()) {
                stop();
                return;
              }
              finish(normalized(data));
            } catch {
              stop();
            } finally {
              bytes?.fill(0);
              for (const chunk of chunks) chunk.fill(0);
            }
          })();
        },
      );
      outgoing.on('error', stop);
      if (done || signal.aborted || expired()) {
        close(outgoing);
        stop();
        return;
      }
      outgoing.end(body);
    } catch {
      stop();
    }
  });
}
