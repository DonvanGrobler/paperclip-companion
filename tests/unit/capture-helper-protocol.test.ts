import { describe, expect, it } from 'vitest';
import { createHelperResponseDecoder } from '../../src/core/capture-helper-protocol';

const context = {
  sessionId: 'helper-A',
  generation: 1,
  requestId: 'request-A',
  targetId: 'target-A',
};
const header = {
  version: 1,
  ...context,
  status: 'frame',
  format: 'bgra8',
  width: 2,
  height: 1,
  byteLength: 8,
};
const pixels = new Uint8Array([0, 0, 255, 255, 255, 0, 0, 255]);
function wire(metadata: unknown = header, body = pixels) {
  const json = new TextEncoder().encode(JSON.stringify(metadata));
  const bytes = new Uint8Array(4 + json.length + body.length);
  new DataView(bytes.buffer).setUint32(0, json.length, true);
  bytes.set(json, 4);
  bytes.set(body, 4 + json.length);
  return bytes;
}
function decode(bytes: Uint8Array) {
  const decoder = createHelperResponseDecoder(context);
  decoder.push(bytes);
  return decoder.finish();
}

describe('synthetic helper response boundary', () => {
  it('accepts a matching frame once and transfers an independent owned buffer', () => {
    const bytes = wire();
    const decoder = createHelperResponseDecoder(context);
    expect(decoder.push(bytes)).toBe(true);
    bytes.fill(0);
    const result = decoder.finish();
    expect(result).toEqual({
      status: 'frame',
      width: 2,
      height: 1,
      format: 'bgra8',
      bytes: pixels,
    });
    expect(decoder.finish()).toBeNull();
    expect(decoder.push(wire())).toBe(false);
    decoder.cancel();
    expect(result?.status === 'frame' && result.bytes).toEqual(pixels);
  });

  it('accepts every two-chunk split and byte-by-byte delivery', () => {
    const bytes = wire();
    for (let split = 0; split <= bytes.length; split++) {
      const decoder = createHelperResponseDecoder(context);
      expect(decoder.push(bytes.subarray(0, split))).toBe(true);
      expect(decoder.push(bytes.subarray(split))).toBe(true);
      expect(decoder.finish()?.status).toBe('frame');
    }
    const decoder = createHelperResponseDecoder(context);
    for (const byte of bytes)
      expect(decoder.push(Uint8Array.of(byte))).toBe(true);
    expect(decoder.finish()?.status).toBe('frame');
  });

  it.each(['cancelled', 'unavailable', 'timeout', 'invalid-target'])(
    'accepts only a bounded no-image result for %s',
    (code) => {
      expect(
        decode(
          wire(
            { version: 1, ...context, status: 'no-image', code, byteLength: 0 },
            new Uint8Array(),
          ),
        ),
      ).toEqual({ status: 'no-image', code });
    },
  );

  it.each([
    { version: 2 },
    { sessionId: 'helper-B' },
    { generation: 2 },
    { requestId: 'request-B' },
    { targetId: 'target-B' },
    { status: 'other' },
    { width: 0 },
    { height: -1 },
    { width: 1025 },
    { height: 1025 },
    { width: 1.5 },
    { height: '1' },
    { width: null },
    { format: 'rgba8' },
    { byteLength: 7 },
    { byteLength: 9 },
    { byteLength: 4294967295 },
    { extra: 'private diagnostics' },
    { code: 'unexpected' },
  ])('rejects malformed or mismatched metadata %j', (change) => {
    const decoder = createHelperResponseDecoder(context);
    expect(decoder.push(wire({ ...header, ...change }))).toBe(false);
    expect(decoder.push(wire())).toBe(false);
    expect(decoder.finish()).toBeNull();
  });

  it.each([
    null,
    [],
    true,
    123,
    'text',
    {},
    { ...header, targetId: undefined },
  ])('rejects invalid header shapes %j', (value) =>
    expect(decode(wire(value))).toBeNull(),
  );

  it.each([
    { code: 'private exception text' },
    { byteLength: 1 },
    { width: 2 },
  ])('rejects malformed no-image headers %j', (change) => {
    expect(
      decode(
        wire(
          {
            version: 1,
            ...context,
            status: 'no-image',
            code: 'timeout',
            byteLength: 0,
            ...change,
          },
          new Uint8Array(),
        ),
      ),
    ).toBeNull();
  });

  it('rejects each truncation and never accepts a late continuation', () => {
    const bytes = wire();
    for (let end = 0; end < bytes.length; end++) {
      const decoder = createHelperResponseDecoder(context);
      decoder.push(bytes.subarray(0, end));
      expect(decoder.finish()).toBeNull();
      expect(decoder.push(bytes.subarray(end))).toBe(false);
    }
  });

  it('cancellation is terminal before, during and after receiving a complete frame', () => {
    const bytes = wire();
    for (let end = 0; end <= bytes.length; end++) {
      const decoder = createHelperResponseDecoder(context);
      decoder.push(bytes.subarray(0, end));
      decoder.cancel();
      decoder.cancel();
      expect(decoder.push(bytes.subarray(end))).toBe(false);
      expect(decoder.finish()).toBeNull();
    }
  });

  it('rejects trailing bytes and duplicate responses in one or separate chunks', () => {
    const bytes = wire();
    expect(decode(new Uint8Array([...bytes, 0]))).toBeNull();
    expect(decode(new Uint8Array([...bytes, ...bytes]))).toBeNull();
    const decoder = createHelperResponseDecoder(context);
    expect(decoder.push(bytes)).toBe(true);
    expect(decoder.push(bytes)).toBe(false);
    expect(decoder.finish()).toBeNull();
  });

  it.each([0, 1025, 0xffffffff])(
    'rejects header length %i before allocating payload',
    (size) => {
      const prefix = new Uint8Array(4);
      new DataView(prefix.buffer).setUint32(0, size, true);
      expect(decode(prefix)).toBeNull();
    },
  );

  it('rejects invalid JSON and invalid UTF-8 without exposing their contents', () => {
    for (const body of [Uint8Array.of(123), Uint8Array.of(255)]) {
      const bytes = new Uint8Array(5);
      bytes[0] = 1;
      bytes.set(body, 4);
      expect(decode(bytes)).toBeNull();
    }
  });

  it('accepts exactly the header and pixel limits but not one extra byte', () => {
    const body = new Uint8Array(1024 * 1024 * 4);
    const json = new TextEncoder().encode(
      JSON.stringify({
        ...header,
        width: 1024,
        height: 1024,
        byteLength: body.length,
      }),
    );
    const bytes = new Uint8Array(4 + 1024 + body.length);
    new DataView(bytes.buffer).setUint32(0, 1024, true);
    bytes.fill(32, 4, 1028);
    bytes.set(json, 4);
    expect(decode(bytes)?.status).toBe('frame');
    const decoder = createHelperResponseDecoder(context);
    expect(decoder.push(new Uint8Array(bytes.length + 1))).toBe(false);
    expect(decoder.finish()).toBeNull();
  });

  it('copies expected identifiers so later caller mutation cannot retarget a reply', () => {
    const mutable = { ...context };
    const decoder = createHelperResponseDecoder(mutable);
    mutable.targetId = 'target-B';
    expect(decoder.push(wire())).toBe(true);
    expect(decoder.finish()?.status).toBe('frame');
  });

  it.each([
    { sessionId: '' },
    { targetId: 'private title!' },
    { requestId: 'a'.repeat(129) },
    { generation: 0 },
    { generation: 1.5 },
    { generation: Number.MAX_SAFE_INTEGER + 1 },
  ])('rejects invalid trusted context %j', (change) => {
    expect(() =>
      createHelperResponseDecoder({ ...context, ...change }),
    ).toThrow('Invalid helper context');
  });
});
