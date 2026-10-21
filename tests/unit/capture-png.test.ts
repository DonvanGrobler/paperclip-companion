import { deflateSync } from 'node:zlib';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createPngEncoder,
  type PngCompressor,
  type PngResult,
} from '../../src/main/capture-png';
import { readSyntheticPng, syntheticBgra } from '../fixtures/png';

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function held() {
  const pending: { input: Buffer; done: Parameters<PngCompressor>[1] }[] = [];
  const compress: PngCompressor = vi.fn((input, done) =>
    pending.push({ input, done }),
  );
  const encoder = createPngEncoder({ compress, timeoutMs: 100 });
  function complete(index = 0) {
    const task = pending[index]!;
    const output = deflateSync(task.input);
    task.done(null, output);
    return output;
  }
  return { encoder, pending, compress, complete };
}

const signal = () => new AbortController().signal;
async function expectNoImage(promise: Promise<PngResult>, code: string) {
  const result = await promise;
  try {
    expect(result.status === 'no-image' && result.code === code).toBe(true);
  } finally {
    if (result.status === 'image') result.bytes.fill(0);
  }
}

describe('memory-only PNG conversion, not capture authorization', () => {
  it('encodes exact row order/colors and only critical chunks with valid CRCs', async () => {
    const frame = syntheticBgra();
    const encoder = createPngEncoder();
    const result = await encoder.encode(frame, 'straight', signal());
    if (result.status !== 'image') throw new Error('PNG_EXPECTED');
    try {
      const decoded = readSyntheticPng(result.bytes);
      try {
        expect(result.mimeType).toBe('image/png');
        expect(decoded.width === 2 && decoded.height === 2).toBe(true);
        const expected = [
          255, 0, 0, 255, 0, 0, 255, 255, 0, 255, 0, 255, 255, 255, 0, 255,
        ];
        expect(
          decoded.rgba.every((value, index) => value === expected[index]),
        ).toBe(true);
        expect(frame.bytes[2] === 255 && frame.bytes[0] === 0).toBe(true);
      } finally {
        decoded.rgba.fill(0);
      }
    } finally {
      result.bytes.fill(0);
      frame.bytes.fill(0);
      encoder.dispose();
    }
  });

  it.each(['straight', 'premultiplied'] as const)(
    'normalizes %s alpha and removes hidden transparent RGB',
    async (alpha) => {
      const frame = {
        ...syntheticBgra(),
        width: 2,
        height: 1,
        bytes: Uint8Array.from(
          alpha === 'straight'
            ? [11, 22, 33, 64, 99, 88, 77, 0]
            : [25, 50, 100, 128, 0, 0, 0, 0],
        ),
      };
      const encoder = createPngEncoder();
      const result = await encoder.encode(frame, alpha, signal());
      if (result.status !== 'image') throw new Error('PNG_EXPECTED');
      try {
        const decoded = readSyntheticPng(result.bytes);
        try {
          const expected =
            alpha === 'straight'
              ? [33, 22, 11, 64, 0, 0, 0, 0]
              : [199, 100, 50, 128, 0, 0, 0, 0];
          expect(
            decoded.rgba.every((value, index) => value === expected[index]),
          ).toBe(true);
        } finally {
          decoded.rgba.fill(0);
        }
      } finally {
        result.bytes.fill(0);
        frame.bytes.fill(0);
        encoder.dispose();
      }
    },
  );

  it('copies only the input view before asynchronous work and clears private copies', async () => {
    const state = held();
    const original = syntheticBgra();
    const backing = new Uint8Array(24).fill(71);
    backing.set(original.bytes, 4);
    const frame = { ...original, bytes: backing.subarray(4, 20) };
    const promise = state.encoder.encode(frame, 'straight', signal());
    frame.bytes.fill(0);
    const compressed = state.complete();
    const result = await promise;
    if (result.status !== 'image') throw new Error('PNG_EXPECTED');
    try {
      const decoded = readSyntheticPng(result.bytes);
      try {
        expect(
          decoded.rgba[0] === 255 &&
            decoded.rgba[4] === 0 &&
            decoded.rgba[6] === 255,
        ).toBe(true);
      } finally {
        decoded.rgba.fill(0);
      }
      expect(state.pending[0]!.input.every((value) => value === 0)).toBe(true);
      expect(compressed.every((value) => value === 0)).toBe(true);
      expect(backing[0] === 71 && backing[23] === 71).toBe(true);
    } finally {
      result.bytes.fill(0);
      backing.fill(0);
      original.bytes.fill(0);
      state.encoder.dispose();
    }
  });

  const invalid = [
    null,
    1,
    [],
    {},
    { ...syntheticBgra(), width: 0 },
    { ...syntheticBgra(), width: 1025 },
    { ...syntheticBgra(), height: -1 },
    { ...syntheticBgra(), height: 0.5 },
    { ...syntheticBgra(), height: 1025 },
    { ...syntheticBgra(), height: '2' },
    { ...syntheticBgra(), width: NaN },
    { ...syntheticBgra(), width: '2' },
    { ...syntheticBgra(), format: 'rgba8' },
    { ...syntheticBgra(), status: 'no-image' },
    { ...syntheticBgra(), extra: true },
    { ...syntheticBgra(), bytes: [1, 2, 3] },
    { ...syntheticBgra(), bytes: new Uint8Array(15) },
    { ...syntheticBgra(), bytes: new Uint8Array(17) },
    { ...syntheticBgra(), bytes: new Uint8Array(new SharedArrayBuffer(16)) },
    {
      ...syntheticBgra(),
      get width() {
        throw new Error('PRIVATE_METADATA');
      },
    },
  ];
  it.each(invalid.map((frame, index) => ({ frame, index })))(
    'rejects invalid frame case $index before compression',
    async ({ frame }) => {
      const state = held();
      await expectNoImage(
        state.encoder.encode(frame, 'straight', signal()),
        'invalid-frame',
      );
      expect(state.compress).not.toHaveBeenCalled();
      state.encoder.dispose();
    },
  );

  it.each([undefined, 'unknown', null, 1])(
    'rejects unspecified/unknown alpha mode (%s)',
    async (alpha) => {
      const state = held();
      const frame = syntheticBgra();
      await expectNoImage(
        state.encoder.encode(frame, alpha, signal()),
        'invalid-frame',
      );
      expect(state.compress).not.toHaveBeenCalled();
      frame.bytes.fill(0);
      state.encoder.dispose();
    },
  );

  it('rejects invalid premultiplied samples before compression', async () => {
    const state = held();
    const frame = syntheticBgra();
    frame.bytes[3] = 1;
    await expectNoImage(
      state.encoder.encode(frame, 'premultiplied', signal()),
      'invalid-frame',
    );
    expect(state.compress).not.toHaveBeenCalled();
    frame.bytes.fill(0);
    state.encoder.dispose();
  });

  it.each([0, -1, 0.5, NaN, Infinity, 30001])(
    'rejects invalid deadline %s',
    (timeoutMs) => {
      expect(() => createPngEncoder({ timeoutMs })).toThrow(
        'Invalid PNG deadline',
      );
    },
  );

  it('does no work for pre-abort or disposed owner', async () => {
    const state = held();
    const frame = syntheticBgra();
    const controller = new AbortController();
    controller.abort();
    await expectNoImage(
      state.encoder.encode(frame, 'straight', controller.signal),
      'cancelled',
    );
    state.encoder.dispose();
    await expectNoImage(
      state.encoder.encode(frame, 'straight', signal()),
      'unavailable',
    );
    expect(state.compress).not.toHaveBeenCalled();
    frame.bytes.fill(0);
  });

  it.each(['abort', 'dispose', 'timeout'] as const)(
    'returns no image on %s and keeps work bounded until completion',
    async (reason) => {
      vi.useFakeTimers();
      const state = held();
      const frame = syntheticBgra();
      const controller = new AbortController();
      const pending = state.encoder.encode(
        frame,
        'straight',
        controller.signal,
      );
      await expectNoImage(
        state.encoder.encode(frame, 'straight', signal()),
        'unavailable',
      );
      if (reason === 'abort') controller.abort();
      if (reason === 'dispose') state.encoder.dispose();
      if (reason === 'timeout') await vi.advanceTimersByTimeAsync(100);
      await expectNoImage(
        pending,
        reason === 'timeout' ? 'timeout' : 'cancelled',
      );
      expect(state.pending[0]!.input.some((value) => value !== 0)).toBe(true);
      await expectNoImage(
        state.encoder.encode(frame, 'straight', signal()),
        'unavailable',
      );
      const output = state.complete();
      expect(
        output.every((value) => value === 0) &&
          state.pending[0]!.input.every((value) => value === 0),
      ).toBe(true);
      controller.abort(); // Old abort/listener must not affect fresh work.
      if (reason !== 'dispose') {
        const next = state.encoder.encode(frame, 'straight', signal());
        state.complete(1);
        const result = await next;
        if (result.status !== 'image') throw new Error('PNG_EXPECTED');
        result.bytes.fill(0);
      } else
        await expectNoImage(
          state.encoder.encode(frame, 'straight', signal()),
          'unavailable',
        );
      frame.bytes.fill(0);
      state.encoder.dispose();
    },
  );

  it('handles cancellation inside a trusted compressor and suppresses duplicate callbacks', async () => {
    const controller = new AbortController();
    let input: Buffer | undefined;
    let output: Buffer | undefined;
    const encoder = createPngEncoder({
      compress: (data, done) => {
        input = data;
        controller.abort();
        output = deflateSync(data);
        done(null, output);
        done(null, output);
      },
    });
    const frame = syntheticBgra();
    await expectNoImage(
      encoder.encode(frame, 'straight', controller.signal),
      'cancelled',
    );
    expect(
      input!.every((value) => value === 0) &&
        output!.every((value) => value === 0),
    ).toBe(true);
    frame.bytes.fill(0);
    encoder.dispose();
  });

  it('does not clear a successful PNG on a duplicate callback', async () => {
    const state = held();
    const frame = syntheticBgra();
    const pending = state.encoder.encode(frame, 'straight', signal());
    const output = state.complete();
    const result = await pending;
    if (result.status !== 'image') throw new Error('PNG_EXPECTED');
    try {
      state.pending[0]!.done(null, output);
      const decoded = readSyntheticPng(result.bytes);
      decoded.rgba.fill(0);
    } finally {
      result.bytes.fill(0);
      frame.bytes.fill(0);
      state.encoder.dispose();
    }
  });

  it.each(['throw', 'error', 'missing', 'empty', 'oversized'] as const)(
    'sanitizes %s failures and clears compressor buffers',
    async (kind) => {
      let input: Buffer | undefined;
      let output: Buffer | undefined;
      const encoder = createPngEncoder({
        compress: (data, done) => {
          input = data;
          if (kind === 'throw') throw new Error('PRIVATE_ERROR_TEXT');
          output =
            kind === 'oversized'
              ? Buffer.alloc(4 * 1024 * 1024 + 65537, 3)
              : Buffer.alloc(kind === 'empty' ? 0 : 2, 3);
          done(
            kind === 'error' ? new Error('PRIVATE_ERROR_TEXT') : null,
            kind === 'missing' ? undefined : output,
          );
        },
      });
      const frame = syntheticBgra();
      await expectNoImage(
        encoder.encode(frame, 'straight', signal()),
        'unavailable',
      );
      expect(input!.every((value) => value === 0)).toBe(true);
      if (kind !== 'missing')
        expect(
          output === undefined || output.every((value) => value === 0),
        ).toBe(true);
      output?.fill(0);
      frame.bytes.fill(0);
      encoder.dispose();
    },
  );

  it.each(['abort', 'dispose'] as const)(
    'rechecks %s after trusted frame access before compression',
    async (reason) => {
      const state = held();
      const source = syntheticBgra();
      const controller = new AbortController();
      const frame = {
        ...source,
        get width() {
          if (reason === 'abort') controller.abort();
          else state.encoder.dispose();
          return 2;
        },
      };
      await expectNoImage(
        state.encoder.encode(frame, 'straight', controller.signal),
        'cancelled',
      );
      expect(state.compress).not.toHaveBeenCalled();
      source.bytes.fill(0);
      state.encoder.dispose();
    },
  );

  it('sanitizes an unexpected compressor result without leaving the owner busy', async () => {
    const encoder = createPngEncoder({
      compress: (_input, done) => done(null, {} as Buffer),
    });
    const frame = syntheticBgra();
    await expectNoImage(
      encoder.encode(frame, 'straight', signal()),
      'unavailable',
    );
    await expectNoImage(
      encoder.encode(frame, 'straight', signal()),
      'unavailable',
    );
    frame.bytes.fill(0);
    encoder.dispose();
  });

  it('bounds maximum-size incompressible input without losing channels or rows', async () => {
    const frame = {
      ...syntheticBgra(),
      width: 1024,
      height: 1024,
      bytes: new Uint8Array(4 * 1024 * 1024),
    };
    let seed = 123456789;
    for (let index = 0; index < frame.bytes.length; index++) {
      seed ^= seed << 13;
      seed ^= seed >>> 17;
      seed ^= seed << 5;
      frame.bytes[index] = seed >>> 24;
    }
    const encoder = createPngEncoder();
    const result = await encoder.encode(frame, 'straight', signal());
    if (result.status !== 'image') throw new Error('PNG_EXPECTED');
    try {
      expect(result.bytes.length <= 4 * 1024 * 1024 + 65536 + 57).toBe(true);
      const decoded = readSyntheticPng(result.bytes);
      try {
        let valid = decoded.width === 1024 && decoded.height === 1024;
        for (let pixel = 0; pixel < frame.bytes.length; pixel += 4) {
          const alpha = frame.bytes[pixel + 3]!;
          valid &&=
            decoded.rgba[pixel] ===
              (alpha === 0 ? 0 : frame.bytes[pixel + 2]) &&
            decoded.rgba[pixel + 1] ===
              (alpha === 0 ? 0 : frame.bytes[pixel + 1]) &&
            decoded.rgba[pixel + 2] ===
              (alpha === 0 ? 0 : frame.bytes[pixel]) &&
            decoded.rgba[pixel + 3] === alpha;
        }
        expect(valid).toBe(true);
      } finally {
        decoded.rgba.fill(0);
      }
    } finally {
      result.bytes.fill(0);
      frame.bytes.fill(0);
      encoder.dispose();
    }
  });
});
