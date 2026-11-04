import { timingSafeEqual } from 'node:crypto';
import http from 'node:http';
import type { Socket } from 'node:net';

export interface SiwcLoopbackListener {
  readonly redirectUri: string;
  readonly closed: Promise<void>;
  arm(state: unknown, signal: AbortSignal): boolean;
  close(): void;
}

const PATH = '/auth/callback';
const RESPONSE = 'Return to Paperclip Companion.';
const DENIAL = 'Unable to process this request.';

function respond(response: http.ServerResponse, accepted: boolean): void {
  const body = accepted ? RESPONSE : DENIAL;
  response.writeHead(accepted ? 200 : 400, {
    'Cache-Control': 'no-store',
    'Content-Type': 'text/plain; charset=utf-8',
    'Content-Length': Buffer.byteLength(body),
    'Content-Security-Policy':
      "default-src 'none'; frame-ancestors 'none'; base-uri 'none'; form-action 'none'",
    'Referrer-Policy': 'no-referrer',
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    Connection: 'close',
  });
  response.end(body);
}

/** Main-only, one-attempt listener. The synchronous callback and signals are trusted capabilities. */
export async function startSiwcLoopbackListener(
  callback: (url: string) => void,
  signal: AbortSignal,
  lifetimeMs = 120000,
): Promise<SiwcLoopbackListener | null> {
  if (
    typeof callback !== 'function' ||
    signal.aborted ||
    !Number.isInteger(lifetimeMs) ||
    lifetimeMs < 1 ||
    lifetimeMs > 300000
  )
    return null;

  const deadline = performance.now() + lifetimeMs;
  return new Promise((resolve) => {
    const sockets = new Set<Socket>();
    let stopped = false;
    let starting = true;
    let port = 0;
    let expected: Buffer | undefined;
    let attemptSignal: AbortSignal | undefined;
    let deliver: ((url: string) => void) | undefined = callback;
    let resolveClosed: () => void = () => {};
    const closed = new Promise<void>((done) => {
      resolveClosed = done;
    });

    function stop(preserve?: Socket): void {
      if (stopped) return;
      stopped = true;
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      attemptSignal?.removeEventListener('abort', onAbort);
      attemptSignal = undefined;
      expected?.fill(0);
      expected = undefined;
      deliver = undefined;
      for (const socket of sockets) {
        if (socket !== preserve) socket.destroy();
      }
      if (starting) resolve(null);
      else if (server.listening) server.close();
    }
    function onAbort(): void {
      stop();
    }

    const server = http.createServer({ maxHeaderSize: 24576 }, (req, res) => {
      if (performance.now() >= deadline) {
        respond(res, false);
        stop(req.socket);
        return;
      }
      const raw = req.url ?? '';
      const hostCount = req.rawHeaders.filter(
        (name, index) => index % 2 === 0 && name.toLowerCase() === 'host',
      ).length;
      if (
        stopped ||
        !expected ||
        req.socket.remoteAddress !== '127.0.0.1' ||
        req.method !== 'GET' ||
        hostCount !== 1 ||
        req.headers.host !== `127.0.0.1:${port}` ||
        req.headers['transfer-encoding'] !== undefined ||
        (req.headers['content-length'] !== undefined &&
          req.headers['content-length'] !== '0') ||
        !raw.startsWith(`${PATH}?`) ||
        raw.length + `http://127.0.0.1:${port}`.length > 16384 ||
        /[^\x21-\x7e]|#/.test(raw) ||
        /%(?![0-9A-Fa-f]{2})/.test(raw)
      ) {
        respond(res, false);
        return;
      }
      const states = new URLSearchParams(raw.slice(PATH.length + 1)).getAll(
        'state',
      );
      if (states.length !== 1 || !/^[A-Za-z0-9_-]{43}$/.test(states[0]!)) {
        respond(res, false);
        return;
      }
      const actual = Buffer.from(states[0]!, 'ascii');
      const matches = timingSafeEqual(expected, actual);
      actual.fill(0);
      if (!matches) {
        respond(res, false);
        return;
      }

      const uri = `http://127.0.0.1:${port}${raw}`;
      const handoff = deliver;
      respond(res, true);
      stop(req.socket);
      try {
        handoff?.(uri);
      } catch {
        // The fixed browser response never exposes callback or handler details.
      }
    });
    server.maxConnections = 16;
    server.maxRequestsPerSocket = 1;
    server.headersTimeout = 5000;
    server.requestTimeout = 5000;
    server.on('connection', (socket) => {
      sockets.add(socket);
      socket.on('error', () => {});
      socket.once('close', () => sockets.delete(socket));
      socket.setTimeout(5000, () => socket.destroy());
    });
    server.on('clientError', (_error, socket) => socket.destroy());
    server.once('close', resolveClosed);
    server.on('error', () => {
      starting = false;
      stop();
      resolve(null);
    });
    server.once('listening', () => {
      starting = false;
      if (stopped) {
        server.close();
        return;
      }
      if (performance.now() >= deadline) {
        stop();
        resolve(null);
        return;
      }
      const address = server.address();
      if (!address || typeof address === 'string' || address.port < 1) {
        stop();
        resolve(null);
        return;
      }
      port = address.port;
      const owner: SiwcLoopbackListener = Object.freeze({
        redirectUri: `http://127.0.0.1:${port}${PATH}`,
        closed,
        arm(state: unknown, transactionSignal: AbortSignal): boolean {
          if (performance.now() >= deadline) {
            stop();
            return false;
          }
          if (
            stopped ||
            expected ||
            signal.aborted ||
            transactionSignal.aborted ||
            typeof state !== 'string' ||
            !/^[A-Za-z0-9_-]{43}$/.test(state)
          )
            return false;
          expected = Buffer.from(state, 'ascii');
          attemptSignal = transactionSignal;
          transactionSignal.addEventListener('abort', onAbort, { once: true });
          if (transactionSignal.aborted) {
            stop();
            return false;
          }
          return true;
        },
        close: () => stop(),
      });
      resolve(owner);
    });
    const timer = setTimeout(onAbort, lifetimeMs);
    signal.addEventListener('abort', onAbort, { once: true });
    if (signal.aborted) stop();
    else {
      try {
        server.listen({ host: '127.0.0.1', port: 0, exclusive: true });
      } catch {
        starting = false;
        stop();
        resolve(null);
      }
    }
  });
}
