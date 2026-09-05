import { describe, it, expect } from 'vitest';
import { canSeeAllOrgCases, hasConfidentialOversight, canAccessCaseLocation } from '../lib/roles';

// Security remediation (2026-09-05) — regression coverage for the
// allegations / case_tasks access gap found during the Insights Phase 1
// audit and closed by
// supabase/allegations_case_tasks_authoritative_case_access_2026-09-05.sql.
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

// Mirrors `cases`' own combined effective SELECT/write visibility — see
// hrReviewRequestsAccess.test.js for the full derivation. This is the
// predicate both allegations and case_tasks (case-scoped) now delegate to.
function parentCaseAccess({ role, sameOrg, memberLocationIds, caseLocationId, isCreator, isOwner, hasCaseAccess, confidential }) {
  const permissive = (sameOrg && canAccessCaseLocation(role, memberLocationIds, caseLocationId)) || hasCaseAccess;
  if (!permissive) return false;
  const confidentialOk = !confidential || isCreator || hasCaseAccess || hasConfidentialOversight(role);
  if (!confidentialOk) return false;
  return canSeeAllOrgCases(role) || isCreator || isOwner || hasCaseAccess;
}

// The historical predicate both allegations' single FOR ALL policy and
// case_tasks' case-scoped branch used from their respective last-touched
// dates (role_expansion_2026-08-09.sql / org_insight_actions_2026-08-20.sql)
// until this fix. Missing the ownership (R_own) term entirely. Kept here
// only so the "before" half of the regression assertions is the real
// historical predicate, not a hypothetical.
function vulnerableChildPredicate({ role, sameOrg, memberLocationIds, caseLocationId, isCreator, hasCaseAccess, confidential }) {
  const permissive = (sameOrg && canAccessCaseLocation(role, memberLocationIds, caseLocationId)) || hasCaseAccess;
  if (!permissive) return false;
  return !confidential || isCreator || hasCaseAccess || hasConfidentialOversight(role);
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

const noRelationship = { isCreator: false, isOwner: false, hasCaseAccess: false };

describe('allegations / case_tasks (case-scoped) — access matrix, post-fix', () => {
  it('A. HR/oversight: ALLOW', () => {
    expect(parentCaseAccess({ role: 'hr_manager', sameOrg: true, confidential: false, ...noRelationship })).toBe(true);
  });
  it('B. Owner, no other relationship: ALLOW (see the correction below — this was never actually denied before either)', () => {
    expect(parentCaseAccess({ role: 'line_manager', sameOrg: true, confidential: false, isCreator: false, isOwner: true, hasCaseAccess: false })).toBe(true);
  });
  it('C. Creator: ALLOW', () => {
    expect(parentCaseAccess({ role: 'line_manager', sameOrg: true, confidential: false, isCreator: true, isOwner: false, hasCaseAccess: false })).toBe(true);
  });
  it('D. Explicit case_access: ALLOW', () => {
    expect(parentCaseAccess({ role: 'investigator', sameOrg: true, confidential: false, isCreator: false, isOwner: false, hasCaseAccess: true })).toBe(true);
  });
  it('E. Same-org bystander, no relationship: DENY', () => {
    expect(parentCaseAccess({ role: 'line_manager', sameOrg: true, confidential: false, ...noRelationship })).toBe(false);
  });
  it('F. Same-location bystander, no relationship: DENY', () => {
    expect(parentCaseAccess({
      role: 'location_manager', sameOrg: true, memberLocationIds: ['loc-1'], caseLocationId: 'loc-1', confidential: false, ...noRelationship,
    })).toBe(false);
  });
  it('G. Cross-org: DENY', () => {
    expect(parentCaseAccess({ role: 'hr_director', sameOrg: false, confidential: false, ...noRelationship })).toBe(false);
  });
  it('H. Confidential, no oversight: DENY', () => {
    expect(parentCaseAccess({ role: 'hr_manager', sameOrg: true, confidential: true, ...noRelationship })).toBe(false);
    expect(parentCaseAccess({ role: 'line_manager', sameOrg: true, confidential: true, ...noRelationship })).toBe(false);
  });
  it('I. Confidential + authorised case_access: ALLOW', () => {
    expect(parentCaseAccess({ role: 'investigator', sameOrg: true, confidential: true, isCreator: false, isOwner: false, hasCaseAccess: true })).toBe(true);
  });
  it('J. legal_reviewer / auditor: ALLOW', () => {
    expect(parentCaseAccess({ role: 'legal_reviewer', sameOrg: true, confidential: false, ...noRelationship })).toBe(true);
    expect(parentCaseAccess({ role: 'auditor', sameOrg: true, confidential: true, ...noRelationship })).toBe(true);
  });
  it('K. location_manager, same location, no case relationship: DENY', () => {
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
  it('CONFIRMS THE FIX: allegations/case_tasks visibility is now exactly parentCaseAccess', () => {
    const scenario = { role: 'line_manager', sameOrg: true, confidential: false, ...noRelationship };
    expect(parentCaseAccess(scenario)).toBe(false); // fixed child predicate === parentCaseAccess by construction of the migration
  });
  it('confidentiality was never broken — old and new predicates already agreed', () => {
    const scenario = { role: 'line_manager', sameOrg: true, confidential: true, ...noRelationship };
    expect(parentCaseAccess(scenario)).toBe(false);
    expect(vulnerableChildPredicate(scenario)).toBe(false);
  });
  it('legitimate access (HR/creator/case_access/oversight) is unaffected by the fix', () => {
    const legitimateScenarios = [
      { role: 'hr_manager', sameOrg: true, confidential: false, ...noRelationship },
      { role: 'line_manager', sameOrg: true, confidential: false, isCreator: true, isOwner: false, hasCaseAccess: false },
      { role: 'investigator', sameOrg: true, confidential: true, isCreator: false, isOwner: false, hasCaseAccess: true },
      { role: 'hr_director', sameOrg: true, confidential: true, ...noRelationship },
    ];
    legitimateScenarios.forEach(scenario => {
      expect(parentCaseAccess(scenario)).toBe(true);
      expect(vulnerableChildPredicate(scenario)).toBe(true); // was already correctly allowed before too
    });
  });
  it('CORRECTION to an earlier audit claim: there is no "owner inconsistency" for this fix to correct. Because vulnerableChildPredicate = P AND R_conf and parentCaseAccess = P AND R_conf AND R_own (one extra ANDed term), parentCaseAccess\'s allowed-set is always a SUBSET of vulnerableChildPredicate\'s — adding a restriction can only narrow access, never widen it. It is mathematically impossible for parentCaseAccess to allow something vulnerableChildPredicate denied. An owner-only relationship was already allowed under the old predicate for a non-confidential case (same as everyone, via P alone) and is denied under BOTH old and new predicates for a confidential case (R_conf has no owner_id OR-term — that gap is on `cases` itself, unrelated to and unaffected by this fix).', () => {
    const ownerNonConfidential = { role: 'line_manager', sameOrg: true, confidential: false, isCreator: false, isOwner: true, hasCaseAccess: false };
    const ownerConfidential = { role: 'line_manager', sameOrg: true, confidential: true, isCreator: false, isOwner: true, hasCaseAccess: false };
    expect(parentCaseAccess(ownerNonConfidential)).toBe(true);
    expect(vulnerableChildPredicate(ownerNonConfidential)).toBe(true); // already allowed before — no correction needed
    expect(parentCaseAccess(ownerConfidential)).toBe(false); // owner_id is not an R_conf term, on `cases` itself
    expect(vulnerableChildPredicate(ownerConfidential)).toBe(false); // denied identically before and after
  });
});

describe('write-matrix — SELECT / INSERT / UPDATE / DELETE (identical predicate by design: USING === WITH CHECK)', () => {
  const bystander = { role: 'line_manager', sameOrg: true, confidential: false, ...noRelationship };
  const owner = { role: 'line_manager', sameOrg: true, confidential: false, isCreator: false, isOwner: true, hasCaseAccess: false };

  it('SELECT: bystander denied, owner allowed', () => {
    expect(parentCaseAccess(bystander)).toBe(false);
    expect(parentCaseAccess(owner)).toBe(true);
  });
  it('INSERT: cannot create a child row under a case the caller cannot access; owner can', () => {
    expect(parentCaseAccess(bystander)).toBe(false);
    expect(parentCaseAccess(owner)).toBe(true);
  });
  it('UPDATE: cannot update a child row under a hidden case; owner can update their own', () => {
    expect(canUpdateAllegation(bystander, bystander)).toBe(false);
    expect(canUpdateAllegation(owner, owner)).toBe(true);
  });
  it('DELETE: cannot delete a child row under a hidden case; owner can delete their own', () => {
    expect(parentCaseAccess(bystander)).toBe(false);
    expect(parentCaseAccess(owner)).toBe(true);
  });
});

describe('UPDATE row-reassignment — allegations moving between cases (WITH CHECK on the NEW row, USING on the OLD row)', () => {
  const authorisedCase = { role: 'line_manager', sameOrg: true, confidential: false, isCreator: true, isOwner: false, hasCaseAccess: false };
  const unauthorisedCase = { role: 'line_manager', sameOrg: true, confidential: false, ...noRelationship };

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

describe('case_tasks — org-level branch (case_id IS NULL) is unchanged by this fix', () => {
  it('legitimate same-org user: unchanged (allowed before and after)', () => {
    expect(orgLevelTaskAccess({ sameOrg: true })).toBe(true);
  });
  it('cross-org user on an org-level task: denied, unaffected by this fix', () => {
    expect(orgLevelTaskAccess({ sameOrg: false })).toBe(false);
  });
});

describe('case_tasks — UPDATE transitions between case_id states', () => {
  const orgLevelOld = { caseIdIsNull: true, sameOrg: true };
  const authorisedCaseRow = { caseIdIsNull: false, role: 'line_manager', sameOrg: true, confidential: false, isCreator: true, isOwner: false, hasCaseAccess: false };
  const unauthorisedCaseRow = { caseIdIsNull: false, role: 'line_manager', sameOrg: true, confidential: false, ...noRelationship };

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
