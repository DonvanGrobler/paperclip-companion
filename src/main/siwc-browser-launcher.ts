import type { SiwcLoopbackListener } from './siwc-loopback';

const AUTHORIZE = 'https://auth.openai.com/api/accounts/authorize';
const RESOURCE = 'https://api.openai.com/v1';
const SCOPES =
  'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct';
const BOOTSTRAP = 'dynamic_agent_client';
const FAILURE = 'SIWC_BROWSER_FAILED';
const PROOF = /^[A-Za-z0-9_-]{43}$/;
const ALLOWED = new Set([
  'client_id',
  'ext_agent_host_id',
  'response_type',
  'redirect_uri',
  'scope',
  'resource',
  'state',
  'nonce',
  'code_challenge_method',
  'code_challenge',
  'agent_name_hint',
  'id_token_hint',
]);

function authorizationState(
  value: unknown,
  redirectUri: string,
): string | null {
  if (
    typeof value !== 'string' ||
    value.length > 65536 ||
    !value.startsWith(`${AUTHORIZE}?`) ||
    /[^\x21-\x7e]|#/.test(value) ||
    /%(?![0-9A-Fa-f]{2})/.test(value)
  )
    return null;
  const port = /^http:\/\/127\.0\.0\.1:([1-9][0-9]{0,4})\/auth\/callback$/.exec(
    redirectUri,
  )?.[1];
  if (!port || Number(port) > 65535) return null;
  const params = new URL(value).searchParams;
  for (const [key] of params) {
    if (!ALLOWED.has(key) || params.getAll(key).length !== 1) return null;
  }
  const client = params.get('client_id');
  const host = params.get('ext_agent_host_id');
  const state = params.get('state');
  const nonce = params.get('nonce');
  const challenge = params.get('code_challenge');
  const hint = params.get('id_token_hint');
  if (
    !client ||
    !/^[A-Za-z0-9._-]{1,128}$/.test(client) ||
    !host ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(host) ||
    params.get('response_type') !== 'code' ||
    params.get('redirect_uri') !== redirectUri ||
    params.get('scope') !== SCOPES ||
    params.get('resource') !== RESOURCE ||
    !state ||
    !PROOF.test(state) ||
    !nonce ||
    !PROOF.test(nonce) ||
    !challenge ||
    !PROOF.test(challenge) ||
    params.get('code_challenge_method') !== 'S256' ||
    (client === BOOTSTRAP
      ? params.get('agent_name_hint') !== 'Paperclip Companion' || hint !== null
      : params.has('agent_name_hint')) ||
    (hint !== null &&
      (hint.length < 1 || hint.length > 16384 || !/^[\x21-\x7e]+$/.test(hint)))
  )
    return null;
  return state;
}

/** Main-only capability; no Electron or renderer entry point is installed here. */
export function createSiwcBrowserLauncher(
  listener: SiwcLoopbackListener,
  openExternal: (url: string) => Promise<void>,
) {
  let used = false;
  const close = () => {
    try {
      listener.close();
    } catch {
      // Do not expose capability errors containing private data.
    }
  };
  return async (value: unknown, signal: AbortSignal): Promise<void> => {
    if (used) throw new Error(FAILURE);
    used = true;
    const deadline = performance.now() + 10000;
    try {
      const state = authorizationState(value, listener.redirectUri);
      if (
        !state ||
        signal.aborted ||
        performance.now() >= deadline ||
        listener.arm(state, signal) !== true ||
        signal.aborted ||
        performance.now() >= deadline
      )
        throw new Error(FAILURE);
    } catch {
      close();
      throw new Error(FAILURE);
    }
    const url = value as string;
    return new Promise<void>((resolve, reject) => {
      let done = false;
      const finish = (success: boolean) => {
        if (done) return;
        done = true;
        clearTimeout(timer);
        signal.removeEventListener('abort', abort);
        if (success && !signal.aborted && performance.now() < deadline)
          resolve();
        else {
          close();
          reject(new Error(FAILURE));
        }
      };
      const abort = () => finish(false);
      const timer = setTimeout(
        abort,
        Math.max(1, deadline - performance.now()),
      );
      signal.addEventListener('abort', abort, { once: true });
      if (signal.aborted || performance.now() >= deadline) {
        abort();
        return;
      }
      try {
        const result = openExternal(url);
        if (!result || typeof result.then !== 'function') {
          abort();
          return;
        }
        Promise.resolve(result).then(
          () => finish(true),
          () => finish(false),
        );
      } catch {
        abort();
      }
    });
  };
}
