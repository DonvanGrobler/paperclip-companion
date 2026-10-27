import { randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

export interface SiwcRegistration {
  registrationId: string;
  clientId: string;
}
export interface SiwcRegistrationCatalog {
  version: 1;
  hostId: string;
  registrations: readonly Readonly<SiwcRegistration>[];
}
export interface SiwcRegistrationStore {
  read(): Readonly<SiwcRegistrationCatalog> | null;
  retainRegistration(value: unknown, signal: AbortSignal): boolean;
  dispose(): void;
}

const UUID =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
const clientId = (value: unknown): value is string =>
  typeof value === 'string' &&
  /^[A-Za-z0-9._-]{1,128}$/.test(value) &&
  value !== 'dynamic_agent_client';
function record(
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
function frozen(
  hostId: string,
  registrations: readonly Readonly<SiwcRegistration>[],
): Readonly<SiwcRegistrationCatalog> {
  return Object.freeze({
    version: 1,
    hostId,
    registrations: Object.freeze(
      registrations.map((item) => Object.freeze({ ...item })),
    ),
  });
}
function parse(text: string): Readonly<SiwcRegistrationCatalog> | null {
  const data = record(JSON.parse(text) as unknown, [
    'version',
    'hostId',
    'registrations',
  ]);
  if (
    !data ||
    data.version !== 1 ||
    typeof data.hostId !== 'string' ||
    !data.hostId.startsWith('urn:uuid:') ||
    !UUID.test(data.hostId.slice(9)) ||
    !Array.isArray(data.registrations) ||
    data.registrations.length > 32
  )
    return null;
  const registrations: SiwcRegistration[] = [];
  const slots = new Set<string>();
  const clients = new Set<string>();
  for (const raw of data.registrations as unknown[]) {
    const item = record(raw, ['registrationId', 'clientId']);
    if (
      !item ||
      typeof item.registrationId !== 'string' ||
      !UUID.test(item.registrationId) ||
      !clientId(item.clientId) ||
      slots.has(item.registrationId) ||
      clients.has(item.clientId)
    )
      return null;
    slots.add(item.registrationId);
    clients.add(item.clientId);
    registrations.push({
      registrationId: item.registrationId,
      clientId: item.clientId,
    });
  }
  return frozen(data.hostId, registrations);
}
function code(error: unknown, expected: string): boolean {
  try {
    return Object.getOwnPropertyDescriptor(error, 'code')?.value === expected;
  } catch {
    return false;
  }
}

/**
 * Unwired main-only identifiers, never identity/session/credential authority.
 * One update owner/process in a trusted private local directory. First install is no-clobber.
 */
export function openSiwcRegistrationStore(
  directory: string,
): SiwcRegistrationStore | null {
  if (
    typeof directory !== 'string' ||
    !path.isAbsolute(directory) ||
    directory.length > 2048 ||
    /[\0\r\n]/.test(directory)
  )
    return null;
  const file = path.join(directory, 'registrations.v1.json');
  function checkDirectory(create: boolean) {
    if (create) fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const stat = fs.lstatSync(directory);
    if (!stat.isDirectory() || stat.isSymbolicLink())
      throw new Error('CATALOG_UNAVAILABLE');
  }
  function readFile(): string {
    checkDirectory(false);
    const stat = fs.lstatSync(file);
    if (
      !stat.isFile() ||
      stat.isSymbolicLink() ||
      stat.size < 1 ||
      stat.size > 16384
    )
      throw new Error('CATALOG_UNAVAILABLE');
    const bytes = Buffer.alloc(16385);
    const descriptor = fs.openSync(file, 'r');
    try {
      const opened = fs.fstatSync(descriptor);
      if (!opened.isFile() || opened.size < 1 || opened.size > 16384)
        throw new Error('CATALOG_UNAVAILABLE');
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
      if (!length || length > 16384) throw new Error('CATALOG_UNAVAILABLE');
      return new TextDecoder('utf-8', { fatal: true }).decode(
        bytes.subarray(0, length),
      );
    } finally {
      bytes.fill(0);
      fs.closeSync(descriptor);
    }
  }
  function install(text: string, initial: boolean) {
    let owned: string | null = null;
    try {
      checkDirectory(true);
      const stage = path.join(directory, `registration-${randomUUID()}.stage`);
      const descriptor = fs.openSync(stage, 'wx', 0o600);
      owned = stage;
      try {
        fs.writeFileSync(descriptor, text, 'utf8');
        fs.fsyncSync(descriptor);
      } finally {
        fs.closeSync(descriptor);
      }
      if (initial)
        fs.linkSync(stage, file); // Atomic create-if-absent; never replace another host.
      else {
        fs.renameSync(stage, file);
        owned = null;
      }
    } finally {
      if (owned) {
        try {
          fs.unlinkSync(owned);
        } catch {
          /* Orphan staging is never restored. */
        }
      }
    }
  }
  let observed: string;
  let catalog: Readonly<SiwcRegistrationCatalog>;
  try {
    try {
      observed = readFile();
    } catch (error) {
      if (!code(error, 'ENOENT')) return null;
      observed = JSON.stringify(frozen(`urn:uuid:${randomUUID()}`, []));
      try {
        install(observed, true);
      } catch (collision) {
        if (!code(collision, 'EEXIST')) return null;
      }
      observed = readFile(); // A concurrent first creator wins; adopt only its valid committed file.
    }
    const value = parse(observed);
    if (!value) return null;
    catalog = value;
  } catch {
    return null;
  }
  let disposed = false;
  let changing = false;
  let blocked = false;
  function unchanged(): boolean {
    try {
      if (readFile() === observed) return true;
    } catch {
      /* Fixed unavailable result below. */
    }
    blocked = true;
    return false;
  }
  return Object.freeze({
    read() {
      return disposed || changing || blocked || !unchanged() ? null : catalog;
    },
    retainRegistration(value: unknown, signal: AbortSignal): boolean {
      if (disposed || changing || blocked || signal.aborted) return false;
      changing = true;
      try {
        const data = record(value, ['hostId', 'clientId']);
        if (
          !data ||
          data.hostId !== catalog.hostId ||
          !clientId(data.clientId) ||
          disposed ||
          signal.aborted ||
          !unchanged() ||
          disposed ||
          signal.aborted
        )
          return false;
        if (
          catalog.registrations.some((item) => item.clientId === data.clientId)
        )
          return true;
        if (catalog.registrations.length >= 32) return false;
        const next = frozen(catalog.hostId, [
          ...catalog.registrations,
          { registrationId: randomUUID(), clientId: data.clientId },
        ]);
        const serialized = JSON.stringify(next);
        install(serialized, false);
        observed = serialized;
        catalog = next;
        // Public metadata may already be committed if cancellation occurs after synchronous entry.
        return !disposed && !signal.aborted;
      } catch {
        return false;
      } finally {
        changing = false;
      }
    },
    dispose() {
      disposed = true;
    },
  });
}
