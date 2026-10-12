/** Provisional synthetic helper contract. Not wired to Electron or native capture. */
export type HelperContext = Readonly<{
  sessionId: string;
  generation: number;
  requestId: string;
  targetId: string;
}>;
type NoImageCode = 'cancelled' | 'unavailable' | 'timeout' | 'invalid-target';
export type HelperResponse =
  | {
      status: 'frame';
      format: 'bgra8';
      width: number;
      height: number;
      bytes: Uint8Array;
    }
  | { status: 'no-image'; code: NoImageCode };
type FrameHeader = {
  status: 'frame';
  width: number;
  height: number;
  byteLength: number;
};
type Header =
  FrameHeader | { status: 'no-image'; code: NoImageCode; byteLength: 0 };

const MAX_HEADER = 1024;
const MAX_PIXELS = 1024 * 1024 * 4;
const commonKeys = [
  'version',
  'sessionId',
  'generation',
  'requestId',
  'targetId',
  'status',
  'byteLength',
];
function isId(value: unknown): value is string {
  return typeof value === 'string' && /^[A-Za-z0-9_-]{1,128}$/.test(value);
}
function dimension(value: unknown): value is number {
  return (
    typeof value === 'number' &&
    Number.isInteger(value) &&
    value > 0 &&
    value <= 1024
  );
}
function parseHeader(
  bytes: Uint8Array,
  expected: HelperContext,
): Header | null {
  let value: unknown;
  try {
    value = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes));
  } catch {
    return null;
  }
  if (typeof value !== 'object' || value === null || Array.isArray(value))
    return null;
  const h = value as Record<string, unknown>;
  if (
    h.version !== 1 ||
    h.sessionId !== expected.sessionId ||
    h.generation !== expected.generation ||
    h.requestId !== expected.requestId ||
    h.targetId !== expected.targetId
  )
    return null;
  const keys =
    h.status === 'frame'
      ? [...commonKeys, 'format', 'width', 'height']
      : [...commonKeys, 'code'];
  if (
    Object.keys(h).length !== keys.length ||
    !keys.every((key) => Object.hasOwn(h, key))
  )
    return null;
  if (
    h.status === 'frame' &&
    h.format === 'bgra8' &&
    dimension(h.width) &&
    dimension(h.height) &&
    h.byteLength === h.width * h.height * 4
  ) {
    return {
      status: 'frame',
      width: h.width,
      height: h.height,
      byteLength: h.byteLength,
    };
  }
  if (
    h.status === 'no-image' &&
    h.byteLength === 0 &&
    (h.code === 'cancelled' ||
      h.code === 'unavailable' ||
      h.code === 'timeout' ||
      h.code === 'invalid-target')
  ) {
    return { status: 'no-image', code: h.code, byteLength: 0 };
  }
  return null;
}

/**
 * One decoder per trusted request and helper lifetime. Identifier matching is
 * correlation, NOT authentication, native identity, consent or authorization.
 * push accepts partial input; only finish at clean EOF can transfer one result.
 * Caller must cancel on timeout, child failure, policy/target invalidation or
 * restart. A future supervisor must bound concurrent decoders and reap children.
 */
export function createHelperResponseDecoder(context: HelperContext) {
  const expected = { ...context };
  if (
    !isId(expected.sessionId) ||
    !isId(expected.requestId) ||
    !isId(expected.targetId) ||
    !Number.isSafeInteger(expected.generation) ||
    expected.generation < 1
  ) {
    throw new Error('Invalid helper context');
  }
  const prefix = new Uint8Array(4);
  const metadata = new Uint8Array(MAX_HEADER);
  let prefixUsed = 0;
  let headerLength = 0;
  let headerUsed = 0;
  let header: Header | null = null;
  let payload: Uint8Array | null = null;
  let payloadUsed = 0;
  let received = 0;
  let terminal = false;

  function cancel(): false {
    terminal = true;
    prefix.fill(0);
    metadata.fill(0);
    payload?.fill(0);
    payload = null;
    header = null;
    return false;
  }

  return {
    cancel,
    push(chunk: Uint8Array): boolean {
      if (terminal) return false;
      // Bound aggregate input before copying or allocating from its contents.
      if (chunk.byteLength > 4 + MAX_HEADER + MAX_PIXELS - received)
        return cancel();
      received += chunk.byteLength;
      let offset = 0;
      while (offset < chunk.byteLength) {
        if (prefixUsed < 4) {
          const count = Math.min(4 - prefixUsed, chunk.byteLength - offset);
          prefix.set(chunk.subarray(offset, offset + count), prefixUsed);
          offset += count;
          prefixUsed += count;
          if (prefixUsed === 4) {
            headerLength = new DataView(prefix.buffer).getUint32(0, true);
            if (headerLength === 0 || headerLength > MAX_HEADER)
              return cancel();
          }
        } else if (headerUsed < headerLength) {
          const count = Math.min(
            headerLength - headerUsed,
            chunk.byteLength - offset,
          );
          metadata.set(chunk.subarray(offset, offset + count), headerUsed);
          offset += count;
          headerUsed += count;
          if (headerUsed === headerLength) {
            header = parseHeader(metadata.subarray(0, headerLength), expected);
            metadata.fill(0);
            if (!header) return cancel();
            payload = new Uint8Array(header.byteLength);
          }
        } else {
          // Header validated before allocation. Extra bytes poison the whole reply.
          if (!payload || payloadUsed === payload.length) return cancel();
          const count = Math.min(
            payload.length - payloadUsed,
            chunk.byteLength - offset,
          );
          payload.set(chunk.subarray(offset, offset + count), payloadUsed);
          offset += count;
          payloadUsed += count;
        }
      }
      return true;
    },
    finish(): HelperResponse | null {
      if (terminal) return null;
      if (!header || !payload || payloadUsed !== header.byteLength) {
        cancel();
        return null;
      }
      const result: HelperResponse =
        header.status === 'frame'
          ? {
              status: 'frame',
              format: 'bgra8',
              width: header.width,
              height: header.height,
              bytes: payload,
            }
          : { status: 'no-image', code: header.code };
      // Ownership transfers once; the caller must release/clear successful bytes.
      payload = null;
      cancel();
      return result;
    },
  };
}
