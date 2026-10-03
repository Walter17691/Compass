#!/usr/bin/env node
// NEW-44 governance closure — compute or refresh the inventory attestation.
//
//   node scripts/inventory-fingerprint.mjs           print current vs committed
//   node scripts/inventory-fingerprint.mjs --check    exit 1 if they diverge
//   node scripts/inventory-fingerprint.mjs --write    rewrite the committed value
//
// ONLY run --write when the governance suite passes. The committed value is an
// attestation that the coverage, ordering, DSAR-correspondence, security-posture
// and tenancy gates all passed against this exact inventory; refreshing it
// without that is forging the attestation, and src/test/governanceClosure.test.js
// will fail anyway because it re-derives every one of those gates in the same run.

import { readFileSync, writeFileSync } from 'fs';
import {
  computeInventoryFingerprint, VERIFIED_INVENTORY_FINGERPRINT, inventoryCanonicalForm,
} from '../src/lib/inventoryFingerprint.js';

const TARGET = 'src/lib/inventoryFingerprint.js';
const args = process.argv.slice(2);
const computed = computeInventoryFingerprint();

if (args.includes('--write')) {
  const src = readFileSync(TARGET, 'utf8');
  const next = src.replace(
    /export const VERIFIED_INVENTORY_FINGERPRINT = '[0-9a-f]*';/,
    `export const VERIFIED_INVENTORY_FINGERPRINT = '${computed}';`,
  );
  if (next === src && !src.includes(`'${computed}'`)) {
    console.error('Could not rewrite the committed fingerprint — the declaration was not found.');
    process.exit(2);
  }
  writeFileSync(TARGET, next);
  console.log(`Committed fingerprint set to ${computed}`);
  console.log('Re-run the test suite: the governance gate must pass with this value in place.');
  process.exit(0);
}

console.log(`computed:  ${computed}`);
console.log(`committed: ${VERIFIED_INVENTORY_FINGERPRINT}`);

if (computed === VERIFIED_INVENTORY_FINGERPRINT) {
  console.log('MATCH — the inventory is the one the governance gate verified.');
  process.exit(0);
}

console.error('\nMISMATCH — the inventory has changed since it was last verified.');
console.error('"Delete all data" will REFUSE to run from a build in this state, by design.');
if (args.includes('--verbose')) console.error(`\n--- canonical form ---\n${inventoryCanonicalForm()}`);
process.exit(args.includes('--check') ? 1 : 0);
