import { describe, it, expect } from 'vitest';
import { ROLES, ROLE_LABELS, TEAM_INVITE_ROLES, LOCATION_SCOPED_ROLES, ROLE_DESCRIPTIONS, roleLabel, isHrRole, hasConfidentialOversight, canSeeAllOrgCases, canAccessCaseLocation, canManageDirectorTier } from '../lib/roles';

describe('ROLES / ROLE_LABELS', () => {
  it('has exactly 7 roles', () => {
    expect(ROLES).toHaveLength(7);
  });

  it('ROLE_LABELS has an entry for every role id', () => {
    ROLES.forEach(r => expect(ROLE_LABELS[r.id]).toBe(r.label));
  });
});

describe('roleLabel', () => {
  it('returns the known label for a valid role', () => {
    expect(roleLabel('hr_director')).toBe('HR Director');
  });

  it('falls back to the raw value for an unknown role, and "Team member" for none', () => {
    expect(roleLabel('some_future_role')).toBe('some_future_role');
    expect(roleLabel(null)).toBe('Team member');
    expect(roleLabel(undefined)).toBe('Team member');
  });
});

describe('isHrRole', () => {
  it('is true only for hr_manager and hr_director, unchanged from before role expansion', () => {
    expect(isHrRole('hr_manager')).toBe(true);
    expect(isHrRole('hr_director')).toBe(true);
    expect(isHrRole('location_manager')).toBe(false);
    expect(isHrRole('investigator')).toBe(false);
    expect(isHrRole('line_manager')).toBe(false);
    expect(isHrRole('legal_reviewer')).toBe(false);
    expect(isHrRole('auditor')).toBe(false);
  });
});

describe('hasConfidentialOversight', () => {
  it('is true for hr_director, legal_reviewer, and auditor', () => {
    expect(hasConfidentialOversight('hr_director')).toBe(true);
    expect(hasConfidentialOversight('legal_reviewer')).toBe(true);
    expect(hasConfidentialOversight('auditor')).toBe(true);
  });

  it('is false for every other role, including hr_manager', () => {
    expect(hasConfidentialOversight('hr_manager')).toBe(false);
    expect(hasConfidentialOversight('location_manager')).toBe(false);
    expect(hasConfidentialOversight('investigator')).toBe(false);
    expect(hasConfidentialOversight('line_manager')).toBe(false);
  });
});

describe('canSeeAllOrgCases (Phase 4, MP1)', () => {
  it('mirrors can_see_all_org_cases() in manager_enablement_case_access_2026-08-13.sql: hr_manager, hr_director, legal_reviewer, auditor', () => {
    expect(canSeeAllOrgCases('hr_manager')).toBe(true);
    expect(canSeeAllOrgCases('hr_director')).toBe(true);
    expect(canSeeAllOrgCases('legal_reviewer')).toBe(true);
    expect(canSeeAllOrgCases('auditor')).toBe(true);
  });

  it('is false for location_manager and line_manager — narrowed to created/owned/case_access cases by the new restrictive RLS policy', () => {
    expect(canSeeAllOrgCases('location_manager')).toBe(false);
    expect(canSeeAllOrgCases('line_manager')).toBe(false);
    expect(canSeeAllOrgCases('investigator')).toBe(false);
  });

  it('is false for no role at all', () => {
    expect(canSeeAllOrgCases(null)).toBe(false);
    expect(canSeeAllOrgCases(undefined)).toBe(false);
  });
});

// Phase 6.5 hardening — mirrors can_access_case_location() in
// supabase/manager_enablement_case_access_2026-08-13.sql exactly.
describe('canAccessCaseLocation', () => {
  it('is true for every non-location_manager role, regardless of location', () => {
    expect(canAccessCaseLocation('hr_director', null, 'loc-1')).toBe(true);
    expect(canAccessCaseLocation('line_manager', ['loc-2'], 'loc-1')).toBe(true);
    expect(canAccessCaseLocation('investigator', [], 'loc-1')).toBe(true);
  });

  it('is true for a location_manager with no locations assigned yet', () => {
    expect(canAccessCaseLocation('location_manager', null, 'loc-1')).toBe(true);
    expect(canAccessCaseLocation('location_manager', [], 'loc-1')).toBe(true);
  });

  it('is true for a location_manager whose assigned locations include the case\'s own', () => {
    expect(canAccessCaseLocation('location_manager', ['loc-1', 'loc-2'], 'loc-1')).toBe(true);
  });

  it('is false for a location_manager with a real, non-matching assigned-locations list — the one real restriction this function enforces', () => {
    expect(canAccessCaseLocation('location_manager', ['loc-2', 'loc-3'], 'loc-1')).toBe(false);
  });
});

// NEW-8 remediation
describe('TEAM_INVITE_ROLES', () => {
  it('excludes hr_director', () => {
    expect(TEAM_INVITE_ROLES.some(r => r.id === 'hr_director')).toBe(false);
  });

  it('includes every other role', () => {
    expect(TEAM_INVITE_ROLES).toHaveLength(6);
    ['hr_manager', 'location_manager', 'line_manager', 'investigator', 'legal_reviewer', 'auditor'].forEach(id => {
      expect(TEAM_INVITE_ROLES.some(r => r.id === id)).toBe(true);
    });
  });
});

describe('LOCATION_SCOPED_ROLES / ROLE_DESCRIPTIONS', () => {
  it('only location_manager is location-scoped', () => {
    expect(LOCATION_SCOPED_ROLES.has('location_manager')).toBe(true);
    expect(LOCATION_SCOPED_ROLES.has('line_manager')).toBe(false);
    expect(LOCATION_SCOPED_ROLES.has('hr_manager')).toBe(false);
  });

  it('has a description for every invitable role', () => {
    TEAM_INVITE_ROLES.forEach(r => expect(ROLE_DESCRIPTIONS[r.id]).toBeTruthy());
  });
});

// NEW-9 remediation — client-side mirror of
// protect_org_member_privilege_columns()'s hr_director-tier check.
describe('canManageDirectorTier (NEW-9)', () => {
  it('an hr_director can manage any row, director or not', () => {
    expect(canManageDirectorTier('hr_director', 'hr_director')).toBe(true);
    expect(canManageDirectorTier('hr_director', 'hr_manager')).toBe(true);
  });

  it('an hr_manager can manage a non-director row', () => {
    expect(canManageDirectorTier('hr_manager', 'hr_manager')).toBe(true);
    expect(canManageDirectorTier('hr_manager', 'location_manager')).toBe(true);
  });

  it('an hr_manager cannot manage an existing hr_director row', () => {
    expect(canManageDirectorTier('hr_manager', 'hr_director')).toBe(false);
  });
});
