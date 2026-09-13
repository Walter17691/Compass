import { describe, it, expect } from 'vitest';

// Security remediation (2026-09-05) — regression coverage for the
// allegations / case_tasks access gap found during the Insights Phase 1
// audit and closed by
// supabase/allegations_case_tasks_authoritative_case_access_2026-09-05.sql.
//
// Superseded predicate (2026-09-13) — the three-level case-access model
// (supabase/three_level_case_access_2026-09-13.sql) rewrote `cases`' own
// restrictive policy from role+location-based to case_access_level-based,
// and folded confidentiality into that same predicate (Level 1/2/3's
// confidential rule is now identical to their ordinary rule — see that
// migration's own header for the product decision behind this). Because
// allegations/case_tasks delegate to `cases`' RLS via a bare
// `EXISTS (SELECT 1 FROM cases ...)` with no logic of their own (confirmed
// live via pg_policy during the three-level-model implementation), no SQL
// change was needed to either table — but this file's JS mirror of the
// delegated predicate must be updated to match, or it silently documents a
// retired security model.
//
// Same approach as src/test/hrReviewRequestsAccess.test.js: a pure-JS
// mirror of the live SQL predicate, unit-tested exhaustively, defined here
// only — not exported, not added to src/lib/roles.js or any other
// production file. The database RLS policy remains the single
// authoritative security boundary; this file exists to make its intended
// behaviour checkable, not to duplicate it into application code.
//
// Both tables' fixed policies are FOR ALL with USING === WITH CHECK,
// delegating to `cases`' own RLS via a single EXISTS. That means, for a
// case-scoped row, SELECT/INSERT/UPDATE/DELETE all reduce to the exact same
// predicate — parentCaseAccess() below — which is why the SELECT/INSERT/
// UPDATE/DELETE describe blocks all call the same function: this is a
// property of the fix's design (one delegated predicate, not four), not an
// oversight in the test.

// Mirrors `cases`' own combined effective SELECT/write visibility under the
// three-level model: Level 1 sees everything in-org; Level 2 sees what they
// created; anyone (any level, any org) with an explicit case_access grant
// sees that case regardless. Deliberately has no `role`, `location`, or
// `confidential` parameter — none of the three participate in this
// predicate anymore. `isOwner` (cases.owner_id) is also deliberately absent:
// the three-level model excludes owner_id from case visibility by design
// (case_access is the sole assignment mechanism — see the migration's own
// "why not owner_id" note), which is a real, deliberate behaviour change
// from the predicate this file tested before.
function parentCaseAccess({ sameOrg, caseAccessLevel, isCreator, hasCaseAccess }) {
  if (hasCaseAccess) return true;
  if (!sameOrg) return false;
  if (caseAccessLevel === 1) return true;
  return caseAccessLevel === 2 && isCreator === true;
}

// case_tasks' org-level branch (case_id IS NULL) — unaffected by this fix,
// unchanged before and after. No parent case exists to check.
function orgLevelTaskAccess({ sameOrg }) {
  return sameOrg;
}

// case_tasks' full row predicate (case-scoped OR org-level), post-fix.
function caseTasksRowAccess({ caseIdIsNull, sameOrg, ...caseScopedArgs }) {
  return caseIdIsNull ? orgLevelTaskAccess({ sameOrg }) : parentCaseAccess({ sameOrg, ...caseScopedArgs });
}

// UPDATE requires USING (against the OLD row) AND WITH CHECK (against the
// NEW row) both to pass — both clauses are now identical (caseTasksRowAccess
// / parentCaseAccess), evaluated against different row states.
function canUpdateCaseTask(oldRow, newRow) {
  return caseTasksRowAccess(oldRow) && caseTasksRowAccess(newRow);
}
function canUpdateAllegation(oldRow, newRow) {
  return parentCaseAccess(oldRow) && parentCaseAccess(newRow);
}

const noRelationship = { isCreator: false, hasCaseAccess: false };

describe('allegations / case_tasks (case-scoped) — access matrix, three-level model', () => {
  it('A. Level 1, no other relationship: ALLOW', () => {
    expect(parentCaseAccess({ sameOrg: true, caseAccessLevel: 1, ...noRelationship })).toBe(true);
  });
  it('B. Level 2, creator: ALLOW', () => {
    expect(parentCaseAccess({ sameOrg: true, caseAccessLevel: 2, isCreator: true, hasCaseAccess: false })).toBe(true);
  });
  it('C. Level 2, NOT creator, no case_access: DENY', () => {
    expect(parentCaseAccess({ sameOrg: true, caseAccessLevel: 2, ...noRelationship })).toBe(false);
  });
  it('D. Level 3, explicit case_access: ALLOW', () => {
    expect(parentCaseAccess({ sameOrg: true, caseAccessLevel: 3, isCreator: false, hasCaseAccess: true })).toBe(true);
  });
  it('E. Level 3, no relationship: DENY', () => {
    expect(parentCaseAccess({ sameOrg: true, caseAccessLevel: 3, ...noRelationship })).toBe(false);
  });
  it('F. DELIBERATE BEHAVIOUR CHANGE: owner_id alone (not creator, no case_access) no longer grants access — owner_id was excluded from the three-level model by design, since case_access is now the sole assignment mechanism', () => {
    expect(parentCaseAccess({ sameOrg: true, caseAccessLevel: 3, isCreator: false, hasCaseAccess: false })).toBe(false);
    expect(parentCaseAccess({ sameOrg: true, caseAccessLevel: 2, isCreator: false, hasCaseAccess: false })).toBe(false);
  });
  it('G. Cross-org, no case_access: DENY even at Level 1 (level is scoped to org_members.org_id)', () => {
    expect(parentCaseAccess({ sameOrg: false, caseAccessLevel: 1, ...noRelationship })).toBe(false);
  });
  it('H. Confidentiality no longer changes the outcome: Level 1 sees confidential cases exactly like non-confidential ones (folded into one predicate by the migration)', () => {
    expect(parentCaseAccess({ sameOrg: true, caseAccessLevel: 1, ...noRelationship })).toBe(true);
  });
  it('I. Level 2 + creator sees their own confidential case with no other flag needed', () => {
    expect(parentCaseAccess({ sameOrg: true, caseAccessLevel: 2, isCreator: true, hasCaseAccess: false })).toBe(true);
  });
  it('J. case_access grants access regardless of level, including Level 3 on a case they did not create', () => {
    expect(parentCaseAccess({ sameOrg: true, caseAccessLevel: 3, isCreator: false, hasCaseAccess: true })).toBe(true);
  });
});

