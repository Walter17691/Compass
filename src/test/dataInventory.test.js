import { describe, it, expect } from 'vitest';
import { ORG_SCOPED_TABLES, CASCADE_COVERED_TABLES } from '../lib/dataInventory.js';

// Phase 6.5 hardening (structural remediation, Prompt 12 — GDPR Ownership /
// DSAR / Erasure Completeness invariant), as amended by NEW-44.
//
// THE SNAPSHOT THAT USED TO LIVE HERE IS GONE, and not because it was
// inconvenient. It was a hand-typed list of every org_id-bearing table,
// "taken by directly querying information_schema on 2026-08-25", and it
// predicted its own failure in its own header: "This snapshot can go stale the
// same way the old hand-maintained list did — the durable fix is a live-schema
// CI check, not a hardcoded array."
//
// It went stale in five weeks. The 2026-09-25 sweep found customer_contracts
// and team_invites live and classified nowhere, and the only reason this file
// stayed green is that whoever found them refused to add them to the snapshot:
// doing so would have made the test pass while "Delete all data" still spared
// both tables, converting a real erasure gap into a green tick.
//
// Coverage now lives in src/test/schemaInventoryGate.test.js, which derives the
// table list by replaying every file in supabase/ instead of retyping it, so
// nobody has to remember to update a list in order for a new table to be
// noticed. Keeping a second hand-maintained list here as well would recreate
// the exact problem — one inventory, not two.
//
// What remains below are the three specific regressions this file was written
// to pin, each a real finding with a real history. They are cheap, they name
// their own origin, and losing them with the snapshot would lose the evidence.

describe('dataInventory — GDPR erasure completeness', () => {
  it('includes organisation_themes as actively erased — the gap the independent audit found', () => {
    expect(ORG_SCOPED_TABLES).toContain('organisation_themes');
  });

  it('does not redundantly re-delete case_access — verified cascade-covered by cases (NOT NULL, ON DELETE CASCADE) as of 2026-08-25', () => {
    expect(ORG_SCOPED_TABLES).not.toContain('case_access');
    expect(CASCADE_COVERED_TABLES).toContain('case_access');
  });

  it('includes redundancy_cases as actively erased — closes Prompt 16 audit finding H1 (previously local-only, not in any table at all)', () => {
    expect(ORG_SCOPED_TABLES).toContain('redundancy_cases');
  });
});
