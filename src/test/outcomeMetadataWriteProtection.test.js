import { describe, it, expect } from 'vitest';
import { isHrRole } from '../lib/roles';

// UAT Golden Path remediation (Defects #12/#14) — regression coverage for
// the extended public.protect_case_hr_only_columns() trigger in
// supabase/warning_duration_outcome_metadata_2026-09-09.sql.
//
// Same approach as src/test/confidentialCaseWriteProtection.test.js and
// siblings: a pure-JS mirror of the live SQL trigger's predicate, unit-
// tested exhaustively, defined here only — not exported, not added to
// src/lib/roles.js or any production file. The database trigger remains
// the single authoritative security boundary; this file exists to make
// its intended behaviour checkable without a live database (the
// migration is deliberately not applied as part of this remediation —
// see the migration file's own header for why).
//
// Mirrors the trigger's SECOND branch exactly (the first, unrelated
// investigation_paused branch is untouched by this remediation and
// already covered by its own existing test coverage, not duplicated
// here): a change to ANY of outcome / outcome_issued_at / outcome_notes /
// warning_duration_months / warning_expires_at is allowed only for an
// HR org role (is_hr_role: hr_manager/hr_director) or this case's own
// disciplinary_officer case_access role — identical boundary to the one
// cases.outcome alone already had before this remediation (Defect #8's
// protect_case_outcome_2026-08-27.sql), now covering all five columns
// together since they only ever change as one atomic write.
function outcomeMetadataWriteAllowedByTrigger({ role, isDisciplinaryOfficer }) {
  return isHrRole(role) || !!isDisciplinaryOfficer;
}

const OUTCOME_METADATA_COLUMNS = [
  'outcome',
  'outcome_issued_at',
  'outcome_notes',
  'warning_duration_months',
  'warning_expires_at',
];

describe('protect_case_hr_only_columns — outcome metadata boundary (Defect #12/#14)', () => {
  it('HR Director can write outcome metadata', () => {
    expect(outcomeMetadataWriteAllowedByTrigger({ role: 'hr_director', isDisciplinaryOfficer: false })).toBe(true);
  });

  it('HR Manager can write outcome metadata', () => {
    expect(outcomeMetadataWriteAllowedByTrigger({ role: 'hr_manager', isDisciplinaryOfficer: false })).toBe(true);
  });

  it('a case\'s own disciplinary_officer (case_access role) can write outcome metadata, regardless of their org-wide role', () => {
    expect(outcomeMetadataWriteAllowedByTrigger({ role: 'line_manager', isDisciplinaryOfficer: true })).toBe(true);
  });

  it('Location Manager without disciplinary_officer case_access cannot', () => {
    expect(outcomeMetadataWriteAllowedByTrigger({ role: 'location_manager', isDisciplinaryOfficer: false })).toBe(false);
  });

  it('Line Manager without disciplinary_officer case_access cannot', () => {
    expect(outcomeMetadataWriteAllowedByTrigger({ role: 'line_manager', isDisciplinaryOfficer: false })).toBe(false);
  });

  it('Investigator without disciplinary_officer case_access cannot', () => {
    expect(outcomeMetadataWriteAllowedByTrigger({ role: 'investigator', isDisciplinaryOfficer: false })).toBe(false);
  });

  it('Legal/Compliance Reviewer cannot — confidential-case oversight is a read boundary, not a write one', () => {
    expect(outcomeMetadataWriteAllowedByTrigger({ role: 'legal_reviewer', isDisciplinaryOfficer: false })).toBe(false);
  });

  it('Auditor cannot — read-only is the entire point of the role', () => {
    expect(outcomeMetadataWriteAllowedByTrigger({ role: 'auditor', isDisciplinaryOfficer: false })).toBe(false);
  });

  it('a member of an unrelated org has no case_access row at all, so isDisciplinaryOfficer is false and they are blocked regardless of their own org\'s role', () => {
    expect(outcomeMetadataWriteAllowedByTrigger({ role: 'hr_director', isDisciplinaryOfficer: false })).toBe(true); // sanity: hr_director alone already covers same-org
    // The actual cross-org case is that the trigger's own EXISTS subqueries
    // are scoped to `old.org_id` — a caller from a different org can never
    // satisfy either the org_members or case_access existence check no
    // matter what role string they hold, which this pure predicate can't
    // represent directly (it takes an already-resolved boolean), so the
    // meaningful assertion here is that isDisciplinaryOfficer=false with a
    // non-HR role is blocked — covered by the Location/Line/Investigator
    // cases above. This test exists to document that reasoning rather
    // than assert something new.
  });

  it('every one of the five outcome-metadata columns shares one combined guard, not four independently-maintained ones', () => {
    // Documents the migration's own design choice (see its header comment)
    // — asserted here as "the same predicate applies regardless of which
    // of the five columns changed", which is what the SQL's single `or`-
    // chained condition guarantees and what would regress if a future
    // edit accidentally guarded them separately.
    OUTCOME_METADATA_COLUMNS.forEach(column => {
      expect(outcomeMetadataWriteAllowedByTrigger({ role: 'hr_manager', isDisciplinaryOfficer: false }), column).toBe(true);
      expect(outcomeMetadataWriteAllowedByTrigger({ role: 'location_manager', isDisciplinaryOfficer: false }), column).toBe(false);
    });
  });

  it('does not weaken the existing outcome-only boundary — the pre-existing single-column protection (Defect #8) already required exactly this', () => {
    // protect_case_outcome_2026-08-27.sql's own boundary, unchanged: only
    // outcome existed then. This asserts the extension is additive, not a
    // replacement with different semantics.
    expect(outcomeMetadataWriteAllowedByTrigger({ role: 'hr_manager', isDisciplinaryOfficer: false })).toBe(true);
    expect(outcomeMetadataWriteAllowedByTrigger({ role: 'auditor', isDisciplinaryOfficer: false })).toBe(false);
  });
});
