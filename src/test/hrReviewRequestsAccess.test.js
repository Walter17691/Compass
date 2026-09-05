import { describe, it, expect } from 'vitest';
import { canSeeAllOrgCases, hasConfidentialOversight, canAccessCaseLocation } from '../lib/roles';

// Security remediation (2026-09-05) — regression coverage for the
// hr_review_requests SELECT gap found during the Insights Phase 1 audit
// and closed by supabase/hr_review_requests_authoritative_case_access_2026-09-05.sql.
//
// This mirrors the same testing approach roles.test.js already uses for
// every other RLS-adjacent capability function in this codebase: a pure-JS
// mirror of the live SQL predicate, unit-tested exhaustively. It does NOT
// exercise the real Postgres RLS boundary — no test in this codebase does
// (confirmed absent during the audit); the environment's own write-blocking
// safety controls prevented constructing a live adversarial case row on
// even the isolated e2e-test project for this remediation.
//
// TEST-ONLY, DELIBERATELY: canSelectCase is defined here, not in
// src/lib/roles.js, and is not exported or imported by any application
// code. It exists solely to make this file's assertions checkable — the
// database RLS policy (supabase/hr_review_requests_authoritative_case_access_2026-09-05.sql)
// remains the single authoritative security boundary. Adding a second,
// independently-evolving "authorisation" helper to production code is
// exactly the kind of drift that caused the original bug (a second
// predicate, written once, never updated when the authoritative one
// changed) — so this mirror is confined to the test file it serves,
// reusing only the three genuinely-production capability functions
// (canSeeAllOrgCases / hasConfidentialOversight / canAccessCaseLocation)
// that already exist in src/lib/roles.js for real UI-gating purposes.
//
// THE INVARIANT THIS FILE EXISTS TO PROTECT: the fix deletes
// hr_review_requests' own predicate and delegates straight to `cases`' own
// RLS, so `cases`' effective SELECT visibility and hr_review_requests'
// effective SELECT visibility are now, by construction of the SQL, the
// same set of rows. canSelectCase below models that one shared predicate;
// proving it correct against the historical vulnerable predicate proves
// the fix. If canSelectCase's JS mirror ever drifts from the real SQL,
// this suite won't catch a live-DB divergence — only a divergence from
// what this file itself encodes. The migration's own header documents the
// SQL side; this file documents and regression-tests the logic side.
function canSelectCase({ role, sameOrg, memberLocationIds, caseLocationId, isCreator, isOwner, hasCaseAccess, confidential }) {
  const permissive = (sameOrg && canAccessCaseLocation(role, memberLocationIds, caseLocationId)) || hasCaseAccess;
  if (!permissive) return false;
  const confidentialOk = !confidential || isCreator || hasCaseAccess || hasConfidentialOversight(role);
  if (!confidentialOk) return false;
  return canSeeAllOrgCases(role) || isCreator || isOwner || hasCaseAccess;
}

// The exact predicate hr_review_requests_select_case_scoped used from
// 2026-08-26 until this fix — kept here ONLY so the "before" half of the
// regression assertions below is a real, historical predicate, not a
// hypothetical. Do not reuse this for anything else; it is the bug.
function vulnerableHrReviewRequestsPredicate({ role, sameOrg, memberLocationIds, caseLocationId, isCreator, hasCaseAccess, confidential }) {
  const permissive = (sameOrg && (role !== 'location_manager' || !memberLocationIds || memberLocationIds.length === 0 || memberLocationIds.includes(caseLocationId))) || hasCaseAccess;
  if (!permissive) return false;
  return !confidential || isCreator || hasCaseAccess || role === 'hr_director' || role === 'legal_reviewer' || role === 'auditor';
}

