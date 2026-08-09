import { describe, it, expect } from 'vitest';
import { ROLES, ROLE_LABELS, roleLabel, isHrRole, hasConfidentialOversight } from '../lib/roles';

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
