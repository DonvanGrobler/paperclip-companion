import { describe, expect, it } from 'vitest';
import {
  checkInventory,
  type PackageRecord,
} from '../../scripts/license-policy.ts';

const path = 'node_modules/example';
const pkg: PackageRecord = {
  version: '1.0.0',
  license: 'MIT',
  integrity: 'sha512-synthetic-test-digest',
  dev: true,
};
const inventory = [{ path, ...pkg, optional: false }];

describe('dependency inventory gate', () => {
  it('accepts the recorded graph and keeps project license outside dependency scope', () => {
    expect(
      checkInventory({ '': { license: 'UNLICENSED' }, [path]: pkg }, inventory),
    ).toEqual([]);
  });
  it.each([
    { license: 'UNKNOWN' },
    { license: '' },
    { version: '2.0.0' },
    { integrity: 'sha512-changed-artifact' },
    { dev: false },
    { optional: true },
  ])('rejects metadata drift: %j', (change) => {
    expect(
      checkInventory({ [path]: { ...pkg, ...change } }, inventory),
    ).toContain(`INVENTORY_DRIFT ${path}`);
  });
  it('rejects unknown declarations even when added to the inventory', () => {
    const changed = { ...pkg, license: 'UNKNOWN' };
    expect(
      checkInventory({ [path]: changed }, [{ path, ...changed }]),
    ).toContain(`UNREVIEWED_LICENSE ${path}`);
  });
  it('rejects an unpinned package even if the inventory matches', () => {
    const unpinned = { license: 'MIT' };
    expect(
      checkInventory({ [path]: unpinned }, [{ path, ...unpinned }]),
    ).toContain(`MISSING_PIN ${path}`);
  });
  it('rejects an added package', () => {
    expect(
      checkInventory({ [path]: pkg, 'node_modules/new': pkg }, inventory),
    ).toContain('UNRECORDED_PACKAGE node_modules/new');
  });
  it('rejects stale and duplicate inventory entries', () => {
    expect(checkInventory({}, inventory)).toContain(
      `STALE_INVENTORY_PATH ${path}`,
    );
    expect(
      checkInventory({ [path]: pkg }, [...inventory, ...inventory]),
    ).toContain('DUPLICATE_INVENTORY_PATH');
  });
});