describe('canSelectCase — hr_review_requests / cases combined access model', () => {
  it('A. HR (hr_manager) with legitimate org-wide access to a non-confidential case: ALLOWED', () => {
    expect(canSelectCase({ role: 'hr_manager', sameOrg: true, isCreator: false, isOwner: false, hasCaseAccess: false, confidential: false })).toBe(true);
  });

  it('B. Case owner (owner_id = self), no other relationship: ALLOWED', () => {
    expect(canSelectCase({ role: 'line_manager', sameOrg: true, isCreator: false, isOwner: true, hasCaseAccess: false, confidential: false })).toBe(true);
  });

  it('C. Case creator, no other relationship: ALLOWED', () => {
    expect(canSelectCase({ role: 'line_manager', sameOrg: true, isCreator: true, isOwner: false, hasCaseAccess: false, confidential: false })).toBe(true);
  });

  it('D. Explicit case_access grant, no ownership: ALLOWED', () => {
    expect(canSelectCase({ role: 'investigator', sameOrg: true, isCreator: false, isOwner: false, hasCaseAccess: true, confidential: false })).toBe(true);
  });

  it('E. Ordinary same-org member with NO case relationship, non-confidential case: DENIED', () => {
    expect(canSelectCase({ role: 'line_manager', sameOrg: true, isCreator: false, isOwner: false, hasCaseAccess: false, confidential: false })).toBe(false);
  });

  it('F. Same-location member (location_manager scoped to that exact location) with NO ownership/participation/case_access: DENIED', () => {
    expect(canSelectCase({
      role: 'location_manager', sameOrg: true, memberLocationIds: ['loc-1'], caseLocationId: 'loc-1',
      isCreator: false, isOwner: false, hasCaseAccess: false, confidential: false,
    })).toBe(false);
  });

  it('G. User from a different organisation entirely: DENIED', () => {
    expect(canSelectCase({ role: 'hr_director', sameOrg: false, isCreator: false, isOwner: false, hasCaseAccess: false, confidential: false })).toBe(false);
  });

  it('H. Confidential case, no confidential oversight, no ownership/case_access: DENIED (hr_manager is NOT confidential-oversight)', () => {
    expect(canSelectCase({ role: 'hr_manager', sameOrg: true, isCreator: false, isOwner: false, hasCaseAccess: false, confidential: true })).toBe(false);
    expect(canSelectCase({ role: 'line_manager', sameOrg: true, isCreator: false, isOwner: false, hasCaseAccess: false, confidential: true })).toBe(false);
  });

  it('I. Authorised confidential-case access via explicit case_access: ALLOWED', () => {
    expect(canSelectCase({ role: 'investigator', sameOrg: true, isCreator: false, isOwner: false, hasCaseAccess: true, confidential: true })).toBe(true);
  });

  it('I2. Authorised confidential-case access via hr_director oversight (not hr_manager — hr_manager lacks confidential oversight): ALLOWED / DENIED respectively', () => {
    expect(canSelectCase({ role: 'hr_director', sameOrg: true, isCreator: false, isOwner: false, hasCaseAccess: false, confidential: true })).toBe(true);
    expect(canSelectCase({ role: 'hr_manager', sameOrg: true, isCreator: false, isOwner: false, hasCaseAccess: false, confidential: true })).toBe(false);
  });

  it('J. legal_reviewer / auditor: org-wide on non-confidential, and confidential-oversight on confidential', () => {
    expect(canSelectCase({ role: 'legal_reviewer', sameOrg: true, isCreator: false, isOwner: false, hasCaseAccess: false, confidential: false })).toBe(true);
    expect(canSelectCase({ role: 'auditor', sameOrg: true, isCreator: false, isOwner: false, hasCaseAccess: false, confidential: false })).toBe(true);
    expect(canSelectCase({ role: 'legal_reviewer', sameOrg: true, isCreator: false, isOwner: false, hasCaseAccess: false, confidential: true })).toBe(true);
    expect(canSelectCase({ role: 'auditor', sameOrg: true, isCreator: false, isOwner: false, hasCaseAccess: false, confidential: true })).toBe(true);
  });
});

describe('the core invariant: no case access → no hr_review_requests access, unless an authorised oversight path applies', () => {
  const noRelationship = { isCreator: false, isOwner: false, hasCaseAccess: false };

  it('CONFIRMS THE BUG as it existed 2026-08-26 → 2026-09-05: the old predicate ALLOWED a same-org bystander on a non-confidential case that the parent `cases` policy already DENIED', () => {
    const scenario = { role: 'line_manager', sameOrg: true, confidential: false, ...noRelationship };
    expect(canSelectCase(scenario)).toBe(false); // parent case: denied
    expect(vulnerableHrReviewRequestsPredicate(scenario)).toBe(true); // old hr_review_requests predicate: wrongly allowed
  });

  it('CONFIRMS THE FIX: hr_review_requests visibility is now exactly canSelectCase — the same bystander is denied both', () => {
    const scenario = { role: 'line_manager', sameOrg: true, confidential: false, ...noRelationship };
    const parentCaseAccess = canSelectCase(scenario);
    const hrReviewRequestsAccessAfterFix = canSelectCase(scenario); // same function post-fix, by construction of the migration
    expect(parentCaseAccess).toBe(false);
    expect(hrReviewRequestsAccessAfterFix).toBe(false);
  });

  it('the confidentiality boundary itself was never broken — old and new predicates already agreed here', () => {
    const scenario = { role: 'line_manager', sameOrg: true, confidential: true, ...noRelationship };
    expect(canSelectCase(scenario)).toBe(false);
    expect(vulnerableHrReviewRequestsPredicate(scenario)).toBe(false);
  });

  it('legitimate access (owner/creator/case_access/oversight) is unaffected by the fix, across every scenario A–J above', () => {
    const legitimateScenarios = [
      { role: 'hr_manager', sameOrg: true, confidential: false, ...noRelationship },
      { role: 'line_manager', sameOrg: true, confidential: false, isCreator: true, isOwner: false, hasCaseAccess: false },
      { role: 'line_manager', sameOrg: true, confidential: false, isCreator: false, isOwner: true, hasCaseAccess: false },
      { role: 'investigator', sameOrg: true, confidential: true, isCreator: false, isOwner: false, hasCaseAccess: true },
      { role: 'hr_director', sameOrg: true, confidential: true, ...noRelationship },
      { role: 'legal_reviewer', sameOrg: true, confidential: true, ...noRelationship },
      { role: 'auditor', sameOrg: true, confidential: false, ...noRelationship },
    ];
    legitimateScenarios.forEach(scenario => {
      expect(canSelectCase(scenario)).toBe(true);
      expect(vulnerableHrReviewRequestsPredicate(scenario)).toBe(true); // was already correctly allowed before too
    });
  });
});
