import { EventEmitter } from 'node:events';
import { PassThrough } from 'node:stream';
import type { ChildProcessWithoutNullStreams } from 'node:child_process';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createHelperSession } from '../../src/main/capture-helper-session';

const request = { generation: 1, requestId: 'request-A', targetId: 'target-A' };
function fakeChild() {
  const emitter = new EventEmitter();
  const stdin = new PassThrough();
  let input = '';
  stdin.on('data', (chunk: Buffer) => {
    input += chunk.toString();
  });
  const child = Object.assign(emitter, {
    stdin,
    stdout: new PassThrough(),
    stderr: new PassThrough(),
    kill: vi.fn(() => true),
  });
  return {
    child: child as unknown as ChildProcessWithoutNullStreams,
    raw: child,
    context: () => JSON.parse(input) as Record<string, unknown>,
  };
}
function reply(context: Record<string, unknown>) {
  const header = Buffer.from(
    JSON.stringify({
      version: 1,
      ...context,
      status: 'frame',
      format: 'bgra8',
      width: 1,
      height: 1,
      byteLength: 4,
    }),
  );
  const bytes = Buffer.alloc(4 + header.length + 4);
  bytes.writeUInt32LE(header.length);
  header.copy(bytes, 4);
  bytes.set([0, 0, 255, 255], 4 + header.length);
  return bytes;
}
function setup() {
  const f = fakeChild();
  const launch = vi.fn(() => f.child);
  const session = createHelperSession(launch, {
    timeoutMs: 100,
    killGraceMs: 20,
  });
  return { ...f, launch, session };
}
const signal = () => new AbortController().signal;
afterEach(() => vi.useRealTimers());

