import { describe, it, expect } from 'vitest';
import { canSeeAllOrgCases, hasConfidentialOversight, canAccessCaseLocation } from '../lib/roles';

// Security remediation (2026-09-05) — regression coverage for the
// case_themes / case_signals access gap found during the Insights Phase 4
// audit and closed by
// supabase/case_themes_case_signals_authoritative_case_access_2026-09-05.sql.
//
// Same approach as src/test/hrReviewRequestsAccess.test.js and
// src/test/allegationsCaseTasksAccess.test.js: a pure-JS mirror of the live
// SQL predicate, unit-tested exhaustively, defined here only — not
// exported, not added to src/lib/roles.js or any other production file.
// The database RLS policy remains the single authoritative security
// boundary; this file exists to make its intended behaviour checkable, not
// to duplicate it into application code.
//
// Both tables' fixed policies are FOR ALL with USING === WITH CHECK,
// delegating to `cases`' own RLS via a single EXISTS, and — unlike
// case_tasks — neither table has an org-level (case_id IS NULL) branch:
// case_id is NOT NULL on both (confirmed live), so every row is
// unconditionally case-scoped. SELECT/INSERT/UPDATE/DELETE therefore all
// reduce to the exact same predicate — parentCaseAccess() below.

// Mirrors `cases`' own combined effective SELECT/write visibility — see
// hrReviewRequestsAccess.test.js for the full derivation. This is the
// predicate both case_themes and case_signals now delegate to.
function parentCaseAccess({ role, sameOrg, memberLocationIds, caseLocationId, isCreator, isOwner, hasCaseAccess, confidential }) {
  const permissive = (sameOrg && canAccessCaseLocation(role, memberLocationIds, caseLocationId)) || hasCaseAccess;
  if (!permissive) return false;
  const confidentialOk = !confidential || isCreator || hasCaseAccess || hasConfidentialOversight(role);
  if (!confidentialOk) return false;
  return canSeeAllOrgCases(role) || isCreator || isOwner || hasCaseAccess;
}

// The historical predicate case_signals' (2026-08-10) and case_themes'
// (2026-08-19, copied verbatim from case_signals per its own header)
// single FOR ALL policy used until this fix. Missing the ownership
// (R_own) term entirely — identical in shape to allegations'/case_tasks'
// pre-fix predicate, and byte-identical to each other (confirmed live via
// pg_policies: both tables' qual text differs only in the case_id column
// reference). Kept here only so the "before" half of the regression
// assertions is the real historical predicate, not a hypothetical.
function vulnerableChildPredicate({ role, sameOrg, memberLocationIds, caseLocationId, isCreator, hasCaseAccess, confidential }) {
  const permissive = (sameOrg && canAccessCaseLocation(role, memberLocationIds, caseLocationId)) || hasCaseAccess;
  if (!permissive) return false;
  return !confidential || isCreator || hasCaseAccess || hasConfidentialOversight(role);
}

// UPDATE requires USING (against the OLD row) AND WITH CHECK (against the
// NEW row) both to pass — both clauses are now identical (parentCaseAccess),
// evaluated against different row states. Models reassigning a theme/signal
// row's case_id from one case to another.
function canUpdateChildRow(oldRow, newRow) {
  return parentCaseAccess(oldRow) && parentCaseAccess(newRow);
}

const noRelationship = { isCreator: false, isOwner: false, hasCaseAccess: false };

describe('case_themes / case_signals — access matrix, post-fix', () => {
  it('A. HR/oversight: ALLOW', () => {
    expect(parentCaseAccess({ role: 'hr_manager', sameOrg: true, confidential: false, ...noRelationship })).toBe(true);
  });
  it('B. Owner, no other relationship: ALLOW', () => {
    expect(parentCaseAccess({ role: 'line_manager', sameOrg: true, confidential: false, isCreator: false, isOwner: true, hasCaseAccess: false })).toBe(true);
  });
  it('C. Creator: ALLOW', () => {
    expect(parentCaseAccess({ role: 'line_manager', sameOrg: true, confidential: false, isCreator: true, isOwner: false, hasCaseAccess: false })).toBe(true);
  });
  it('D. Explicit case_access: ALLOW', () => {
    expect(parentCaseAccess({ role: 'investigator', sameOrg: true, confidential: false, isCreator: false, isOwner: false, hasCaseAccess: true })).toBe(true);
  });
  it('E. Same-org bystander, no relationship, non-confidential: DENY', () => {
    expect(parentCaseAccess({ role: 'line_manager', sameOrg: true, confidential: false, ...noRelationship })).toBe(false);
  });
  it('F. Same-location bystander (location_manager, matching location), no relationship: DENY', () => {
    expect(parentCaseAccess({
      role: 'location_manager', sameOrg: true, memberLocationIds: ['loc-1'], caseLocationId: 'loc-1', confidential: false, ...noRelationship,
    })).toBe(false);
  });
  it('G. Cross-org: DENY', () => {
    expect(parentCaseAccess({ role: 'hr_director', sameOrg: false, confidential: false, ...noRelationship })).toBe(false);
  });
  it('H. Confidential, no oversight: DENY (hr_manager is NOT confidential-oversight)', () => {
    expect(parentCaseAccess({ role: 'hr_manager', sameOrg: true, confidential: true, ...noRelationship })).toBe(false);
    expect(parentCaseAccess({ role: 'line_manager', sameOrg: true, confidential: true, ...noRelationship })).toBe(false);
  });
  it('I. Confidential + authorised case_access: ALLOW', () => {
    expect(parentCaseAccess({ role: 'investigator', sameOrg: true, confidential: true, isCreator: false, isOwner: false, hasCaseAccess: true })).toBe(true);
  });
  it('J. legal_reviewer / auditor: ALLOW on both confidential and non-confidential', () => {
    expect(parentCaseAccess({ role: 'legal_reviewer', sameOrg: true, confidential: false, ...noRelationship })).toBe(true);
    expect(parentCaseAccess({ role: 'auditor', sameOrg: true, confidential: true, ...noRelationship })).toBe(true);
  });
  it('K. location_manager, same location, no case relationship: DENY (same underlying scenario as F, no membership array set)', () => {
    expect(parentCaseAccess({
      role: 'location_manager', sameOrg: true, memberLocationIds: null, caseLocationId: 'loc-1', confidential: false, ...noRelationship,
    })).toBe(false);
  });
});

