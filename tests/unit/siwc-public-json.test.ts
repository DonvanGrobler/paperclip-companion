import https from 'node:https';
import { checkServerIdentity } from 'node:tls';
import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type {
  ClientRequest,
  IncomingMessage,
  IncomingHttpHeaders,
} from 'node:http';
import { afterEach, expect, it, vi } from 'vitest';
import { fetchSiwcPublicJson } from '../../src/main/siwc-public-json';

const URL = 'https://auth.openai.com/.well-known/openid-configuration';
const signal = () => new AbortController().signal;
const streams: PassThrough[] = [];
afterEach(() => {
  for (const stream of streams.splice(0)) stream.destroy();
  vi.restoreAllMocks();
  vi.useRealTimers();
});
function native(
  options: {
    status?: number;
    headers?: IncomingHttpHeaders;
    bytes?: Buffer;
    deliver?: boolean;
    end?: boolean;
    synchronous?: boolean;
  } = {},
) {
  const response = Object.assign(new PassThrough(), {
    statusCode: options.status ?? 200,
    headers: options.headers ?? {
      'content-type': 'application/json',
      'cache-control': 'public, max-age=600',
      age: '20',
    },
  });
  streams.push(response);
  const request = Object.assign(new EventEmitter(), { destroy: vi.fn() });
  let callback!: (response: IncomingMessage) => void;
  let supplied: https.RequestOptions | undefined;
  const deliver = () => {
    callback(response as unknown as IncomingMessage);
    if (options.end !== false)
      response.end(options.bytes ?? Buffer.from('{"synthetic":true}'));
  };
  const get = vi.spyOn(https, 'get').mockImplementation(((
    url: string,
    input: https.RequestOptions,
    listener: typeof callback,
  ) => {
    expect([URL, 'https://auth.openai.com/.well-known/jwks.json']).toContain(
      url,
    );
    supplied = input;
    callback = listener;
    if (options.deliver !== false) {
      if (options.synchronous) deliver();
      else queueMicrotask(deliver);
    }
    return request as unknown as ClientRequest;
  }) as never);
  return { response, request, get, deliver, options: () => supplied };
}
it('forces verified TLS, exact public GET headers and bounded native parsing', async () => {
  const h = native();
  const input = signal();
  const value = await fetchSiwcPublicJson(URL, input);
  expect(value?.body === '{"synthetic":true}').toBe(true);
  expect(value?.cacheMs).toBe(300_000);
  expect(h.options()?.agent).toBe(false);
  expect(h.options()?.rejectUnauthorized).toBe(true);
  expect(h.options()?.minVersion).toBe('TLSv1.2');
  expect(h.options()?.checkServerIdentity).toBe(checkServerIdentity);
  expect(h.options()?.maxHeaderSize).toBe(8192);
  expect(h.options()?.method).toBe('GET');
  expect(h.options()?.signal === input).toBe(true);
  expect(h.options()?.headers).toEqual({
    accept: 'application/json, application/jwk-set+json',
    'accept-encoding': 'identity',
  });
  expect(h.options()?.auth).toBeUndefined();
  expect(h.response.destroyed).toBe(true);
  expect(h.request.destroy.mock.calls.length > 0).toBe(true);
});
it('uses the same restricted native transport for the documented JWKS destination', async () => {
  const h = native({ headers: { 'content-type': 'application/jwk-set+json' } });
  expect(
    (await fetchSiwcPublicJson(
      'https://auth.openai.com/.well-known/jwks.json',
      signal(),
    )) !== null,
  ).toBe(true);
  expect(h.get.mock.calls.length).toBe(1);
});
it.each([
  'http://auth.openai.com/.well-known/jwks.json',
  'https://auth.openai.com:443/.well-known/jwks.json',
  'https://auth.openai.com/.well-known/jwks.json?x=1',
  'https://auth.openai.com/.well-known/jwks.json#x',
  'https://auth.openai.com@untrusted.invalid/.well-known/jwks.json',
  'https://127.0.0.1/keys',
  'https://auth.openai.com./.well-known/jwks.json',
])('denies non-exact destination %s before network', async (url) => {
  const h = native();
  expect(await fetchSiwcPublicJson(url, signal())).toBeNull();
  expect(h.get).not.toHaveBeenCalled();
});
it.each([201, 204, 301, 302, 307, 308, 400, 401, 404, 500])(
  'denies HTTP %i without following redirects',
  async (status) => {
    const h = native({ status });
    expect(await fetchSiwcPublicJson(URL, signal())).toBeNull();
    expect(h.get.mock.calls.length).toBe(1);
    expect(h.response.destroyed).toBe(true);
  },
);
it.each([
  {},
  { 'content-type': ['application/json'] },
  { 'content-type': 'text/html' },
  { 'content-type': 'application/json; charset=latin1' },
  { 'content-type': 'application/json', 'content-encoding': 'gzip' },
  { 'content-type': 'application/json', 'content-encoding': ['identity'] },
  { 'content-type': 'application/json', 'content-length': '65537' },
  { 'content-type': 'application/json', 'content-length': 'bad' },
  { 'content-type': 'application/json', 'content-length': ['2'] },
  { 'content-type': 'application/json', 'content-length': '2' },
] as IncomingHttpHeaders[])(
  'denies invalid HTTP metadata %#',
  async (headers) => {
    native({ headers });
    expect(await fetchSiwcPublicJson(URL, signal())).toBeNull();
  },
);
it.each([
  [undefined, undefined, 0],
  ['no-store, max-age=60', undefined, 0],
  ['no-cache="field", max-age=60', undefined, 0],
  ['max-age=60', '20', 40000],
  ['max-age="45"', undefined, 45000],
  ['MAX-AGE=60', '80', 0],
  ['max-age=0', undefined, 0],
  ['max-age=20, max-age=30', undefined, 0],
  ['max-age=bad', undefined, 0],
  ['max-age', undefined, 0],
  ['public', undefined, 0],
  ['max-age=60', 'bad', 0],
  ['max-age=60', ['2'], 0],
  ['x'.repeat(4097), '0', 0],
  [['max-age=60'], '0', 0],
] as const)(
  'bounds freshness without heuristic or stale caching %#',
  async (control, age, expected) => {
    const headers: IncomingHttpHeaders = { 'content-type': 'application/json' };
    if (control !== undefined) headers['cache-control'] = control as string;
    if (age !== undefined) headers.age = age as string;
    native({ headers });
    expect((await fetchSiwcPublicJson(URL, signal()))?.cacheMs).toBe(expected);
  },
);
it.each([
  'application/jwk-set+json',
  'application/json; charset=UTF-8',
  'application/json; charset="utf-8"',
])('accepts supported JSON type %s', async (type) => {
  native({ headers: { 'content-type': type, 'content-encoding': 'identity' } });
  expect((await fetchSiwcPublicJson(URL, signal())) !== null).toBe(true);
});
it.each([Buffer.alloc(0), Buffer.alloc(65537), Buffer.from([0xc3, 0x28])])(
  'denies empty/oversized/non-UTF8 streaming data %#',
  async (bytes) => {
    native({ bytes });
    expect(await fetchSiwcPublicJson(URL, signal())).toBeNull();
  },
);
it('accepts exactly the body bound, including streaming without content-length', async () => {
  native({ bytes: Buffer.from('{}' + ' '.repeat(65534)) });
  expect((await fetchSiwcPublicJson(URL, signal()))?.body.length).toBe(65536);
});
it('decodes UTF8 across byte boundaries and verifies exact content-length', async () => {
  const h = native({
    end: false,
    headers: { 'content-type': 'application/json', 'content-length': '4' },
  });
  const pending = fetchSiwcPublicJson(URL, signal());
  const body = Buffer.from('"é"');
  h.response.write(body.subarray(0, 2));
  h.response.end(body.subarray(2));
  expect((await pending)?.body === '"é"').toBe(true);
});
it('rejects a response stream switched into text mode', async () => {
  const h = native();
  h.response.setEncoding('utf8');
  expect(await fetchSiwcPublicJson(URL, signal())).toBeNull();
});
it('rejects an already aborted signal without native work', async () => {
  const h = native();
  const controller = new AbortController();
  controller.abort();
  expect(await fetchSiwcPublicJson(URL, controller.signal)).toBeNull();
  expect(h.get).not.toHaveBeenCalled();
});
it('destroys a late response delivered after cancellation', async () => {
  const h = native({ deliver: false, end: false });
  const controller = new AbortController();
  const pending = fetchSiwcPublicJson(URL, controller.signal);
  controller.abort();
  expect(await pending).toBeNull();
  h.deliver();
  expect(h.response.destroyed).toBe(true);
});
it('aborts pending body work and clears the native deadline', async () => {
  vi.useFakeTimers();
  const h = native({ end: false });
  const controller = new AbortController();
  const pending = fetchSiwcPublicJson(URL, controller.signal);
  await vi.advanceTimersByTimeAsync(0);
  h.response.write('{');
  controller.abort();
  expect(await pending).toBeNull();
  expect(h.response.destroyed).toBe(true);
  expect(vi.getTimerCount()).toBe(0);
});
it('bounds a stalled native response even outside the owning verifier', async () => {
  vi.useFakeTimers();
  const h = native({ deliver: false });
  const pending = fetchSiwcPublicJson(URL, signal());
  await vi.advanceTimersByTimeAsync(5000);
  expect(await pending).toBeNull();
  expect(h.request.destroy).toHaveBeenCalled();
  expect(vi.getTimerCount()).toBe(0);
});
it('normalizes synchronous native errors, TLS rejection and stream errors', async () => {
  vi.spyOn(https, 'get').mockImplementationOnce(() => {
    throw new Error('PRIVATE');
  });
  expect(await fetchSiwcPublicJson(URL, signal())).toBeNull();
  vi.restoreAllMocks();
  const h = native({ deliver: false });
  const pending = fetchSiwcPublicJson(URL, signal());
  h.request.emit('error', new Error('PRIVATE_TLS'));
  expect(await pending).toBeNull();
  vi.restoreAllMocks();
  const failed = native({ end: false });
  const reading = fetchSiwcPublicJson(URL, signal());
  await Promise.resolve();
  failed.response.destroy(new Error('PRIVATE_STREAM'));
  expect(await reading).toBeNull();
});
it('handles a synchronous response callback without retaining an unclosed request', async () => {
  const h = native({ status: 500, synchronous: true });
  expect(await fetchSiwcPublicJson(URL, signal())).toBeNull();
  expect(h.request.destroy).toHaveBeenCalled();
});
