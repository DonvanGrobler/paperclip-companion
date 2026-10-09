export interface PackageRecord {
  version?: string;
  license?: string;
  integrity?: string;
  dev?: boolean;
  optional?: boolean;
}
export interface InventoryEntry extends PackageRecord {
  path: string;
}

// These are the declarations already present in the P0-02 graph, not legal approval.
const knownDeclarations = new Set([
  'MIT',
  'Apache-2.0',
  'BSD-2-Clause',
  'BSD-3-Clause',
  'ISC',
  'MPL-2.0',
  'BlueOak-1.0.0',
]);

export function checkInventory(
  packages: Record<string, PackageRecord>,
  inventory: InventoryEntry[],
): string[] {
  const errors: string[] = [];
  const recorded = new Map(inventory.map((entry) => [entry.path, entry]));
  if (recorded.size !== inventory.length)
    errors.push('DUPLICATE_INVENTORY_PATH');
  for (const [path, pkg] of Object.entries(packages)) {
    if (path === '') continue; // Project license is a separate maintainer decision.
    if (!pkg.license || !knownDeclarations.has(pkg.license)) {
      errors.push(`UNREVIEWED_LICENSE ${path}`);
    }
    if (!pkg.version || !pkg.integrity?.startsWith('sha512-')) {
      errors.push(`MISSING_PIN ${path}`);
    }
    const entry = recorded.get(path);
    if (!entry) {
      errors.push(`UNRECORDED_PACKAGE ${path}`);
      continue;
    }
    if (
      pkg.version !== entry.version ||
      pkg.license !== entry.license ||
      pkg.integrity !== entry.integrity ||
      Boolean(pkg.dev) !== Boolean(entry.dev) ||
      Boolean(pkg.optional) !== Boolean(entry.optional)
    ) {
      errors.push(`INVENTORY_DRIFT ${path}`);
    }
    recorded.delete(path);
  }
  for (const path of recorded.keys())
    errors.push(`STALE_INVENTORY_PATH ${path}`);
  return errors;
}
