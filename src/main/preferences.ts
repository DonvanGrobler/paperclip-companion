import {
  openSync,
  readSync,
  closeSync,
  mkdirSync,
  writeFileSync,
  renameSync,
  rmSync,
} from 'node:fs';
import path from 'node:path';

export interface ShellPreferences {
  version: 1;
  position: { x: number; y: number } | null;
  visible: boolean;
  alwaysOnTop: boolean;
}
export const defaultPreferences = (): ShellPreferences => ({
  version: 1,
  position: null,
  visible: true,
  alwaysOnTop: true,
});
function validate(value: unknown): ShellPreferences | null {
  if (!value || typeof value !== 'object') return null;
  const v = value as Record<string, unknown>;
  const p = v.position as Record<string, unknown> | null;
  const coordinate = (n: unknown) =>
    typeof n === 'number' && Number.isInteger(n) && Math.abs(n) <= 1_000_000;
  if (
    v.version !== 1 ||
    typeof v.visible !== 'boolean' ||
    typeof v.alwaysOnTop !== 'boolean' ||
    (p !== null &&
      (!p || typeof p !== 'object' || !coordinate(p.x) || !coordinate(p.y)))
  )
    return null;
  return {
    version: 1,
    position: p === null ? null : { x: p.x as number, y: p.y as number },
    visible: v.visible,
    alwaysOnTop: v.alwaysOnTop,
  };
}

/** Main-owned, bounded local shell settings only. No renderer values or chat content. */
export function createPreferenceStore(file: string) {
  let current = defaultPreferences();
  let writable = true;
  try {
    const fd = openSync(file, 'r');
    let raw: unknown;
    try {
      const bytes = Buffer.alloc(4097);
      const count = readSync(fd, bytes, 0, bytes.length, 0);
      if (count > 4096) throw new Error('SIZE');
      raw = JSON.parse(bytes.subarray(0, count).toString('utf8')) as unknown;
    } finally {
      closeSync(fd);
    }
    if (
      raw &&
      typeof raw === 'object' &&
      'version' in raw &&
      raw.version !== 1
    ) {
      writable = false;
      console.error('PREFERENCES_VERSION_UNSUPPORTED');
    } else {
      const valid = validate(raw);
      if (!valid) throw new Error('SCHEMA');
      current = valid;
    }
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code !== 'ENOENT')
      console.error('PREFERENCES_READ_FAILED');
  }
  let timer: ReturnType<typeof setTimeout> | undefined;
  let dirty = false;
  const flush = () => {
    clearTimeout(timer);
    timer = undefined;
    if (!dirty || !writable) return;
    const temporary = `${file}.${process.pid}.tmp`;
    try {
      mkdirSync(path.dirname(file), { recursive: true });
      writeFileSync(temporary, JSON.stringify(current), {
        encoding: 'utf8',
        mode: 0o600,
      });
      renameSync(temporary, file);
      dirty = false;
    } catch {
      console.error('PREFERENCES_WRITE_FAILED');
      try {
        rmSync(temporary, { force: true });
      } catch {
        /* Fixed diagnostic above; no paths or payloads. */
      }
    }
  };
  return {
    get: (): ShellPreferences => structuredClone(current),
    update(patch: Partial<Omit<ShellPreferences, 'version'>>) {
      const next = validate({ ...current, ...patch });
      if (!next || JSON.stringify(next) === JSON.stringify(current)) return;
      current = next;
      dirty = true;
      clearTimeout(timer);
      timer = setTimeout(flush, 250);
    },
    flush,
  };
}
export type PreferenceStore = ReturnType<typeof createPreferenceStore>;
