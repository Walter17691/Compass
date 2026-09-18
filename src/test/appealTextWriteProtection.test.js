import { describe, it, expect } from 'vitest';

// Appeal UAT remediation (2026-09-18) — regression coverage for
// supabase/appeal_receipt_grounds_2026-09-18.sql's own authorization
// analysis: cases.appeal_text is deliberately NOT added to
// protect_case_hr_only_columns (the HR-only gate guarding outcome/
// outcome_issued_at/outcome_notes/warning_duration_months/
// warning_expires_at) because doing so would put a stricter boundary on
// appeal_text than on cases.stage itself, even though both are written in
// the exact same single UPDATE statement by recordAppealReceived — a
// non-HR case_access holder able to set stage='appeal' could then have
// that same statement's appeal_text write silently rejected, exactly the
// "stage saved, content lost" risk this remediation exists to close.
//
// appeal_text is therefore governed by the SAME boundary as stage: the
// general "Case write access scoped by case_access_level" RESTRICTIVE
// UPDATE policy (three_level_case_access_2026-09-13.sql), combined with
// the pre-existing, unconditional block_auditor_write_cases trigger
// (auditor_read_only_enforcement_2026-08-26.sql), which fires regardless
// of which columns changed or what the case_access_level predicate says.
//
// Same approach as src/test/outcomeMetadataWriteProtection.test.js and
// src/test/confidentialCaseWriteProtection.test.js: a pure-JS mirror of
// the live SQL, unit-tested exhaustively, defined here only — not
// exported, not added to any production file. The database policy/
// trigger remain the single authoritative security boundary.

// Mirrors "Case write access scoped by case_access_level"'s USING/WITH
// CHECK predicate exactly (both clauses are identical on that policy).
// org_id-scoping (tenant isolation) is represented separately below via
// `sameOrg`, since the live predicate is itself already org_id-scoped on
// every branch (`om.org_id = cases.org_id`, case_access has no org_id of
// its own but a case only ever belongs to one org).
function caseAccessLevelWriteAllowed({ sameOrg, caseAccessLevel, isCreator, hasCaseAccess }) {
  if (!sameOrg) return false; // no org_members row for this org -> every EXISTS clause is false
  if (caseAccessLevel === 1) return true;
  if (caseAccessLevel === 2 && isCreator) return true;
  if (hasCaseAccess) return true;
  return false;
}

// block_auditor_write_cases fires independently and unconditionally for
// role === 'auditor' on INSERT/UPDATE/DELETE to public.cases, regardless
// of case_access_level, confidentiality, or any other condition. Modelled
// here (not re-derived) so the composed "effective" result below is
// honest about which mechanism is doing the blocking.
function auditorUnconditionallyBlocked(role) {
  return role === 'auditor';
}

function effectiveAppealTextWriteAllowed(actor) {
  if (auditorUnconditionallyBlocked(actor.role)) return false;
  return caseAccessLevelWriteAllowed(actor);
}

