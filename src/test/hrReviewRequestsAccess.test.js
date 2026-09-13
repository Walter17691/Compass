import { describe, it, expect } from 'vitest';

// Security remediation (2026-09-05) — regression coverage for the
// hr_review_requests SELECT gap found during the Insights Phase 1 audit
// and closed by supabase/hr_review_requests_authoritative_case_access_2026-09-05.sql.
//
// Superseded predicate (2026-09-13) — the three-level case-access model
// (supabase/three_level_case_access_2026-09-13.sql) rewrote `cases`' own
// restrictive policy from role+location-based to case_access_level-based
// and folded confidentiality into that same predicate. hr_review_requests'
// own SELECT policy (hr_review_requests_select_case_scoped) delegates to
// `cases`' RLS via a bare EXISTS with no logic of its own (confirmed live
// via pg_policy), so no SQL change was needed there — but this file's JS
// mirror must be updated to match the new delegated predicate.
//
// hr_review_requests_update_hr_only is UNCHANGED by the three-level model:
// it gates on can_see_all_org_cases(role) directly, which is a CAPABILITY
// question (who may approve/action an HR Review Gate sign-off), not a case
// VISIBILITY question — the two are deliberately kept independent by this
// migration's own design, so that policy is out of scope for this file.
//
// This mirrors the same testing approach roles.test.js already uses for
// every other RLS-adjacent capability function in this codebase: a pure-JS
// mirror of the live SQL predicate, unit-tested exhaustively. It does NOT
// exercise the real Postgres RLS boundary — no test in this codebase does
// (confirmed absent during the original audit).
//
// TEST-ONLY, DELIBERATELY: canSelectCase is defined here, not in
// src/lib/roles.js, and is not exported or imported by any application
// code. It exists solely to make this file's assertions checkable — the
// database RLS policy remains the single authoritative security boundary.
//
// THE INVARIANT THIS FILE EXISTS TO PROTECT: hr_review_requests' own SELECT
// delegates straight to `cases`' own RLS, so `cases`' effective SELECT
// visibility and hr_review_requests' effective SELECT visibility are, by
// construction of the SQL, the same set of rows. canSelectCase below models
// that one shared predicate.
function canSelectCase({ sameOrg, caseAccessLevel, isCreator, hasCaseAccess }) {
  if (hasCaseAccess) return true;
  if (!sameOrg) return false;
  if (caseAccessLevel === 1) return true;
  return caseAccessLevel === 2 && isCreator === true;
}

describe('canSelectCase — hr_review_requests / cases combined access model (three-level)', () => {
  it('A. Level 1, no other relationship: ALLOWED', () => {
    expect(canSelectCase({ sameOrg: true, caseAccessLevel: 1, isCreator: false, hasCaseAccess: false })).toBe(true);
  });

  it('B. Level 2, creator: ALLOWED', () => {
    expect(canSelectCase({ sameOrg: true, caseAccessLevel: 2, isCreator: true, hasCaseAccess: false })).toBe(true);
  });

  it('C. Level 2, NOT creator, no case_access: DENIED', () => {
    expect(canSelectCase({ sameOrg: true, caseAccessLevel: 2, isCreator: false, hasCaseAccess: false })).toBe(false);
  });

  it('D. Explicit case_access grant at Level 3: ALLOWED', () => {
    expect(canSelectCase({ sameOrg: true, caseAccessLevel: 3, isCreator: false, hasCaseAccess: true })).toBe(true);
  });

  it('E. Level 3, no case relationship: DENIED', () => {
    expect(canSelectCase({ sameOrg: true, caseAccessLevel: 3, isCreator: false, hasCaseAccess: false })).toBe(false);
  });

  it('F. DELIBERATE BEHAVIOUR CHANGE: owner_id alone no longer grants access under the three-level model (case_access is the sole assignment mechanism)', () => {
    // owner_id is not a parameter of canSelectCase anymore — there is no
    // path to ALLOWED here without caseAccessLevel 1, a Level-2 creator
    // match, or an explicit case_access grant.
    expect(canSelectCase({ sameOrg: true, caseAccessLevel: 3, isCreator: false, hasCaseAccess: false })).toBe(false);
  });

  it('G. User from a different organisation entirely, no case_access: DENIED even at Level 1', () => {
    expect(canSelectCase({ sameOrg: false, caseAccessLevel: 1, isCreator: false, hasCaseAccess: false })).toBe(false);
  });

  it('H. Confidentiality no longer changes the outcome: Level 2 non-creator is denied on every case, confidential or not — there is no separate confidential-oversight bypass anymore', () => {
    expect(canSelectCase({ sameOrg: true, caseAccessLevel: 2, isCreator: false, hasCaseAccess: false })).toBe(false);
  });

  it('I. Authorised access via explicit case_access, regardless of level: ALLOWED', () => {
    expect(canSelectCase({ sameOrg: true, caseAccessLevel: 3, isCreator: false, hasCaseAccess: true })).toBe(true);
  });

  it('J. Level 1 sees every case in-org unconditionally, including ones they neither created nor hold case_access on', () => {
    expect(canSelectCase({ sameOrg: true, caseAccessLevel: 1, isCreator: false, hasCaseAccess: false })).toBe(true);
  });
});

describe('the core invariant: hr_review_requests visibility is exactly cases visibility, by construction', () => {
  it('a Level-3 bystander with no case_access is denied both cases and hr_review_requests identically', () => {
    const scenario = { sameOrg: true, caseAccessLevel: 3, isCreator: false, hasCaseAccess: false };
    const parentCaseAccess = canSelectCase(scenario);
    const hrReviewRequestsAccess = canSelectCase(scenario); // same function, by construction of the migration
    expect(parentCaseAccess).toBe(false);
    expect(hrReviewRequestsAccess).toBe(false);
  });

  it('legitimate access (Level 1 / Level-2 creator / case_access) is identical across cases and hr_review_requests', () => {
    const legitimateScenarios = [
      { sameOrg: true, caseAccessLevel: 1, isCreator: false, hasCaseAccess: false },
      { sameOrg: true, caseAccessLevel: 2, isCreator: true, hasCaseAccess: false },
      { sameOrg: true, caseAccessLevel: 3, isCreator: false, hasCaseAccess: true },
    ];
    legitimateScenarios.forEach(scenario => {
      expect(canSelectCase(scenario)).toBe(true);
    });
  });
});