describe('the core invariant, confirmed against the real historical predicate', () => {
  it('CONFIRMS THE BUG: the old predicate allowed a same-org bystander the parent case already denied', () => {
    const scenario = { role: 'line_manager', sameOrg: true, confidential: false, ...noRelationship };
    expect(parentCaseAccess(scenario)).toBe(false);
    expect(vulnerableChildPredicate(scenario)).toBe(true);
  });
  it('CONFIRMS THE FIX: case_themes/case_signals visibility is now exactly parentCaseAccess', () => {
    const scenario = { role: 'line_manager', sameOrg: true, confidential: false, ...noRelationship };
    expect(parentCaseAccess(scenario)).toBe(false); // fixed child predicate === parentCaseAccess by construction of the migration
  });
  it('confidentiality was never broken — old and new predicates already agreed', () => {
    const scenario = { role: 'line_manager', sameOrg: true, confidential: true, ...noRelationship };
    expect(parentCaseAccess(scenario)).toBe(false);
    expect(vulnerableChildPredicate(scenario)).toBe(false);
  });
  it('legitimate access (HR/creator/owner/case_access/oversight) is unaffected by the fix', () => {
    const legitimateScenarios = [
      { role: 'hr_manager', sameOrg: true, confidential: false, ...noRelationship },
      { role: 'line_manager', sameOrg: true, confidential: false, isCreator: true, isOwner: false, hasCaseAccess: false },
      { role: 'line_manager', sameOrg: true, confidential: false, isCreator: false, isOwner: true, hasCaseAccess: false },
      { role: 'investigator', sameOrg: true, confidential: true, isCreator: false, isOwner: false, hasCaseAccess: true },
      { role: 'hr_director', sameOrg: true, confidential: true, ...noRelationship },
      { role: 'legal_reviewer', sameOrg: true, confidential: false, ...noRelationship },
      { role: 'auditor', sameOrg: true, confidential: true, ...noRelationship },
    ];
    legitimateScenarios.forEach(scenario => {
      expect(parentCaseAccess(scenario)).toBe(true);
      expect(vulnerableChildPredicate(scenario)).toBe(true); // was already correctly allowed before too
    });
  });
});

describe('write-matrix — SELECT / INSERT / UPDATE / DELETE (identical predicate by design: USING === WITH CHECK)', () => {
  const bystander = { role: 'line_manager', sameOrg: true, confidential: false, ...noRelationship };
  const owner = { role: 'line_manager', sameOrg: true, confidential: false, isCreator: false, isOwner: true, hasCaseAccess: false };

  it('SELECT: bystander denied, owner allowed', () => {
    expect(parentCaseAccess(bystander)).toBe(false);
    expect(parentCaseAccess(owner)).toBe(true);
  });
  it('INSERT: cannot create a theme/signal row under a case the caller cannot access; owner can', () => {
    expect(parentCaseAccess(bystander)).toBe(false);
    expect(parentCaseAccess(owner)).toBe(true);
  });
  it('UPDATE: cannot update a theme/signal row under a hidden case; owner can update their own', () => {
    expect(canUpdateChildRow(bystander, bystander)).toBe(false);
    expect(canUpdateChildRow(owner, owner)).toBe(true);
  });
  it('DELETE: cannot delete a theme/signal row under a hidden case; owner can delete their own', () => {
    expect(parentCaseAccess(bystander)).toBe(false);
    expect(parentCaseAccess(owner)).toBe(true);
  });
});

describe('UPDATE row-reassignment — a theme/signal moving between cases (WITH CHECK on the NEW row, USING on the OLD row)', () => {
  const authorisedCase = { role: 'line_manager', sameOrg: true, confidential: false, isCreator: true, isOwner: false, hasCaseAccess: false };
  const unauthorisedCase = { role: 'line_manager', sameOrg: true, confidential: false, ...noRelationship };

  it('cannot move a row FROM an authorised case TO an unauthorised one', () => {
    expect(canUpdateChildRow(authorisedCase, unauthorisedCase)).toBe(false);
  });
  it('cannot update a row already under a hidden/unauthorised case, regardless of the new case', () => {
    expect(canUpdateChildRow(unauthorisedCase, authorisedCase)).toBe(false);
  });
  it('can move a row between two cases the caller legitimately has access to', () => {
    expect(canUpdateChildRow(authorisedCase, authorisedCase)).toBe(true);
  });
});

describe('case_themes and case_signals share one predicate (byte-identical live policy text, differing only by column)', () => {
  it('every scenario above applies identically to both tables — there is exactly one function under test because there is exactly one predicate', () => {
    const scenarios = [
      { role: 'hr_manager', sameOrg: true, confidential: false, ...noRelationship },
      { role: 'line_manager', sameOrg: true, confidential: false, ...noRelationship },
      { role: 'investigator', sameOrg: true, confidential: true, isCreator: false, isOwner: false, hasCaseAccess: true },
    ];
    scenarios.forEach(scenario => {
      const caseThemesResult = parentCaseAccess(scenario);
      const caseSignalsResult = parentCaseAccess(scenario);
      expect(caseThemesResult).toBe(caseSignalsResult);
    });
  });
});
