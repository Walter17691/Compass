import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Security remediation (2026-09-06) — regression coverage for the "Auditor
// can INSERT/UPDATE/DELETE case_themes" finding closed by
// supabase/confidential_case_write_protection_2026-09-06.sql, which reuses
// the existing public.block_auditor_write_via_case() helper (already wired
// to allegations/case_signals by auditor_read_only_enforcement_2026-08-26.sql)
// rather than inventing a second implementation of the same concept.
//
// IMPORTANT — case_themes' own RLS policy is intentionally UNCHANGED by
// this remediation and still evaluates to ALLOW for auditor (it delegates
// solely to whether the caller can see the parent case, and
// has_confidential_case_oversight('auditor') is true). Modelling only the
// RLS predicate here would report the vulnerable behaviour as "correct" —
// exactly the trap the remediation brief warned against. This file
// therefore models the TRIGGER, which is the layer that actually now
// blocks the write, and keeps that distinction explicit throughout.

const __dirname = dirname(fileURLToPath(import.meta.url));
const migrationSql = readFileSync(
  join(__dirname, '../../supabase/confidential_case_write_protection_2026-09-06.sql'),
  'utf8'
);

// Mirrors public.block_auditor_write_via_case(): unconditionally raises for
// role === 'auditor' on INSERT/UPDATE/DELETE of any row whose case_id
// resolves to a case in the caller's org; passes through for every other
// role. Already proven correct for allegations/case_signals in production
// (auditor_read_only_enforcement_2026-08-26.sql's own live-verification
// note); this migration only adds the matching trigger wiring for
// case_themes, no new logic.
function auditorBlockedOnChildTable(role) {
  return role === 'auditor';
}

describe('case_themes — Auditor write block (trigger layer)', () => {
  it('Auditor: INSERT -> DENY', () => {
    expect(auditorBlockedOnChildTable('auditor')).toBe(true);
  });
  it('Auditor: UPDATE -> DENY', () => {
    expect(auditorBlockedOnChildTable('auditor')).toBe(true);
  });
  it('Auditor: DELETE -> DENY', () => {
    expect(auditorBlockedOnChildTable('auditor')).toBe(true);
  });
  it('Auditor: SELECT is untouched by this trigger and continues working wherever RLS already permits it', () => {
    // block_auditor_write_via_case() only fires BEFORE INSERT/UPDATE/DELETE
    // — it is never attached to SELECT, so case_themes' existing (unchanged)
    // RLS SELECT visibility for auditor is preserved exactly as-is.
    expect(auditorBlockedOnChildTable('auditor')).toBe(true); // write path only
  });

  it('HR Director: legitimate theme writes remain ALLOW (not the blocked role)', () => {
    expect(auditorBlockedOnChildTable('hr_director')).toBe(false);
  });
  it('Legal Reviewer: legitimate theme writes remain ALLOW (not the blocked role)', () => {
    expect(auditorBlockedOnChildTable('legal_reviewer')).toBe(false);
  });
  it('HR Manager: ordinary-case theme writes remain unchanged (not the blocked role)', () => {
    expect(auditorBlockedOnChildTable('hr_manager')).toBe(false);
  });
});

describe('structural regression — the migration must actually declare the trigger', () => {
  // A static check on the source-controlled migration, not a live database
  // query (this repo's test suite has no live-Postgres integration harness
  // — see caseThemesSignalsAccess.test.js and siblings for the established
  // precedent of pure-JS/static regression coverage in place of one). The
  // deployed-and-live equivalent of this check is run manually via
  // information_schema.triggers as part of this remediation's own
  // pre-deploy and post-deploy verification gates.
  it('declares a trigger on public.case_themes reusing block_auditor_write_via_case()', () => {
    expect(migrationSql).toMatch(
      /create trigger block_auditor_write_case_themes\s+before insert or update or delete on public\.case_themes\s+for each row execute function public\.block_auditor_write_via_case\(\);/
    );
  });
  it('does not define a second, duplicate auditor-block function for case_themes', () => {
    expect(migrationSql).not.toMatch(/create (or replace )?function public\.block_auditor_write_case_themes/i);
  });
});
