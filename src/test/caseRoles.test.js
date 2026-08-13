import { describe, it, expect } from 'vitest';
import { caseRoleLabel, currentRoleHolder, ASSIGNABLE_ROLES, ASSIGNABLE_ROLE_IDS, CASE_ROLES } from '../lib/caseRoles';

describe('caseRoleLabel', () => {
  it('returns the human label for a known role', () => {
    expect(caseRoleLabel('appeal_manager')).toBe('Appeal Manager');
    expect(caseRoleLabel('disciplinary_officer')).toBe('Hearing Manager');
  });

  it('falls back to the raw id for an unrecognised role', () => {
    expect(caseRoleLabel('made_up_role')).toBe('made_up_role');
  });
});

describe('ASSIGNABLE_ROLES', () => {
  it('only covers the roles with no pre-existing dedicated assignment flow', () => {
    expect(ASSIGNABLE_ROLE_IDS).toEqual(['appeal_manager', 'notetaker', 'employee_manager', 'approver']);
    expect(ASSIGNABLE_ROLES.map(r => r.id)).toEqual(ASSIGNABLE_ROLE_IDS);
  });

  it('excludes roles that already have their own UI (investigator, case_owner, disciplinary_officer)', () => {
    const assignableIds = ASSIGNABLE_ROLES.map(r => r.id);
    expect(assignableIds).not.toContain('investigator');
    expect(assignableIds).not.toContain('case_owner');
    expect(assignableIds).not.toContain('disciplinary_officer');
  });

  it('every assignable role is also present in the full CASE_ROLES vocabulary', () => {
    ASSIGNABLE_ROLE_IDS.forEach(id => {
      expect(CASE_ROLES.some(r => r.id === id)).toBe(true);
    });
  });
});

describe('currentRoleHolder', () => {
  const orgMembers = [
    { id: 'm1', user_id: 'u1', name: 'Priya Shah' },
    { id: 'm2', user_id: 'u2', name: 'Tom Norton' },
  ];

  it('resolves the org member currently holding a role on a case', () => {
    const caseAccess = [{ caseId: 'case1', userId: 'u1', role: 'appeal_manager' }];
    const holder = currentRoleHolder(caseAccess, orgMembers, 'case1', 'appeal_manager');
    expect(holder.name).toBe('Priya Shah');
  });

  it('returns null when nobody holds that role on this case', () => {
    const caseAccess = [{ caseId: 'case1', userId: 'u1', role: 'notetaker' }];
    expect(currentRoleHolder(caseAccess, orgMembers, 'case1', 'appeal_manager')).toBeNull();
  });

  it('ignores role assignments on a different case', () => {
    const caseAccess = [{ caseId: 'other-case', userId: 'u1', role: 'appeal_manager' }];
    expect(currentRoleHolder(caseAccess, orgMembers, 'case1', 'appeal_manager')).toBeNull();
  });

  it('takes the most recent assignment when more than one row exists for the same role', () => {
    const caseAccess = [
      { caseId: 'case1', userId: 'u1', role: 'notetaker' },
      { caseId: 'case1', userId: 'u2', role: 'notetaker' },
    ];
    const holder = currentRoleHolder(caseAccess, orgMembers, 'case1', 'notetaker');
    expect(holder.name).toBe('Tom Norton');
  });

  it('returns null for an empty caseAccess array', () => {
    expect(currentRoleHolder([], orgMembers, 'case1', 'approver')).toBeNull();
  });
});
