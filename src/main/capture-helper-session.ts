import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import {
  createHelperResponseDecoder,
  type HelperContext,
  type HelperResponse,
} from '../core/capture-helper-protocol';

type Failure = 'cancelled' | 'timeout' | 'unavailable';
const noImage = (code: Failure): HelperResponse => ({
  status: 'no-image',
  code,
});

/**
 * Unwired supervisor. launch is a trusted main-owned capability, never renderer
 * input. Only tests supply a launcher in this slice. The future launcher must
 * fix executable/args/environment, use private pipes and create no descendants.
 * Correlation does not replace consent, policy or native target validation.
 */
export function createHelperSession(
  launch: () => ChildProcessWithoutNullStreams,
  {
    timeoutMs = 5000,
    killGraceMs = 1000,
  }: { timeoutMs?: number; killGraceMs?: number } = {},
) {
  if (
    !Number.isInteger(timeoutMs) ||
    timeoutMs < 1 ||
    timeoutMs > 30000 ||
    !Number.isInteger(killGraceMs) ||
    killGraceMs < 1 ||
    killGraceMs > 5000
  ) {
    throw new Error('Invalid helper deadlines');
  }
  let busy = false;
  let disposed = false;
  let cancelActive: (() => void) | null = null;
  return {
    dispose(): void {
      disposed = true;
      cancelActive?.();
    },
    async run(
      request: Omit<HelperContext, 'sessionId'>,
      signal: AbortSignal,
    ): Promise<HelperResponse> {
      if (disposed || busy) return noImage('unavailable');
      if (signal.aborted) return noImage('cancelled');
      const context = {
        sessionId: randomUUID(),
        generation: request.generation,
        requestId: request.requestId,
        targetId: request.targetId,
      };
      let decoder: ReturnType<typeof createHelperResponseDecoder>;
      try {
        decoder = createHelperResponseDecoder(context);
      } catch {
        return noImage('unavailable');
      }
      busy = true;
      let child: ChildProcessWithoutNullStreams;
      try {
        child = launch();
      } catch {
        busy = false;
        decoder.cancel();
        return noImage('unavailable');
      }
      return new Promise<HelperResponse>((resolve) => {
        let settled = false;
        let closed = false;
        let exited = false;
        let eof = false;
        let failure: Failure | null = null;
        let reapTimer: ReturnType<typeof setTimeout> | undefined;
        const deadline = setTimeout(() => fail('timeout'), timeoutMs);

        function settle(result: HelperResponse) {
          if (settled) return;
          settled = true;
          clearTimeout(deadline);
          clearTimeout(reapTimer);
          signal.removeEventListener('abort', abort);
          resolve(result);
        }
        function fail(code: Failure) {
          if (closed || failure) return;
          failure = code;
          decoder.cancel();
          clearTimeout(deadline);
          // A kill return value/signal is not proof of exit. Retain the busy lock
          // and close listener if the grace expires without observed closure.
          reapTimer = setTimeout(() => settle(noImage(code)), killGraceMs);
          try {
            if (!exited) child.kill('SIGKILL');
          } catch {
            /* Keep waiting for close. */
          }
          child.stdin.destroy();
        }
        function abort() {
          fail('cancelled');
        }
        function error() {
          fail('unavailable');
        }
        function data(chunk: unknown) {
          if (
            !failure &&
            (!(chunk instanceof Uint8Array) || !decoder.push(chunk))
          )
            error();
        }
        function end() {
          eof = true;
        }
        function exit(code: number | null, termination: NodeJS.Signals | null) {
          exited = true;
          if (code !== 0 || termination !== null) error();
        }
        function close(
          code: number | null,
          termination: NodeJS.Signals | null,
        ) {
          closed = true;
          busy = false;
          cancelActive = null;
          clearTimeout(deadline);
          clearTimeout(reapTimer);
          signal.removeEventListener('abort', abort);
          child.stdout.off('data', data).off('end', end).off('error', error);
          child.stderr.off('data', error).off('error', error);
          child.stdin.off('error', error);
          child.off('error', error).off('exit', exit).off('close', close);
          if (failure || !eof || code !== 0 || termination !== null) {
            decoder.cancel();
            settle(noImage(failure ?? 'unavailable'));
          } else {
            settle(decoder.finish() ?? noImage('unavailable'));
          }
        }
        child.stdout.on('data', data).on('end', end).on('error', error);
        child.stderr.on('data', error).on('error', error);
        child.stdin.on('error', error);
        child.on('error', error).on('exit', exit).on('close', close);
        cancelActive = abort;
        signal.addEventListener('abort', abort, { once: true });
        // Abort/dispose may have occurred inside a trusted synchronous launcher.
        if (signal.aborted || disposed) abort();
        else {
          try {
            child.stdin.end(JSON.stringify(context));
          } catch {
            error();
          }
        }
      });
    },
  };
}
