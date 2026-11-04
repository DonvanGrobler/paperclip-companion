import { afterEach, expect, it, vi } from 'vitest';
import type { SiwcLoopbackListener } from '../../src/main/siwc-loopback';
import { createSiwcBrowserLauncher } from '../../src/main/siwc-browser-launcher';

const redirectUri = 'http://127.0.0.1:54321/auth/callback';
const state = 's'.repeat(43);
function authorization() {
  const url = new URL('https://auth.openai.com/api/accounts/authorize');
  url.search = new URLSearchParams({
    client_id: 'dynamic_agent_client',
    ext_agent_host_id: 'synthetic-host',
    response_type: 'code',
    redirect_uri: redirectUri,
    scope:
      'openid profile email offline_access resource.invoke chatgpt.tokens.use.direct',
    resource: 'https://api.openai.com/v1',
    state,
    nonce: 'n'.repeat(43),
    code_challenge_method: 'S256',
    code_challenge: 'c'.repeat(43),
    agent_name_hint: 'Paperclip Companion',
  }).toString();
  return url;
}
function harness() {
  const arm = vi.fn(
    (value: unknown, signal: AbortSignal) =>
      typeof value === 'string' && !signal.aborted,
  );
  const close = vi.fn();
  const listener: SiwcLoopbackListener = {
    redirectUri,
    arm,
    close,
    closed: Promise.resolve(),
  };
  const opener = vi.fn(async (url: string) => {
    void url;
  });
  return {
    listener,
    arm,
    close,
    opener,
    launch: createSiwcBrowserLauncher(listener, opener),
  };
}
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});
it('arms the bound listener before invoking the fixed authorization URL opener', async () => {
  const h = harness();
  const signal = new AbortController().signal;
  const url = authorization();
  await h.launch(url.href, signal);
  expect(h.arm).toHaveBeenCalledOnce();
  expect(
    h.arm.mock.calls[0]?.[0] === state && h.arm.mock.calls[0]?.[1] === signal,
  ).toBe(true);
  expect(h.opener).toHaveBeenCalledOnce();
  expect(h.opener.mock.calls[0]?.[0] === url.href).toBe(true);
  expect(
    h.arm.mock.invocationCallOrder[0]! < h.opener.mock.invocationCallOrder[0]!,
  ).toBe(true);
});
it('denies an unrelated browser destination without opening it', async () => {
  const h = harness();
  await expect(
    h.launch('https://untrusted.invalid/', new AbortController().signal),
  ).rejects.toThrow('SIWC_BROWSER_FAILED');
  expect(h.opener).not.toHaveBeenCalled();
});

it.each([
  ['missing client', (url: URL) => url.searchParams.delete('client_id')],
  [
    'invalid client',
    (url: URL) => url.searchParams.set('client_id', 'bad client'),
  ],
  [
    'invalid host',
    (url: URL) => url.searchParams.set('ext_agent_host_id', 'bad host'),
  ],
  [
    'wrong response',
    (url: URL) => url.searchParams.set('response_type', 'token'),
  ],
  [
    'wrong redirect',
    (url: URL) =>
      url.searchParams.set(
        'redirect_uri',
        'http://localhost:54321/auth/callback',
      ),
  ],
  ['wrong scope', (url: URL) => url.searchParams.set('scope', 'openid')],
  [
    'wrong resource',
    (url: URL) => url.searchParams.set('resource', 'https://untrusted.invalid'),
  ],
  ['wrong state', (url: URL) => url.searchParams.set('state', 'short')],
  ['wrong nonce', (url: URL) => url.searchParams.set('nonce', '')],
  [
    'wrong challenge',
    (url: URL) => url.searchParams.set('code_challenge', 'x'),
  ],
  [
    'wrong challenge method',
    (url: URL) => url.searchParams.set('code_challenge_method', 'plain'),
  ],
  [
    'wrong bootstrap name',
    (url: URL) => url.searchParams.set('agent_name_hint', 'Other'),
  ],
  [
    'bootstrap token hint',
    (url: URL) => url.searchParams.set('id_token_hint', 'synthetic'),
  ],
  ['duplicate state', (url: URL) => url.searchParams.append('state', state)],
  [
    'unknown parameter',
    (url: URL) => url.searchParams.set('login_hint', 'synthetic'),
  ],
  [
    'fragment',
    (url: URL) => {
      url.hash = 'fragment';
    },
  ],
])('denies %s before opening the browser', async (_name, mutate) => {
  const h = harness();
  const url = authorization();
  mutate(url);
  await expect(
    h.launch(url.href, new AbortController().signal),
  ).rejects.toThrow('SIWC_BROWSER_FAILED');
  expect(h.opener).not.toHaveBeenCalled();
  expect(h.arm).not.toHaveBeenCalled();
  expect(h.close).toHaveBeenCalledOnce();
});

it.each([
  ['non-string', 1],
  ['bad destination', 'https://untrusted.invalid/'],
  ['insecure destination', 'http://auth.openai.com/api/accounts/authorize?x=1'],
  ['malformed escaping', authorization().href + '&bad=%ZZ'],
  ['non-ascii', authorization().href + '&bad=\u00e9'],
  ['too long', authorization().href + '&bad=' + 'a'.repeat(65536)],
])('denies %s without exposing the supplied value', async (_name, value) => {
  const h = harness();
  await expect(h.launch(value, new AbortController().signal)).rejects.toThrow(
    'SIWC_BROWSER_FAILED',
  );
  expect(h.opener).not.toHaveBeenCalled();
  expect(h.close).toHaveBeenCalledOnce();
});

