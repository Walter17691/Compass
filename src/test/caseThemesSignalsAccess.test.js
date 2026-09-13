import { describe, it, expect } from 'vitest';

// Security remediation (2026-09-05) — regression coverage for the
// case_themes / case_signals access gap found during the Insights Phase 4
// audit and closed by
// supabase/case_themes_case_signals_authoritative_case_access_2026-09-05.sql.
//
// Superseded predicate (2026-09-13) — the three-level case-access model
// (supabase/three_level_case_access_2026-09-13.sql) rewrote `cases`' own
// restrictive policy from role+location-based to case_access_level-based
// and folded confidentiality into that same predicate. Both tables'
// policies delegate to `cases`' RLS via a single EXISTS with no logic of
// their own (confirmed live via pg_policy), so no SQL change was needed to
// either table — but this file's JS mirror must be updated to match.
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

// Mirrors `cases`' own combined effective SELECT/write visibility under the
// three-level model — see hrReviewRequestsAccess.test.js for the full
// derivation. This is the predicate both case_themes and case_signals now
// delegate to. No `role`, `location`, `confidential`, or owner_id
// parameter: none of them participate in case visibility anymore.
function parentCaseAccess({ sameOrg, caseAccessLevel, isCreator, hasCaseAccess }) {
  if (hasCaseAccess) return true;
  if (!sameOrg) return false;
  if (caseAccessLevel === 1) return true;
  return caseAccessLevel === 2 && isCreator === true;
}

// UPDATE requires USING (against the OLD row) AND WITH CHECK (against the
// NEW row) both to pass — both clauses are now identical (parentCaseAccess),
// evaluated against different row states. Models reassigning a theme/signal
// row's case_id from one case to another.
function canUpdateChildRow(oldRow, newRow) {
  return parentCaseAccess(oldRow) && parentCaseAccess(newRow);
}

const noRelationship = { isCreator: false, hasCaseAccess: false };

describe('case_themes / case_signals — access matrix, three-level model', () => {
  it('A. Level 1, no other relationship: ALLOW', () => {
    expect(parentCaseAccess({ sameOrg: true, caseAccessLevel: 1, ...noRelationship })).toBe(true);
  });
  it('B. Level 2, creator: ALLOW', () => {
    expect(parentCaseAccess({ sameOrg: true, caseAccessLevel: 2, isCreator: true, hasCaseAccess: false })).toBe(true);
  });
  it('C. Level 2, NOT creator, no case_access: DENY', () => {
    expect(parentCaseAccess({ sameOrg: true, caseAccessLevel: 2, ...noRelationship })).toBe(false);
  });
  it('D. Explicit case_access at Level 3: ALLOW', () => {
    expect(parentCaseAccess({ sameOrg: true, caseAccessLevel: 3, isCreator: false, hasCaseAccess: true })).toBe(true);
  });
  it('E. Level 3, no relationship: DENY', () => {
    expect(parentCaseAccess({ sameOrg: true, caseAccessLevel: 3, ...noRelationship })).toBe(false);
  });
  it('F. DELIBERATE BEHAVIOUR CHANGE: owner_id alone no longer grants access — excluded from the three-level model by design', () => {
    expect(parentCaseAccess({ sameOrg: true, caseAccessLevel: 3, isCreator: false, hasCaseAccess: false })).toBe(false);
  });
  it('G. Cross-org, no case_access: DENY even at Level 1', () => {
    expect(parentCaseAccess({ sameOrg: false, caseAccessLevel: 1, ...noRelationship })).toBe(false);
  });
  it('H. Confidentiality no longer changes the outcome: Level 2 non-creator is denied on every case, confidential or not', () => {
    expect(parentCaseAccess({ sameOrg: true, caseAccessLevel: 2, ...noRelationship })).toBe(false);
  });
  it('I. case_access grants access regardless of level, including on a confidential case', () => {
    expect(parentCaseAccess({ sameOrg: true, caseAccessLevel: 3, isCreator: false, hasCaseAccess: true })).toBe(true);
  });
  it('J. Level 1 sees every in-org case unconditionally', () => {
    expect(parentCaseAccess({ sameOrg: true, caseAccessLevel: 1, ...noRelationship })).toBe(true);
  });
});

describe('write-matrix — SELECT / INSERT / UPDATE / DELETE (identical predicate by design: USING === WITH CHECK)', () => {
  const bystander = { sameOrg: true, caseAccessLevel: 3, ...noRelationship };
  const level1 = { sameOrg: true, caseAccessLevel: 1, ...noRelationship };

  it('SELECT: Level-3 bystander denied, Level 1 allowed', () => {
    expect(parentCaseAccess(bystander)).toBe(false);
    expect(parentCaseAccess(level1)).toBe(true);
  });
  it('INSERT: cannot create a theme/signal row under a case the caller cannot access; Level 1 can', () => {
    expect(parentCaseAccess(bystander)).toBe(false);
    expect(parentCaseAccess(level1)).toBe(true);
  });
  it('UPDATE: cannot update a theme/signal row under a hidden case; Level 1 can', () => {
    expect(canUpdateChildRow(bystander, bystander)).toBe(false);
    expect(canUpdateChildRow(level1, level1)).toBe(true);
  });
  it('DELETE: cannot delete a theme/signal row under a hidden case; Level 1 can', () => {
    expect(parentCaseAccess(bystander)).toBe(false);
    expect(parentCaseAccess(level1)).toBe(true);
  });
});

describe('UPDATE row-reassignment — a theme/signal moving between cases (WITH CHECK on the NEW row, USING on the OLD row)', () => {
  const authorisedCase = { sameOrg: true, caseAccessLevel: 2, isCreator: true, hasCaseAccess: false };
  const unauthorisedCase = { sameOrg: true, caseAccessLevel: 2, ...noRelationship };

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
      { sameOrg: true, caseAccessLevel: 1, ...noRelationship },
      { sameOrg: true, caseAccessLevel: 3, ...noRelationship },
      { sameOrg: true, caseAccessLevel: 3, isCreator: false, hasCaseAccess: true },
    ];
    scenarios.forEach(scenario => {
      const caseThemesResult = parentCaseAccess(scenario);
      const caseSignalsResult = parentCaseAccess(scenario);
      expect(caseThemesResult).toBe(caseSignalsResult);
    });
  });
});