describe('appeal_text write boundary — matches cases.stage exactly, not the HR-only outcome boundary', () => {
  it('Level 1 (org-wide) member: ALLOW, regardless of creator/case_access', () => {
    expect(caseAccessLevelWriteAllowed({ sameOrg: true, caseAccessLevel: 1, isCreator: false, hasCaseAccess: false })).toBe(true);
  });

  it('Level 2 member who created the case: ALLOW', () => {
    expect(caseAccessLevelWriteAllowed({ sameOrg: true, caseAccessLevel: 2, isCreator: true, hasCaseAccess: false })).toBe(true);
  });

  it('Level 2 member who did NOT create the case, and has no case_access row: DENY', () => {
    expect(caseAccessLevelWriteAllowed({ sameOrg: true, caseAccessLevel: 2, isCreator: false, hasCaseAccess: false })).toBe(false);
  });

  it('Level 3 member with an explicit case_access row: ALLOW — this is the same case_access_level boundary that already lets a Level 3 investigator/notetaker trigger "Employee is appealing" and set stage=\'appeal\' today', () => {
    expect(caseAccessLevelWriteAllowed({ sameOrg: true, caseAccessLevel: 3, isCreator: false, hasCaseAccess: true })).toBe(true);
  });

  it('Level 3 member with NO case_access row for this case: DENY', () => {
    expect(caseAccessLevelWriteAllowed({ sameOrg: true, caseAccessLevel: 3, isCreator: false, hasCaseAccess: false })).toBe(false);
  });

  it('this is intentionally the SAME boundary as stage — appeal_text is not more restrictive, matching the migration\'s own design rationale', () => {
    const actor = { sameOrg: true, caseAccessLevel: 2, isCreator: false, hasCaseAccess: true };
    // Whatever lets this actor set stage='appeal' in the shared
    // saveCaseToDB payload must also let them set appeal_text in that
    // same statement — a stricter gate here would silently drop the
    // grounds while the stage transition still landed.
    expect(caseAccessLevelWriteAllowed(actor)).toBe(true);
  });
});

describe('Auditor cannot mutate appeal grounds', () => {
  it('Auditor with Level 1 access: the case_access_level predicate alone would ALLOW...', () => {
    expect(caseAccessLevelWriteAllowed({ sameOrg: true, caseAccessLevel: 1, isCreator: false, hasCaseAccess: false })).toBe(true);
  });

  it('...but the pre-existing, unconditional block_auditor_write_cases trigger denies it regardless — effective result: DENY', () => {
    expect(effectiveAppealTextWriteAllowed({ role: 'auditor', sameOrg: true, caseAccessLevel: 1, isCreator: false, hasCaseAccess: false })).toBe(false);
  });

  it('Auditor with explicit case_access on the case: still DENY — the trigger does not distinguish by case_access', () => {
    expect(effectiveAppealTextWriteAllowed({ role: 'auditor', sameOrg: true, caseAccessLevel: 3, isCreator: false, hasCaseAccess: true })).toBe(false);
  });
});

describe('cross-org denial', () => {
  it('a member of a different org (no org_members row for this case\'s org): DENY, regardless of role or case_access_level values from their own org', () => {
    expect(caseAccessLevelWriteAllowed({ sameOrg: false, caseAccessLevel: 1, isCreator: false, hasCaseAccess: false })).toBe(false);
  });

  it('a removed former member (no org_members row at all): DENY', () => {
    expect(caseAccessLevelWriteAllowed({ sameOrg: false, caseAccessLevel: null, isCreator: false, hasCaseAccess: false })).toBe(false);
  });
});

describe('unauthorized lower-privilege mutation — a Level 2/3 holder unrelated to the case', () => {
  it('Level 2, not the creator, no case_access: DENY', () => {
    expect(caseAccessLevelWriteAllowed({ sameOrg: true, caseAccessLevel: 2, isCreator: false, hasCaseAccess: false })).toBe(false);
  });

  it('Level 3, no case_access at all: DENY', () => {
    expect(caseAccessLevelWriteAllowed({ sameOrg: true, caseAccessLevel: 3, isCreator: false, hasCaseAccess: false })).toBe(false);
  });
});

describe('this remains a distinct, less restrictive boundary than outcome/warning metadata (by design — see migration header)', () => {
  it('a Level 2 case_access holder who is neither HR nor the disciplinary_officer can write appeal_text (unlike outcome, which requires HR or disciplinary_officer specifically)', () => {
    // Documents the intentional asymmetry: outcomeMetadataWriteProtection
    // .test.js's equivalent actor (hr role absent, isDisciplinaryOfficer
    // false) is DENIED for outcome columns. appeal_text uses the broader,
    // pre-existing stage boundary instead, on purpose.
    expect(caseAccessLevelWriteAllowed({ sameOrg: true, caseAccessLevel: 3, isCreator: false, hasCaseAccess: true })).toBe(true);
  });
});
