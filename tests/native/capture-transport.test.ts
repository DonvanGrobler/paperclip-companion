import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { afterEach, expect, it } from 'vitest';
import { createHelperSession } from '../../src/main/capture-helper-session';

if (process.platform !== 'win32')
  throw new Error('WINDOWS_NATIVE_TRANSPORT_REQUIRED');
const executable = fileURLToPath(
  new URL('../../dist/native-probe/capture-probe.exe', import.meta.url),
);
const request = {
  generation: 1,
  requestId: 'request-A',
  targetId: 'synthetic-only',
};
const context = { sessionId: 'helper-A', ...request };
const children: {
  child: ChildProcessWithoutNullStreams;
  closed: Promise<void>;
  didClose: () => boolean;
  diagnostic: () => string;
}[] = [];
function launch(args = ['--transport-self-test']) {
  const child = spawn(executable, args, {
    shell: false,
    detached: false,
    windowsHide: true,
    stdio: ['pipe', 'pipe', 'pipe'],
    env: process.env.SystemRoot ? { SystemRoot: process.env.SystemRoot } : {},
  });
  let didClose = false;
  let stderr = '';
  child.on('error', () => {});
  child.stderr.on('data', (chunk: Buffer) => {
    stderr += chunk
      .subarray(0, Math.max(0, 256 - stderr.length))
      .toString('ascii');
  });
  const diagnostic = () => {
    const match =
      /^FAIL native capture-item probe: ([a-z-]+)(?: HRESULT=([0-9A-F]{8}))?\r?\n$/.exec(
        stderr,
      );
    const stages = [
      'transport-pipes',
      'transport-context',
      'create-fixture',
      'paint-fixture',
      'activation-factory',
      'create-item',
      'subscribe-closed',
      'item-size',
      'capture-supported',
      'd3d-device',
      'frame-pool',
      'start-frame',
      'await-frame',
      'frame-bounds',
      'readback',
      'synthetic-landmarks',
      'copy-content-rows',
      'transport-native-cleanup',
      'await-closed',
      'transport-output',
    ];
    return match && stages.includes(match[1]!)
      ? `NATIVE_TRANSPORT_FAILED ${match[1]} ${match[2] ?? ''}`
      : 'NATIVE_TRANSPORT_FAILED';
  };
  const closed = new Promise<void>((resolve) =>
    child.once('close', () => {
      didClose = true;
      resolve();
    }),
  );
  children.push({ child, closed, didClose: () => didClose, diagnostic });
  return child;
}
afterEach(async () => {
  await Promise.all(
    children.map(async (entry) => {
      if (!entry.didClose()) entry.child.kill('SIGKILL');
      await entry.closed;
    }),
  );
  children.length = 0;
});

it('receives three sequential real fixture frames, validates landmarks and clears bytes', async () => {
  const session = createHelperSession(launch, {
    timeoutMs: 10000,
    killGraceMs: 3000,
  });
  try {
    for (let generation = 1; generation <= 3; generation++) {
      const result = await session.run(
        { ...request, generation },
        new AbortController().signal,
      );
      // Never assert on a frame object/buffer: a failed assertion must not dump pixels.
      if (result.status !== 'frame')
        throw new Error(children.at(-1)!.diagnostic());
      try {
        expect(
          result.width > 0 &&
            result.width <= 1024 &&
            result.height > 0 &&
            result.height <= 1024,
        ).toBe(true);
        expect(
          result.bytes.byteLength === result.width * result.height * 4,
        ).toBe(true);
        const left =
          (Math.floor(result.height / 2) * result.width +
            Math.floor(result.width / 4)) *
          4;
        const right =
          (Math.floor(result.height / 2) * result.width +
            Math.floor((result.width * 3) / 4)) *
          4;
        expect(
          result.bytes[left + 2]! > 200 &&
            result.bytes[left + 1]! < 40 &&
            result.bytes[left]! < 40,
        ).toBe(true);
        expect(
          result.bytes[right]! > 200 &&
            result.bytes[right + 1]! < 40 &&
            result.bytes[right + 2]! < 40,
        ).toBe(true);
        expect(children.at(-1)!.didClose()).toBe(true);
      } finally {
        result.bytes.fill(0);
      }
    }
  } finally {
    session.dispose();
  }
});

