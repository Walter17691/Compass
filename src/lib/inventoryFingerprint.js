// NEW-44 governance closure — fail-closed verification for "Delete all data".
//
// THE PROBLEM. api/delete-org-data.js iterates ORG_SCOPED_TABLES and asserts
// nothing. The CI gate stops an unclassified table from LANDING, but a build
// shipped from a working tree where somebody edited the inventory without
// running the gate would erase whatever that edited list happened to say and
// return success. "Successful erasure" must not be reportable from a build
// whose inventory completeness was never verified.
//
// ┌─ WHAT THIS ARTEFACT HONESTLY PROVES, AND WHAT IT DOES NOT ──────────────┐
// │ PROVES: the governance inputs the running code is about to act on are    │
// │   byte-for-byte the inputs that the coverage gate passed against. The    │
// │   fingerprint is computed FROM the inventory at runtime and compared to  │
// │   a committed value that src/test/governanceClosure.test.js refuses to   │
// │   accept unless the coverage, ordering, DSAR, posture and tenancy gates  │
// │   all pass in the same run. Edit the inventory and skip CI, and the two  │
// │   diverge, and deletion refuses.                                         │
// │                                                                          │
// │ DOES NOT PROVE: that nobody deliberately edited both the inventory and   │
// │   the committed fingerprint together. This is an integrity attestation   │
// │   against ACCIDENT and omission — the actual NEW-44 failure mode, which  │
// │   twice was somebody appending a table and not thinking about the list — │
// │   not a signature against a motivated insider. Nothing in a repository   │
// │   the deployer controls could achieve the latter, and claiming otherwise │
// │   would be exactly the manufactured assurance this task forbids.         │
// │                                                                          │
// │ It also runs NO schema query on the destructive request path. The        │
// │ fingerprint is pure computation over imported constants.                 │
// └─────────────────────────────────────────────────────────────────────────┘

import {
  ORG_SCOPED_TABLES, CASCADE_COVERED_TABLES, INTENTIONALLY_EXCLUDED_TABLES,
  SEPARATELY_HANDLED_TABLES, PLATFORM_SCOPED_TABLES, INFRASTRUCTURE_TABLES,
  PARENT_EXCLUDED_TABLES, UNUSED_LEGACY_TABLES,
} from './dataInventory.js';
import { TABLE_CLASSIFICATION, SERVICE_ROLE_ONLY_TABLES } from './dataClassification.js';

// The canonical string the fingerprint is taken over. ORG_SCOPED_TABLES is
// serialised IN ORDER — the deletion sequence is part of what was verified,
// because NEW-44's second pass found a correctly-classified table in the wrong
// position. Every other list is sorted, since only membership matters there.
export function inventoryCanonicalForm() {
  const ordered = ORG_SCOPED_TABLES.join(',');
  const sets = [
    ['cascade', CASCADE_COVERED_TABLES], ['excluded', INTENTIONALLY_EXCLUDED_TABLES],
    ['separate', SEPARATELY_HANDLED_TABLES], ['platform', PLATFORM_SCOPED_TABLES],
    ['infra', INFRASTRUCTURE_TABLES], ['parent', PARENT_EXCLUDED_TABLES],
    ['legacy', UNUSED_LEGACY_TABLES],
  ].map(([k, v]) => `${k}:${[...v].sort().join(',')}`).join(';');
  // Classification fields that change what erasure/disclosure MEANS. Purpose
  // prose is excluded deliberately: rewording a comment must not invalidate a
  // deployment, but changing a data class or a DSAR disposition must.
  const classified = Object.keys(TABLE_CLASSIFICATION).sort().map(name => {
    const m = TABLE_CLASSIFICATION[name];
    return `${name}|${m.dataClass}|${m.dsar}|${m.retention}|${m.orgScoped ? 1 : 0}`
      + `${m.personRelated ? 1 : 0}${m.caseRelated ? 1 : 0}|${m.exclusionReason ? 'x' : '-'}`;
  }).join(';');
  const posture = Object.keys(SERVICE_ROLE_ONLY_TABLES).sort().join(',');
  return `v1\nORDER=${ordered}\nSETS=${sets}\nCLASS=${classified}\nPOSTURE=${posture}`;
}

// FNV-1a, 64-bit, in BigInt. A non-cryptographic digest is the right tool: this
// detects divergence, and the threat model above is explicit that it is not
// resisting forgery. Implemented inline so the destructive path pulls in no
// crypto dependency and behaves identically in Node and the browser.
export function fingerprint(text) {
  let hash = 0xcbf29ce484222325n;
  const prime = 0x100000001b3n;
  const mask = 0xffffffffffffffffn;
  for (let i = 0; i < text.length; i += 1) {
    hash = ((hash ^ BigInt(text.charCodeAt(i) & 0xff)) * prime) & mask;
  }
  return hash.toString(16).padStart(16, '0');
}

export function computeInventoryFingerprint() {
  return fingerprint(inventoryCanonicalForm());
}

// ── The committed attestation ──────────────────────────────────────────────
//
// Regenerate with:  node scripts/inventory-fingerprint.mjs --write
//
// Doing so is only legitimate when the governance suite passes, and
// governanceClosure.test.js asserts this value equals the computed one in the
// same run that proves coverage, ordering, DSAR correspondence, posture and
// tenancy. So a stale or hand-edited value fails CI rather than shipping.
export const VERIFIED_INVENTORY_FINGERPRINT = 'b7e0b52d7deef17c';

export const INVENTORY_UNVERIFIED_MESSAGE =
  'Delete all data is refusing to run: this build\'s data inventory does not match the inventory that '
  + 'passed the NEW-44 governance gate. Erasure completeness cannot be claimed from an unverified '
  + 'inventory. Run the test suite, then `node scripts/inventory-fingerprint.mjs --write` and redeploy.';

// The predicate the handler calls. Fails CLOSED: any mismatch, and any error
// computing the fingerprint at all, means "not verified".
export function inventoryVerified() {
  try {
    return computeInventoryFingerprint() === VERIFIED_INVENTORY_FINGERPRINT;
  } catch {
    return false;
  }
}
