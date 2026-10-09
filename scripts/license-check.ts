import { readFile } from 'node:fs/promises';
import {
  checkInventory,
  type InventoryEntry,
  type PackageRecord,
} from './license-policy.ts';

const lock = JSON.parse(await readFile('package-lock.json', 'utf8')) as {
  packages: Record<string, PackageRecord>;
};
const inventory = JSON.parse(
  await readFile('docs/research/P0-02-lock-inventory.json', 'utf8'),
) as { packages: InventoryEntry[] };
const errors = checkInventory(lock.packages, inventory.packages);
if (errors.length) {
  console.error(errors.join('\n'));
  process.exitCode = 1;
} else {
  console.log(
    `License metadata matches ${inventory.packages.length} inventoried packages; distribution review remains separate.`,
  );
}
