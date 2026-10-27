import type { SafeStorage } from 'electron';
import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type {
  SiwcCredentialRecord,
  SiwcPreparedCredentials,
} from './siwc-auth-transaction';

type Encryption = Pick<
  SafeStorage,
  'isAsyncEncryptionAvailable' | 'encryptStringAsync' | 'decryptStringAsync'
>;
export type SiwcCredentialLoad =
  | {
      status: 'loaded';
      record: Readonly<SiwcCredentialRecord>;
      shouldReEncrypt: boolean;
    }
  | { status: 'missing' | 'unavailable' | 'invalid' | 'stopped' };

const MAX_PLAINTEXT = 65536;
const MAX_CIPHERTEXT = 98304;
const unavailable = () => new Error('CREDENTIAL_STORE_UNAVAILABLE');
function isMissing(error: unknown): boolean {
  try {
    return Object.getOwnPropertyDescriptor(error, 'code')?.value === 'ENOENT';
  } catch {
    return false;
  }
}
function dataRecord(
  value: unknown,
  keys: readonly string[],
): Record<string, unknown> | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const prototype = Object.getPrototypeOf(value);
  if (prototype !== Object.prototype && prototype !== null) return null;
  if (Reflect.ownKeys(value).length !== keys.length) return null;
  const data: Record<string, unknown> = {};
  for (const key of keys) {
    const field = Object.getOwnPropertyDescriptor(value, key);
    if (!field || !Object.hasOwn(field, 'value')) return null;
    data[key] = field.value;
  }
  return data;
}
const text = (value: unknown, max: number): value is string =>
  typeof value === 'string' &&
  value.length > 0 &&
  value.length <= max &&
  /^[\x21-\x7e]+$/.test(value);
function credential(value: unknown): Readonly<SiwcCredentialRecord> | null {
  const data = dataRecord(value, [
    'issuer',
    'subject',
    'clientId',
    'hostId',
    'accessToken',
    'refreshToken',
    'idToken',
    'scopes',
    'expiresAt',
  ]);
  if (
    !data ||
    data.issuer !== 'https://auth.openai.com' ||
    !text(data.subject, 255) ||
    typeof data.clientId !== 'string' ||
    !/^[A-Za-z0-9._-]{1,128}$/.test(data.clientId) ||
    data.clientId === 'dynamic_agent_client' ||
    typeof data.hostId !== 'string' ||
    !/^[A-Za-z0-9._:-]{1,128}$/.test(data.hostId) ||
    !text(data.idToken, 16384) ||
    (data.accessToken !== null && !text(data.accessToken, 16384)) ||
    (data.refreshToken !== null && !text(data.refreshToken, 16384)) ||
    (data.accessToken === null
      ? data.expiresAt !== null
      : typeof data.expiresAt !== 'number' ||
        !Number.isSafeInteger(data.expiresAt) ||
        data.expiresAt <= 0 ||
        data.expiresAt > 8640000000000000) ||
    !Array.isArray(data.scopes) ||
    Object.getPrototypeOf(data.scopes) !== Array.prototype
  )
    return null;
  const length = Object.getOwnPropertyDescriptor(data.scopes, 'length')!
    .value as number;
  if (length > 2048 || Reflect.ownKeys(data.scopes).length !== length + 1)
    return null;
  const scopes: string[] = [];
  for (let index = 0; index < length; index++) {
    const field = Object.getOwnPropertyDescriptor(data.scopes, String(index));
    if (
      !field ||
      !Object.hasOwn(field, 'value') ||
      typeof field.value !== 'string' ||
      !/^[\x21\x23-\x5b\x5d-\x7e]+$/.test(field.value)
    )
      return null;
    scopes.push(field.value);
  }
  if (
    scopes.join(' ').length > 4096 ||
    new Set(scopes).size !== scopes.length ||
    (scopes.includes('resource.invoke') &&
      scopes.includes('chatgpt.tokens.use.direct') &&
      data.accessToken === null)
  )
    return null;
  return Object.freeze({
    issuer: data.issuer,
    subject: data.subject,
    clientId: data.clientId,
    hostId: data.hostId,
    accessToken: data.accessToken as string | null,
    refreshToken: data.refreshToken as string | null,
    idToken: data.idToken,
    expiresAt: data.expiresAt as number | null,
    scopes: Object.freeze(scopes),
  });
}
function serialize(value: unknown): string | null {
  const record = credential(value);
  if (!record) return null;
  const serialized = JSON.stringify({ version: 1, record });
  return Buffer.byteLength(serialized, 'utf8') <= MAX_PLAINTEXT
    ? serialized
    : null;
}
interface Work {
  signal: AbortSignal;
  stage: string | null;
  stop: () => void;
}

/**
 * Unwired main-only Windows store. One owner/process per trusted private local directory.
 * Encryption is async; only the bounded, synchronous same-directory rename installs.
 * Restored credentials are private data, never proof of a current session or consent.
 */
