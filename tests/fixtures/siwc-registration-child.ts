import { openSiwcRegistrationStore } from '../../src/main/siwc-registration-store.ts';

// Native restart probe: synthetic nonsecret identifiers via stdin; boolean-only output.
try {
  let expected = '';
  for await (const bytes of process.stdin) expected += String(bytes);
  const owner = openSiwcRegistrationStore(process.argv[2]!);
  const value = owner?.read();
  const isolated =
    !Object.hasOwn(process.env, 'NODE_OPTIONS') &&
    !Object.hasOwn(process.env, 'PAPERCLIP_REGISTRATION_PRIVATE');
  const matches = isolated && !!value && JSON.stringify(value) === expected;
  owner?.dispose();
  process.stdout.write(matches ? 'true' : 'false');
} catch {
  process.stdout.write('false');
  process.exitCode = 1;
}
