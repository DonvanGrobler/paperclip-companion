import { crc32, deflate } from 'node:zlib';

export type PngCompressor = (
  input: Buffer,
  done: (error: Error | null, output?: Buffer) => void,
) => void;
type Failure = 'invalid-frame' | 'cancelled' | 'timeout' | 'unavailable';
export type PngResult =
  | { status: 'no-image'; code: Failure }
  | {
      status: 'image';
      mimeType: 'image/png';
      width: number;
      height: number;
      bytes: Uint8Array;
    };
const MAX_COMPRESSED = 4 * 1024 * 1024 + 65536;
const noImage = (code: Failure): PngResult => ({ status: 'no-image', code });
const compressDefault: PngCompressor = (input, done) =>
  deflate(input, { level: 1, maxOutputLength: MAX_COMPRESSED }, done);

function readFrame(value: unknown, alpha: unknown) {
  if (
    typeof value !== 'object' ||
    value === null ||
    Array.isArray(value) ||
    (alpha !== 'straight' && alpha !== 'premultiplied')
  )
    return null;
  const fields = ['status', 'format', 'width', 'height', 'bytes'];
  if (
    Reflect.ownKeys(value).length !== fields.length ||
    !fields.every((field) => Object.hasOwn(value, field))
  )
    return null;
  const { status, format, width, height, bytes } = value as Record<
    string,
    unknown
  >;
  if (
    status !== 'frame' ||
    format !== 'bgra8' ||
    typeof width !== 'number' ||
    !Number.isInteger(width) ||
    width < 1 ||
    width > 1024 ||
    typeof height !== 'number' ||
    !Number.isInteger(height) ||
    height < 1 ||
    height > 1024 ||
    !(bytes instanceof Uint8Array) ||
    !(bytes.buffer instanceof ArrayBuffer) ||
    bytes.byteLength !== width * height * 4
  )
    return null;
  return { width, height, bytes, alpha };
}

function pngBytes(width: number, height: number, compressed: Buffer) {
  const png = Buffer.alloc(compressed.length + 57);
  try {
    png.set([137, 80, 78, 71, 13, 10, 26, 10]);
    const header = Buffer.alloc(13);
    header.writeUInt32BE(width, 0);
    header.writeUInt32BE(height, 4);
    header[8] = 8; // Eight-bit, straight RGBA; no interlace or ancillary metadata.
    header[9] = 6;
    function chunk(offset: number, name: string, data: Uint8Array) {
      png.writeUInt32BE(data.length, offset);
      png.write(name, offset + 4, 4, 'ascii');
      png.set(data, offset + 8);
      const end = offset + 8 + data.length;
      png.writeUInt32BE(crc32(png.subarray(offset + 4, end)), end);
      return end + 4;
    }
    const offset = chunk(8, 'IHDR', header);
    chunk(chunk(offset, 'IDAT', compressed), 'IEND', new Uint8Array(0));
    return png;
  } catch {
    png.fill(0);
    throw new Error('PNG_ASSEMBLY_FAILED');
  }
}

/**
 * Unwired, main-owned conversion. It grants no capture/transmission permission.
 * Caller owns/clears BGRA and any returned PNG; alpha must be established by a
 * trusted adapter, not guessed from bgra8 or asserted by a renderer.
 * compress is a trusted test seam: owns its output, calls done at completion.
 * Abort/deadline denies output but cannot preempt zlib. Keep the input/busy lock
 * until the callback, then clear owned buffers. Never queue conversions.
 */
export function createPngEncoder({
  compress = compressDefault,
  timeoutMs = 5000,
}: { compress?: PngCompressor; timeoutMs?: number } = {}) {
  if (!Number.isInteger(timeoutMs) || timeoutMs < 1 || timeoutMs > 30000)
    throw new Error('Invalid PNG deadline');
  let busy = false;
  let disposed = false;
  let cancelActive: (() => void) | null = null;
  return {
    dispose(): void {
      disposed = true;
      cancelActive?.();
    },
    async encode(
      value: unknown,
      alpha: unknown,
      signal: AbortSignal,
    ): Promise<PngResult> {
      if (disposed || busy) return noImage('unavailable');
      if (signal.aborted) return noImage('cancelled');
      busy = true;
      let rows: Buffer | undefined;
      let frame: ReturnType<typeof readFrame>;
      try {
        frame = readFrame(value, alpha);
        if (!frame) {
          busy = false;
          return noImage('invalid-frame');
        }
        rows = Buffer.alloc((frame.width * 4 + 1) * frame.height);
        for (let y = 0; y < frame.height; y++) {
          const row = y * (frame.width * 4 + 1) + 1; // Filter byte stays zero.
          for (let x = 0; x < frame.width; x++) {
            const source = (y * frame.width + x) * 4;
            const destination = row + x * 4;
            const a = frame.bytes[source + 3]!;
            for (let channel = 0; channel < 3; channel++) {
              const sample = frame.bytes[source + 2 - channel]!;
              if (frame.alpha === 'premultiplied' && sample > a)
                throw new Error('INVALID_ALPHA');
              rows[destination + channel] =
                a === 0
                  ? 0
                  : frame.alpha === 'straight'
                    ? sample
                    : Math.round((sample * 255) / a);
            }
            rows[destination + 3] = a;
          }
        }
      } catch {
        rows?.fill(0);
        busy = false;
        return noImage('invalid-frame');
      }
      const scanlines = rows;
      const { width, height } = frame;
      return new Promise<PngResult>((resolve) => {
        let settled = false;
        let finished = false;
        const deadline = setTimeout(
          () => settle(noImage('timeout')),
          timeoutMs,
        );
        function settle(result: PngResult) {
          if (settled) return;
          settled = true;
          clearTimeout(deadline);
          signal.removeEventListener('abort', abort);
          resolve(result);
        }
        function abort() {
          settle(noImage('cancelled'));
        }
        function done(error: Error | null, output?: Buffer) {
          if (finished) {
            if (Buffer.isBuffer(output)) output.fill(0);
            return;
          }
          finished = true;
          try {
            if (settled) return;
            if (
              error ||
              !Buffer.isBuffer(output) ||
              output.length === 0 ||
              output.length > MAX_COMPRESSED
            ) {
              settle(noImage('unavailable'));
            } else {
              const png = pngBytes(width, height, output);
              settle({
                status: 'image',
                mimeType: 'image/png',
                width,
                height,
                bytes: png,
              });
            }
          } catch {
            settle(noImage('unavailable'));
          } finally {
            scanlines.fill(0);
            if (Buffer.isBuffer(output)) output.fill(0);
            busy = false;
            cancelActive = null;
          }
        }
        cancelActive = abort;
        signal.addEventListener('abort', abort, { once: true });
        try {
          if (signal.aborted || disposed) {
            abort();
            done(null);
          } else compress(scanlines, done);
        } catch {
          done(new Error('PNG_COMPRESSION_FAILED'));
        }
      });
    },
  };
}
