import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { createHelperSession } from '../../src/main/capture-helper-session';

const fixture = fileURLToPath(
  new URL('../fixtures/helper/child.ts', import.meta.url),
);
const request = { generation: 1, requestId: 'request-A', targetId: 'target-A' };
const children: {
  child: ChildProcessWithoutNullStreams;
  closed: Promise<void>;
  didClose: () => boolean;
}[] = [];
function launch(mode: string) {
  // Test-owned absolute executable/script and allowlisted scenario; no shell,
  // inherited NODE_OPTIONS, target HWND, prompt or image argument.
  const child = spawn(process.execPath, [fixture, mode], {
    shell: false,
    windowsHide: true,
    detached: false,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {},
  });
  let didClose = false;
  const closed = new Promise<void>((resolve) =>
    child.once('close', () => {
      didClose = true;
      resolve();
    }),
  );
  children.push({ child, closed, didClose: () => didClose });
  return child;
}
afterEach(async () => {
  // Test cleanup also runs if an assertion fails; never leave fixture children.
  await Promise.all(
    children.map(async (entry) => {
      if (!entry.didClose()) entry.child.kill('SIGKILL');
      await entry.closed;
    }),
  );
  children.length = 0;
});

it('uses real pipes and accepts success only after the fixed child closes', async () => {
  const session = createHelperSession(() => launch('success'));
  for (let generation = 1; generation <= 2; generation++) {
    const result = await session.run(
      { ...request, generation },
      new AbortController().signal,
    );
    expect(result).toEqual({
      status: 'frame',
      format: 'bgra8',
      width: 1,
      height: 1,
      bytes: Uint8Array.of(0, 0, 255, 255),
    });
    expect(children.at(-1)!.didClose()).toBe(true);
    if (result.status === 'frame') result.bytes.fill(0);
  }
  session.dispose();
}, 15000);

it.each([
  'crash',
  'malformed',
  'stale',
  'stderr',
  'truncated',
  'extra',
  'no-image',
])(
  'rejects real child %s without returning pixels and observes closure',
  async (mode) => {
    const session = createHelperSession(() => launch(mode));
    expect(await session.run(request, new AbortController().signal)).toEqual({
      status: 'no-image',
      code: 'unavailable',
    });
    expect(children[0]!.didClose()).toBe(true);
    session.dispose();
  },
  15000,
);

it.each(['abort', 'dispose'])(
  'kills and reaps a real child on %s after bytes arrive',
  async (mode) => {
    let ready!: Promise<void>;
    const session = createHelperSession(() => {
      const child = launch('hold');
      ready = new Promise<void>((resolve) =>
        child.stdout.once('data', () => resolve()),
      );
      return child;
    });
    const controller = new AbortController();
    const result = session.run(request, controller.signal);
    await ready;
    if (mode === 'abort') controller.abort();
    else session.dispose();
    expect(await result).toEqual({ status: 'no-image', code: 'cancelled' });
    expect(children[0]!.didClose()).toBe(true);
    session.dispose();
  },
  15000,
);

it('terminates a hung real child at its deadline and observes closure', async () => {
  const session = createHelperSession(() => launch('hold'), {
    timeoutMs: 1000,
    killGraceMs: 3000,
  });
  expect(await session.run(request, new AbortController().signal)).toEqual({
    status: 'no-image',
    code: 'timeout',
  });
  expect(children[0]!.didClose()).toBe(true);
  session.dispose();
}, 15000);
