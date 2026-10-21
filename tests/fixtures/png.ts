import { crc32, inflateSync } from 'node:zlib';

/** Independent, deliberately narrow verifier for this slice's synthetic PNGs.
 * Never include pixels/bytes in an exception or an assertion diff. Caller clears rgba.
 */
export function readSyntheticPng(bytes: Uint8Array) {
  const fail = () => {
    throw new Error('INVALID_SYNTHETIC_PNG');
  };
  const png = Buffer.from(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    png.length < 57 ||
    png.length > 4 * 1024 * 1024 + 65536 + 57 ||
    png.subarray(0, 8).toString('hex') !== '89504e470d0a1a0a'
  )
    fail();
  const chunks: { name: string; data: Buffer }[] = [];
  for (let offset = 8; offset < png.length;) {
    if (png.length - offset < 12) fail();
    const length = png.readUInt32BE(offset);
    if (length > png.length - offset - 12) fail();
    const end = offset + 8 + length;
    if (crc32(png.subarray(offset + 4, end)) !== png.readUInt32BE(end)) fail();
    chunks.push({
      name: png.toString('ascii', offset + 4, offset + 8),
      data: png.subarray(offset + 8, end),
    });
    offset = end + 4;
  }
  if (chunks.map((chunk) => chunk.name).join(',') !== 'IHDR,IDAT,IEND') fail();
  const header = chunks[0]!.data;
  if (
    header.length !== 13 ||
    header[8] !== 8 ||
    header[9] !== 6 ||
    header[10] !== 0 ||
    header[11] !== 0 ||
    header[12] !== 0 ||
    chunks[2]!.data.length !== 0
  )
    fail();
  const width = header.readUInt32BE(0);
  const height = header.readUInt32BE(4);
  if (width < 1 || width > 1024 || height < 1 || height > 1024) fail();
  let inflated: Buffer | undefined;
  let rgba: Buffer | undefined;
  try {
    const stride = width * 4 + 1;
    inflated = inflateSync(chunks[1]!.data, {
      maxOutputLength: stride * height,
      rejectGarbageAfterEnd: true,
    });
    if (inflated.length !== stride * height) fail();
    rgba = Buffer.alloc(width * height * 4);
    for (let row = 0; row < height; row++) {
      if (inflated[row * stride] !== 0) fail();
      inflated.copy(
        rgba,
        row * width * 4,
        row * stride + 1,
        (row + 1) * stride,
      );
    }
    const result = { width, height, rgba };
    rgba = undefined;
    return result;
  } finally {
    inflated?.fill(0);
    rgba?.fill(0);
  }
}

export function syntheticBgra() {
  return {
    status: 'frame' as const,
    format: 'bgra8' as const,
    width: 2,
    height: 2,
    bytes: Uint8Array.from([
      0, 0, 255, 255, 255, 0, 0, 255, 0, 255, 0, 255, 0, 255, 255, 255,
    ]),
  };
}