describe('helper session ownership and event races', () => {
  it('does no idle work, waits for EOF and close, then returns one frame', async () => {
    const { session, raw, context, launch } = setup();
    expect(launch).not.toHaveBeenCalled();
    const result = session.run(request, signal());
    let resolved = false;
    void result.then(() => {
      resolved = true;
    });
    raw.stdout.emit('data', reply(context()));
    raw.emit('exit', 0, null);
    await Promise.resolve();
    expect(resolved).toBe(false);
    raw.stdout.emit('end');
    raw.emit('close', 0, null);
    expect(await result).toEqual({
      status: 'frame',
      format: 'bgra8',
      width: 1,
      height: 1,
      bytes: Uint8Array.of(0, 0, 255, 255),
    });
    expect(raw.kill).not.toHaveBeenCalled();
    expect(raw.stdout.listenerCount('data')).toBe(0);
    expect(raw.listenerCount('close')).toBe(0);
  });

  it('rejects busy requests, retains ownership until close and uses fresh session IDs', async () => {
    const children = [fakeChild(), fakeChild()];
    const launch = vi.fn(() => children[launch.mock.calls.length - 1]!.child);
    const session = createHelperSession(launch);
    const first = session.run(request, signal());
    const one = children[0]!;
    expect(await session.run(request, signal())).toEqual({
      status: 'no-image',
      code: 'unavailable',
    });
    one.raw.stdout.emit('data', reply(one.context()));
    one.raw.stdout.emit('end');
    one.raw.emit('close', 0, null);
    await first;
    const next = session.run(request, signal());
    const two = children[1]!;
    expect(two.context().sessionId).not.toBe(one.context().sessionId);
    two.raw.stdout.emit('data', reply(one.context()));
    expect(two.raw.kill).toHaveBeenCalledWith('SIGKILL');
    two.raw.emit('close', null, 'SIGKILL');
    expect(await next).toEqual({ status: 'no-image', code: 'unavailable' });
  });

  it.each([
    'cancel',
    'dispose',
    'stderr',
    'stdout-error',
    'stdin-error',
    'stderr-error',
    'child-error',
    'crash',
    'signal',
    'malformed',
    'text-output',
  ])('discards complete bytes on %s before close', async (mode) => {
    const { session, raw, context } = setup();
    const controller = new AbortController();
    const result = session.run(request, controller.signal);
    raw.stdout.emit('data', reply(context()));
    if (mode === 'cancel') controller.abort();
    else if (mode === 'dispose') session.dispose();
    else if (mode === 'stderr')
      raw.stderr.emit('data', Buffer.from('synthetic diagnostic'));
    else if (mode === 'stdout-error')
      raw.stdout.emit('error', new Error('private'));
    else if (mode === 'stdin-error')
      raw.stdin.emit('error', new Error('private'));
    else if (mode === 'stderr-error')
      raw.stderr.emit('error', new Error('private'));
    else if (mode === 'child-error') raw.emit('error', new Error('private'));
    else if (mode === 'crash') raw.emit('exit', 1, null);
    else if (mode === 'signal') raw.emit('exit', null, 'SIGTERM');
    else
      raw.stdout.emit(
        'data',
        mode === 'text-output' ? 'untrusted text' : Buffer.of(1),
      );
    expect(raw.kill).toHaveBeenCalledTimes(
      ['crash', 'signal'].includes(mode) ? 0 : 1,
    );
    raw.stdout.emit('data', reply(context()));
    raw.stdout.emit('end');
    raw.emit('close', 0, null);
    expect(await result).toEqual({
      status: 'no-image',
      code: ['cancel', 'dispose'].includes(mode) ? 'cancelled' : 'unavailable',
    });
  });

  it.each(['missing-eof', 'truncated', 'bad-exit', 'signal'])(
    'denies %s at close',
    async (mode) => {
      const { session, raw, context } = setup();
      const result = session.run(request, signal());
      if (mode !== 'truncated') raw.stdout.emit('data', reply(context()));
      if (mode !== 'missing-eof') raw.stdout.emit('end');
      raw.emit(
        'close',
        mode === 'bad-exit' ? 1 : 0,
        mode === 'signal' ? 'SIGTERM' : null,
      );
      expect(await result).toEqual({ status: 'no-image', code: 'unavailable' });
    },
  );

  it.each(['false', 'throw', 'true'])(
    'bounds timeout even if kill returns %s, blocks until observed close',
    async (kill) => {
      vi.useFakeTimers();
      const { session, raw, context, launch } = setup();
      raw.kill.mockImplementation(() => {
        if (kill === 'throw') throw new Error('private');
        return kill === 'true';
      });
      const result = session.run(request, signal());
      raw.stdout.emit('data', reply(context()));
      await vi.advanceTimersByTimeAsync(120);
      expect(await result).toEqual({ status: 'no-image', code: 'timeout' });
      expect(await session.run(request, signal())).toEqual({
        status: 'no-image',
        code: 'unavailable',
      });
      expect(launch).toHaveBeenCalledTimes(1);
      raw.stdout.emit('data', reply(context()));
      raw.stdout.emit('end');
      raw.emit('close', 0, null);
      expect(raw.listenerCount('close')).toBe(0);
      expect(vi.getTimerCount()).toBe(0);
    },
  );

  it('handles cancellation before launch and disposal while idle without spawning', async () => {
    const { session, launch } = setup();
    const controller = new AbortController();
    controller.abort();
    expect(await session.run(request, controller.signal)).toEqual({
      status: 'no-image',
      code: 'cancelled',
    });
    session.dispose();
    session.dispose();
    expect(await session.run(request, signal())).toEqual({
      status: 'no-image',
      code: 'unavailable',
    });
    expect(launch).not.toHaveBeenCalled();
  });

  it('rejects invalid context and spawn exceptions without retaining ownership', async () => {
    const launch = vi.fn(() => {
      throw new Error('private launch diagnostic');
    });
    const session = createHelperSession(launch);
    expect(await session.run({ ...request, targetId: '' }, signal())).toEqual({
      status: 'no-image',
      code: 'unavailable',
    });
    expect(launch).not.toHaveBeenCalled();
    expect(await session.run(request, signal())).toEqual({
      status: 'no-image',
      code: 'unavailable',
    });
    expect(await session.run(request, signal())).toEqual({
      status: 'no-image',
      code: 'unavailable',
    });
    expect(launch).toHaveBeenCalledTimes(2);
  });

  it('handles abort during launch and synchronous stdin failure', async () => {
    for (const abort of [true, false]) {
      const f = fakeChild();
      const controller = new AbortController();
      const session = createHelperSession(() => {
        if (abort) controller.abort();
        else
          vi.spyOn(f.raw.stdin, 'end').mockImplementation(() => {
            throw new Error('private write');
          });
        return f.child;
      });
      const result = session.run(request, controller.signal);
      f.raw.emit('close', null, 'SIGKILL');
      expect(await result).toEqual({
        status: 'no-image',
        code: abort ? 'cancelled' : 'unavailable',
      });
    }
  });

  it.each([
    { timeoutMs: 0 },
    { timeoutMs: 30001 },
    { timeoutMs: 1.5 },
    { killGraceMs: 0 },
    { killGraceMs: 5001 },
  ])('validates timer bounds %j', (options) => {
    expect(() => createHelperSession(vi.fn(), options)).toThrow(
      'Invalid helper deadlines',
    );
  });
});