it('accepts a bounded hint only for a previously registered client', async () => {
  const h = harness();
  const url = authorization();
  url.searchParams.set('client_id', 'synthetic-client');
  url.searchParams.delete('agent_name_hint');
  url.searchParams.set('id_token_hint', 'synthetic:hint');
  await h.launch(url.href, new AbortController().signal);
  expect(h.opener).toHaveBeenCalledOnce();
});

it.each([
  [
    'registered name',
    (url: URL) =>
      url.searchParams.set('agent_name_hint', 'Paperclip Companion'),
  ],
  ['empty hint', (url: URL) => url.searchParams.set('id_token_hint', '')],
  [
    'spaced hint',
    (url: URL) => url.searchParams.set('id_token_hint', 'synthetic hint'),
  ],
  [
    'oversized hint',
    (url: URL) => url.searchParams.set('id_token_hint', 'x'.repeat(16385)),
  ],
])('denies a registered client with %s', async (_name, mutate) => {
  const h = harness();
  const url = authorization();
  url.searchParams.set('client_id', 'synthetic-client');
  url.searchParams.delete('agent_name_hint');
  mutate(url);
  await expect(
    h.launch(url.href, new AbortController().signal),
  ).rejects.toThrow('SIWC_BROWSER_FAILED');
  expect(h.opener).not.toHaveBeenCalled();
});

it.each([
  'http://localhost:54321/auth/callback',
  'http://127.0.0.1:65536/auth/callback',
  'http://127.0.0.1:0/auth/callback',
])('requires a valid numeric listener redirect', async (invalid) => {
  const h = harness();
  const listener = { ...h.listener, redirectUri: invalid };
  const url = authorization();
  url.searchParams.set('redirect_uri', invalid);
  const launch = createSiwcBrowserLauncher(listener, h.opener);
  await expect(launch(url.href, new AbortController().signal)).rejects.toThrow(
    'SIWC_BROWSER_FAILED',
  );
  expect(h.opener).not.toHaveBeenCalled();
});

it('denies an aborted signal and failures while arming without opening', async () => {
  const aborted = new AbortController();
  aborted.abort();
  const first = harness();
  await expect(
    first.launch(authorization().href, aborted.signal),
  ).rejects.toThrow('SIWC_BROWSER_FAILED');
  expect(first.opener).not.toHaveBeenCalled();
  for (const kind of ['false', 'throw', 'abort']) {
    const h = harness();
    const controller = new AbortController();
    h.arm.mockImplementation(() => {
      if (kind === 'throw') throw new Error('private synthetic detail');
      if (kind === 'abort') controller.abort();
      return kind !== 'false';
    });
    await expect(
      h.launch(authorization().href, controller.signal),
    ).rejects.toThrow('SIWC_BROWSER_FAILED');
    expect(h.opener).not.toHaveBeenCalled();
    expect(h.close).toHaveBeenCalledOnce();
  }
});

it('sanitizes synchronous, asynchronous and invalid opener failures', async () => {
  for (const opener of [
    () => {
      throw new Error('private synthetic detail');
    },
    async () => {
      throw new Error('private synthetic detail');
    },
    () => undefined as never,
  ]) {
    const h = harness();
    const launch = createSiwcBrowserLauncher(h.listener, opener);
    await expect(
      launch(authorization().href, new AbortController().signal),
    ).rejects.toThrow('SIWC_BROWSER_FAILED');
    expect(h.close).toHaveBeenCalledOnce();
  }
});

it('does not let cancellation or a late opener completion resurrect an attempt', async () => {
  const h = harness();
  const controller = new AbortController();
  let complete: () => void = () => {};
  const launch = createSiwcBrowserLauncher(
    h.listener,
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  const pending = launch(authorization().href, controller.signal).catch(
    (error: Error) => error.message,
  );
  controller.abort();
  expect(await pending).toBe('SIWC_BROWSER_FAILED');
  complete();
  await Promise.resolve();
  expect(h.close).toHaveBeenCalledOnce();
  await expect(
    launch(authorization().href, new AbortController().signal),
  ).rejects.toThrow('SIWC_BROWSER_FAILED');
});

it('bounds a stalled opener and ignores late completion', async () => {
  vi.useFakeTimers();
  const h = harness();
  let complete: () => void = () => {};
  const launch = createSiwcBrowserLauncher(
    h.listener,
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  const pending = launch(
    authorization().href,
    new AbortController().signal,
  ).catch((error: Error) => error.message);
  await vi.advanceTimersByTimeAsync(10000);
  expect(await pending).toBe('SIWC_BROWSER_FAILED');
  complete();
  await Promise.resolve();
  expect(h.close).toHaveBeenCalledOnce();
});

it('rejects reuse without disrupting the active launch', async () => {
  const h = harness();
  let complete: () => void = () => {};
  const launch = createSiwcBrowserLauncher(
    h.listener,
    () =>
      new Promise<void>((resolve) => {
        complete = resolve;
      }),
  );
  const first = launch(authorization().href, new AbortController().signal);
  await expect(
    launch(authorization().href, new AbortController().signal),
  ).rejects.toThrow('SIWC_BROWSER_FAILED');
  expect(h.close).not.toHaveBeenCalled();
  complete();
  await expect(first).resolves.toBeUndefined();
});