const invalidInputs = [
  '',
  '{',
  'null',
  '[]',
  JSON.stringify({ ...context, extra: true }),
  JSON.stringify({ ...context, sessionId: '' }),
  JSON.stringify({ ...context, targetId: 'external title!' }),
  JSON.stringify({ ...context, requestId: 'x'.repeat(129) }),
  JSON.stringify({ ...context, generation: 0 }),
  JSON.stringify({ ...context, generation: -1 }),
  JSON.stringify({ ...context, generation: 1.5 }),
  JSON.stringify({ ...context, generation: 9007199254740992 }),
  JSON.stringify({ ...context, generation: '1' }),
  JSON.stringify({ ...context, targetId: undefined }),
  ' '.repeat(1025),
];
it.each(invalidInputs.map((input, index) => ({ input, index })))(
  'rejects malformed request $index before any output',
  async ({ input }) => {
    const child = launch();
    let outputBytes = 0;
    child.stdout.on('data', (chunk: Buffer) => {
      outputBytes += chunk.length;
    });
    child.stderr.on('data', () => {}); // Fixed diagnostics discarded, never echoed.
    child.stdin.on('error', () => {}); // Oversize rejection can close stdin early.
    const exit = new Promise<number | null>((resolve) =>
      child.once('close', (code) => resolve(code)),
    );
    child.stdin.end(input);
    expect(await exit).toBe(1);
    expect(outputBytes).toBe(0);
  },
);

it('rejects unsupported CLI options before native initialization', async () => {
  const child = launch(['--transport-self-test', '--external-target']);
  let outputBytes = 0;
  child.stdout.on('data', (chunk: Buffer) => {
    outputBytes += chunk.length;
  });
  child.stderr.on('data', () => {});
  child.stdin.on('error', () => {});
  child.stdin.end();
  const exit = new Promise<number | null>((resolve) =>
    child.once('close', (code) => resolve(code)),
  );
  expect(await exit).toBe(2);
  expect(outputBytes).toBe(0);
});

it('rejects cancellation after native output and observes child closure', async () => {
  let ready!: Promise<void>;
  const session = createHelperSession(
    () => {
      const child = launch();
      ready = new Promise<void>((resolve, reject) => {
        child.stdout.once('data', () => resolve());
        child.once('error', () => reject(new Error('NATIVE_LAUNCH_FAILED')));
        child.once('close', () => reject(new Error('NATIVE_OUTPUT_REQUIRED')));
      });
      return child;
    },
    { timeoutMs: 10000, killGraceMs: 3000 },
  );
  const controller = new AbortController();
  try {
    const result = session.run(request, controller.signal);
    await ready;
    controller.abort();
    const outcome = await result;
    try {
      expect(
        outcome.status === 'no-image' && outcome.code === 'cancelled',
      ).toBe(true);
    } finally {
      if (outcome.status === 'frame') outcome.bytes.fill(0);
    }
    expect(children[0]!.didClose()).toBe(true);
  } finally {
    session.dispose();
  }
});

it('bounds a stalled native stdin request and reaps the child', async () => {
  // Trusted fault wrapper intentionally withholds EOF; the helper cannot parse
  // or create a window. The supervisor must time out and close it without bytes.
  const session = createHelperSession(
    () => {
      const child = launch();
      child.stdin.end = () => child.stdin;
      return child;
    },
    { timeoutMs: 100, killGraceMs: 3000 },
  );
  try {
    const outcome = await session.run(request, new AbortController().signal);
    try {
      expect(outcome.status === 'no-image' && outcome.code === 'timeout').toBe(
        true,
      );
    } finally {
      if (outcome.status === 'frame') outcome.bytes.fill(0);
    }
    expect(children[0]!.didClose()).toBe(true);
  } finally {
    session.dispose();
  }
});