export function createWindowsSiwcCredentialStore(
  directory: string,
  encryption: Encryption,
) {
  if (
    typeof directory !== 'string' ||
    !path.isAbsolute(directory) ||
    directory.length > 2048 ||
    /[\0\r\n]/.test(directory)
  )
    throw new Error('CREDENTIAL_STORE_CONFIGURATION');
  const installed = path.join(directory, 'credentials.v1.bin');
  let active: Work | null = null;
  let disposed = false;
  function release(work: Work) {
    if (active === work) active = null;
    work.signal.removeEventListener('abort', work.stop);
    const stage = work.stage;
    work.stage = null;
    if (stage) {
      try {
        fs.unlinkSync(stage);
      } catch {
        /* Encrypted orphan is never restored. */
      }
    }
  }
  const alive = (work: Work) =>
    !disposed && active === work && !work.signal.aborted;
  function start(signal: AbortSignal): Work | null {
    if (disposed || process.platform !== 'win32' || signal.aborted || active)
      return null;
    const work: Work = { signal, stage: null, stop: () => release(work) };
    active = work;
    signal.addEventListener('abort', work.stop, { once: true });
    return work;
  }
  function checkDirectory(create: boolean) {
    if (create) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink()) throw unavailable();
  }
  function readInstalled(): Buffer | null {
    checkDirectory(false);
    const stat = fs.lstatSync(installed);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size < 1 ||
      stat.size > MAX_CIPHERTEXT
    )
      return null;
    const descriptor = fs.openSync(installed, 'r');
    const bytes = Buffer.alloc(MAX_CIPHERTEXT + 1);
    try {
      const opened = fs.fstatSync(descriptor);
      if (!opened.isFile() || opened.size < 1 || opened.size > MAX_CIPHERTEXT)
        return null;
      let length = 0;
      while (length < bytes.length) {
        const count = fs.readSync(
          descriptor,
          bytes,
          length,
          bytes.length - length,
          null,
        );
        if (count === 0) break;
        length += count;
      }
      return length > 0 && length <= MAX_CIPHERTEXT
        ? Buffer.from(bytes.subarray(0, length))
        : null;
    } finally {
      bytes.fill(0);
      fs.closeSync(descriptor);
    }
  }
  return Object.freeze({
    async prepare(
      value: unknown,
      signal: AbortSignal,
    ): Promise<SiwcPreparedCredentials> {
      const work = start(signal);
      if (!work) throw unavailable();
      let ciphertext: Buffer | undefined;
      try {
        const plaintext = serialize(value);
        value = undefined;
        if (!plaintext || !alive(work)) throw unavailable();
        const available = await encryption.isAsyncEncryptionAvailable();
        if (!alive(work) || available !== true) throw unavailable();
        ciphertext = await encryption.encryptStringAsync(plaintext);
        if (
          !alive(work) ||
          !Buffer.isBuffer(ciphertext) ||
          ciphertext.length < 1 ||
          ciphertext.length > MAX_CIPHERTEXT
        )
          throw unavailable();
        checkDirectory(true);
        const stage = path.join(directory, `credential-${randomUUID()}.stage`);
        const descriptor = fs.openSync(stage, 'wx', 0o600);
        work.stage = stage; // Only remove a file this operation successfully created.
        try {
          fs.writeFileSync(descriptor, ciphertext);
          fs.fsyncSync(descriptor);
        } finally {
          fs.closeSync(descriptor);
        }
        return Object.freeze({
          commit() {
            if (!alive(work)) return false;
            try {
              fs.renameSync(work.stage!, installed);
            } catch {
              release(work);
              return false;
            }
            // Rename is the only install and final fallible filesystem operation.
            work.stage = null;
            release(work);
            return true;
          },
          discard: work.stop,
        });
      } catch {
        release(work);
        throw unavailable();
      } finally {
        if (Buffer.isBuffer(ciphertext)) ciphertext.fill(0);
      }
    },
    async load(signal: AbortSignal): Promise<SiwcCredentialLoad> {
      const work = start(signal);
      if (!work)
        return {
          status: disposed || signal.aborted ? 'stopped' : 'unavailable',
        };
      let bytes: Buffer | null = null;
      let decrypting = false;
      try {
        const available = await encryption.isAsyncEncryptionAvailable();
        if (!alive(work)) return { status: 'stopped' };
        if (available !== true) return { status: 'unavailable' };
        bytes = readInstalled();
        if (!bytes) return { status: 'invalid' };
        decrypting = true;
        const result = dataRecord(await encryption.decryptStringAsync(bytes), [
          'result',
          'shouldReEncrypt',
        ]);
        if (!alive(work)) return { status: 'stopped' };
        if (
          !result ||
          typeof result.result !== 'string' ||
          result.result.length > MAX_PLAINTEXT ||
          Buffer.byteLength(result.result, 'utf8') > MAX_PLAINTEXT ||
          typeof result.shouldReEncrypt !== 'boolean'
        )
          return { status: 'invalid' };
        const envelope = dataRecord(JSON.parse(result.result) as unknown, [
          'version',
          'record',
        ]);
        const record =
          envelope?.version === 1 ? credential(envelope.record) : null;
        if (!alive(work)) return { status: 'stopped' };
        return record
          ? {
              status: 'loaded',
              record,
              shouldReEncrypt: result.shouldReEncrypt,
            }
          : { status: 'invalid' };
      } catch (error) {
        if (!alive(work)) return { status: 'stopped' };
        return {
          status: decrypting
            ? 'invalid'
            : isMissing(error)
              ? 'missing'
              : 'unavailable',
        };
      } finally {
        bytes?.fill(0);
        release(work);
      }
    },
    dispose() {
      disposed = true;
      if (active) release(active);
    },
  });
}