describe('write-matrix — SELECT / INSERT / UPDATE / DELETE (identical predicate by design: USING === WITH CHECK)', () => {
  const bystander = { sameOrg: true, caseAccessLevel: 3, ...noRelationship };
  const level1 = { sameOrg: true, caseAccessLevel: 1, ...noRelationship };

  it('SELECT: Level-3 bystander denied, Level 1 allowed', () => {
    expect(parentCaseAccess(bystander)).toBe(false);
    expect(parentCaseAccess(level1)).toBe(true);
  });
  it('INSERT: cannot create a child row under a case the caller cannot access; Level 1 can', () => {
    expect(parentCaseAccess(bystander)).toBe(false);
    expect(parentCaseAccess(level1)).toBe(true);
  });
  it('UPDATE: cannot update a child row under a hidden case; Level 1 can update freely', () => {
    expect(canUpdateAllegation(bystander, bystander)).toBe(false);
    expect(canUpdateAllegation(level1, level1)).toBe(true);
  });
  it('DELETE: cannot delete a child row under a hidden case; Level 1 can', () => {
    expect(parentCaseAccess(bystander)).toBe(false);
    expect(parentCaseAccess(level1)).toBe(true);
  });
});

describe('UPDATE row-reassignment — allegations moving between cases (WITH CHECK on the NEW row, USING on the OLD row)', () => {
  const authorisedCase = { sameOrg: true, caseAccessLevel: 2, isCreator: true, hasCaseAccess: false };
  const unauthorisedCase = { sameOrg: true, caseAccessLevel: 2, ...noRelationship };

  it('cannot move an allegation FROM an authorised case TO an unauthorised one', () => {
    expect(canUpdateAllegation(authorisedCase, unauthorisedCase)).toBe(false);
  });
  it('cannot update an allegation already under a hidden/unauthorised case, regardless of the new case', () => {
    expect(canUpdateAllegation(unauthorisedCase, authorisedCase)).toBe(false);
  });
  it('can move an allegation between two cases the caller legitimately has access to', () => {
    expect(canUpdateAllegation(authorisedCase, authorisedCase)).toBe(true);
  });
});

describe('case_tasks — org-level branch (case_id IS NULL) is unchanged by the three-level model', () => {
  it('legitimate same-org user: unchanged (allowed before and after)', () => {
    expect(orgLevelTaskAccess({ sameOrg: true })).toBe(true);
  });
  it('cross-org user on an org-level task: denied, unaffected by this fix', () => {
    expect(orgLevelTaskAccess({ sameOrg: false })).toBe(false);
  });
});

describe('case_tasks — UPDATE transitions between case_id states', () => {
  const orgLevelOld = { caseIdIsNull: true, sameOrg: true };
  const authorisedCaseRow = { caseIdIsNull: false, sameOrg: true, caseAccessLevel: 2, isCreator: true, hasCaseAccess: false };
  const unauthorisedCaseRow = { caseIdIsNull: false, sameOrg: true, caseAccessLevel: 2, ...noRelationship };

  it('NULL → authorised case: ALLOWED', () => {
    expect(canUpdateCaseTask(orgLevelOld, authorisedCaseRow)).toBe(true);
  });
  it('NULL → unauthorised case: DENIED (WITH CHECK blocks the new case_id)', () => {
    expect(canUpdateCaseTask(orgLevelOld, unauthorisedCaseRow)).toBe(false);
  });
  it('authorised case → NULL: ALLOWED (org-level branch permits it)', () => {
    expect(canUpdateCaseTask(authorisedCaseRow, orgLevelOld)).toBe(true);
  });
  it('authorised case → unauthorised case: DENIED', () => {
    expect(canUpdateCaseTask(authorisedCaseRow, unauthorisedCaseRow)).toBe(false);
  });
  it('hidden/unauthorised case → anything: DENIED (USING blocks the old row before WITH CHECK is even relevant)', () => {
    expect(canUpdateCaseTask(unauthorisedCaseRow, orgLevelOld)).toBe(false);
    expect(canUpdateCaseTask(unauthorisedCaseRow, authorisedCaseRow)).toBe(false);
  });
});
