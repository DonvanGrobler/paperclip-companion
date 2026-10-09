import { afterEach, expect, it, vi } from 'vitest';
import {
  mkdtempSync,
  readFileSync,
  writeFileSync,
  rmSync,
  mkdirSync,
} from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createPreferenceStore } from '../../src/main/preferences';
const directories: string[] = [];
function file() {
  const dir = mkdtempSync(path.join(os.tmpdir(), 'paperclip-prefs-'));
  directories.push(dir);
  return path.join(dir, 'shell-preferences.json');
}
afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const dir of directories.splice(0))
    rmSync(dir, { recursive: true, force: true });
});
it('defaults safely, debounces changes and restores only allowlisted data', () => {
  vi.useFakeTimers();
  const name = file();
  const store = createPreferenceStore(name);
  expect(store.get()).toEqual({
    version: 1,
    position: null,
    visible: true,
    alwaysOnTop: true,
  });
  store.update({
    position: { x: -800, y: 120 },
    visible: false,
    alwaysOnTop: false,
  });
  store.update({ position: { x: -700, y: 130 } });
  expect(() => readFileSync(name)).toThrow();
  vi.advanceTimersByTime(250);
  expect(JSON.parse(readFileSync(name, 'utf8'))).toEqual(store.get());
  expect(createPreferenceStore(name).get()).toEqual(store.get());
  const copy = store.get();
  copy.position!.x = 99;
  expect(store.get().position!.x).toBe(-700);
  store.flush();
});
it('flushes a pending change before the debounce and does not write unchanged values', () => {
  vi.useFakeTimers();
  const name = file();
  const store = createPreferenceStore(name);
  store.update({ visible: true });
  vi.advanceTimersByTime(250);
  expect(() => readFileSync(name)).toThrow();
  store.update({ visible: false });
  store.flush();
  expect(createPreferenceStore(name).get().visible).toBe(false);
});
it.each([
  'not json',
  'null',
  '[]',
  '{}',
  JSON.stringify({
    version: 1,
    position: { x: Infinity, y: 0 },
    visible: true,
    alwaysOnTop: true,
  }),
  'x'.repeat(4097),
])('rejects invalid or oversized settings', (content) => {
  const name = file();
  writeFileSync(name, content);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  expect(createPreferenceStore(name).get().position).toBeNull();
  expect(log).toHaveBeenCalledWith('PREFERENCES_READ_FAILED');
});
it('preserves unknown versions without overwriting them', () => {
  const name = file();
  const future = '{"version":2,"privateFutureField":"untouched"}';
  writeFileSync(name, future);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  const store = createPreferenceStore(name);
  store.update({ visible: false });
  store.flush();
  expect(readFileSync(name, 'utf8')).toBe(future);
  expect(log).toHaveBeenCalledWith('PREFERENCES_VERSION_UNSUPPORTED');
});
it('drops unknown fields, rejects invalid updates and emits fixed write failures', () => {
  const name = file();
  writeFileSync(
    name,
    JSON.stringify({
      version: 1,
      position: null,
      visible: true,
      alwaysOnTop: true,
      prompt: 'must not persist',
    }),
  );
  const store = createPreferenceStore(name);
  store.update({ position: { x: NaN, y: 0 } });
  expect(store.get().position).toBeNull();
  store.update({ visible: false });
  store.flush();
  expect(readFileSync(name, 'utf8')).not.toContain('prompt');
  rmSync(name);
  mkdirSync(name);
  const log = vi.spyOn(console, 'error').mockImplementation(() => {});
  store.update({ visible: true });
  store.flush();
  expect(log).toHaveBeenCalledWith('PREFERENCES_WRITE_FAILED');
});
