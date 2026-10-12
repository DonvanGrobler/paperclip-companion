// Fixed synthetic transport fixture. No capture, network, file writes or descendants.
import process from 'node:process';
import { Buffer } from 'node:buffer';
import { setInterval } from 'node:timers';
const mode = process.argv[2];
const modes = [
  'success',
  'hold',
  'crash',
  'malformed',
  'stale',
  'stderr',
  'truncated',
  'extra',
  'no-image',
];
if (!mode || !modes.includes(mode)) process.exit(2);
let input = '';
process.stdin.setEncoding('utf8');
process.stdin.on('data', (chunk: string) => {
  input += chunk;
  if (input.length > 1024) process.exit(2);
});
process.stdin.on('end', () => {
  const context = JSON.parse(input) as Record<string, unknown>;
  const header: Record<string, unknown> =
    mode === 'no-image'
      ? {
          version: 1,
          ...context,
          status: 'no-image',
          code: 'unavailable',
          byteLength: 0,
        }
      : {
          version: 1,
          ...context,
          status: 'frame',
          format: 'bgra8',
          width: 1,
          height: 1,
          byteLength: 4,
        };
  if (mode === 'stale') header.sessionId = 'old-helper';
  const json = Buffer.from(JSON.stringify(header));
  const prefix = Buffer.alloc(4);
  prefix.writeUInt32LE(mode === 'malformed' ? 1025 : json.length);
  const bytes = Buffer.concat([
    prefix,
    json,
    mode === 'no-image' ? Buffer.alloc(0) : Buffer.from([0, 0, 255, 255]),
  ]);
  if (mode === 'stderr') process.stderr.write('synthetic diagnostic');
  // Distinct writes exercise private stream delivery; receiver cannot rely on chunks.
  process.stdout.write(bytes.subarray(0, 2));
  process.stdout.write(
    bytes.subarray(2, mode === 'truncated' ? bytes.length - 1 : bytes.length),
  );
  if (mode === 'extra') process.stdout.write(Buffer.of(1));
  if (mode === 'crash') process.exitCode = 7;
  if (mode === 'hold') setInterval(() => {}, 1000);
});
