import https from 'node:https';
import type { ClientRequest, IncomingMessage } from 'node:http';
import { checkServerIdentity } from 'node:tls';

export interface SiwcPublicDocument {
  body: string;
  cacheMs: number;
}
export type SiwcPublicJsonTransport = (
  url: string,
  signal: AbortSignal,
) => Promise<unknown>;

const DESTINATIONS = new Set([
  'https://auth.openai.com/.well-known/openid-configuration',
  'https://auth.openai.com/.well-known/jwks.json',
]);
function freshness(response: IncomingMessage): number {
  const control = response.headers['cache-control'];
  const age = response.headers.age ?? '0';
  if (
    typeof control !== 'string' ||
    control.length > 4096 ||
    typeof age !== 'string' ||
    !/^(0|[1-9][0-9]{0,9})$/.test(age)
  )
    return 0;
  const parts = control
    .toLowerCase()
    .split(',')
    .map((part) => part.trim());
  if (parts.some((part) => /^no-(?:store|cache)(?:\s*=|$)/.test(part)))
    return 0;
  const ages = parts.filter((part) => /^max-age(?:\s*=|$)/.test(part));
  const value =
    ages.length === 1
      ? /^max-age\s*=\s*(?:"([0-9]{1,10})"|([0-9]{1,10}))$/.exec(ages[0]!)
      : null;
  return value
    ? Math.max(0, Math.min(300, Number(value[1] ?? value[2]) - Number(age))) *
        1000
    : 0;
}

/** Fixed public metadata GETs only. No redirects, credentials, browser session or TLS override. */
export async function fetchSiwcPublicJson(
  url: string,
  signal: AbortSignal,
): Promise<SiwcPublicDocument | null> {
  if (!DESTINATIONS.has(url) || signal.aborted) return null;
  return new Promise((resolve) => {
    let done = false;
    let request: ClientRequest | undefined;
    let response: IncomingMessage | undefined;
    const finish = (value: SiwcPublicDocument | null) => {
      if (done) return;
      done = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', stop);
      response?.destroy();
      request?.destroy();
      resolve(value);
    };
    const stop = () => finish(null);
    const timer = setTimeout(stop, 5000);
    signal.addEventListener('abort', stop, { once: true });
    try {
      request = https.get(
        url,
        {
          agent: false,
          rejectUnauthorized: true,
          minVersion: 'TLSv1.2',
          checkServerIdentity,
          method: 'GET',
          maxHeaderSize: 8192,
          signal,
          headers: {
            accept: 'application/json, application/jwk-set+json',
            'accept-encoding': 'identity',
          },
        },
        async (incoming) => {
          if (done) {
            incoming.destroy();
            return;
          }
          response = incoming;
          const chunks: Buffer[] = [];
          let bytes: Buffer | undefined;
          try {
            const type = incoming.headers['content-type'];
            const encoding = incoming.headers['content-encoding'];
            const length = incoming.headers['content-length'];
            if (
              done ||
              signal.aborted ||
              incoming.statusCode !== 200 ||
              typeof type !== 'string' ||
              !/^application\/(?:json|jwk-set\+json)(?:;\s*charset=(?:utf-8|"utf-8"))?$/i.test(
                type.trim(),
              ) ||
              (encoding !== undefined &&
                (typeof encoding !== 'string' ||
                  encoding.toLowerCase() !== 'identity')) ||
              (length !== undefined &&
                (typeof length !== 'string' ||
                  !/^(0|[1-9][0-9]{0,5})$/.test(length) ||
                  Number(length) > 65536))
            ) {
              finish(null);
              return;
            }
            let total = 0;
            for await (const chunk of incoming) {
              if (
                done ||
                signal.aborted ||
                !Buffer.isBuffer(chunk) ||
                total + chunk.length > 65536
              ) {
                finish(null);
                return;
              }
              total += chunk.length;
              chunks.push(Buffer.from(chunk));
            }
            if (!total || (length !== undefined && Number(length) !== total)) {
              finish(null);
              return;
            }
            bytes = Buffer.concat(chunks, total);
            const body = new TextDecoder('utf-8', { fatal: true }).decode(
              bytes,
            );
            finish({ body, cacheMs: freshness(incoming) });
          } catch {
            finish(null);
          } finally {
            bytes?.fill(0);
            for (const chunk of chunks) chunk.fill(0);
          }
        },
      );
      request.on('error', stop);
      if (done || signal.aborted) {
        request.destroy();
        finish(null);
      }
    } catch {
      finish(null);
    }
  });
}
