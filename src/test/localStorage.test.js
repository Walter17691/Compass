import { describe, it, expect, beforeEach } from 'vitest';
import { ls, lsSet, orgScopedKey, clearAllOrgScopedData, SENSITIVE_ORG_SCOPED_KEYS } from '../lib/storage.js';

describe('ls / lsSet', () => {
  beforeEach(() => {
    localStorage.clear();
  });

  it('returns the fallback when nothing is stored', () => {
    expect(ls('missing-key', 'fallback')).toBe('fallback');
  });

  it('round-trips an object through lsSet/ls', () => {
    lsSet('compass_test', { a: 1, b: [1, 2, 3] });
    expect(ls('compass_test', null)).toEqual({ a: 1, b: [1, 2, 3] });
  });

  it('falls back gracefully on corrupted JSON instead of throwing', () => {
    localStorage.setItem('compass_test', '{not valid json');
    expect(ls('compass_test', 'fallback')).toBe('fallback');
  });
});

// Phase 6.5 hardening — tenant isolation (P0). orgScopedKey is what makes
// App.jsx's orgLs/orgLsSet actually org-specific; these tests cover the
// key-derivation logic in isolation from the full App.jsx harness.
describe('orgScopedKey', () => {
  it('prefixes the key with the given org id', () => {
    expect(orgScopedKey('org-a', 'compass_cases')).toBe('org-a:compass_cases');
  });

  it('produces different keys for different orgs, given the same base key', () => {
    const a = orgScopedKey('org-a', 'compass_cases');
    const b = orgScopedKey('org-b', 'compass_cases');
    expect(a).not.toBe(b);
  });

  it('falls back to a stable "noorg" namespace when no org id is available, rather than an unscoped key', () => {
    expect(orgScopedKey(null, 'compass_cases')).toBe('noorg:compass_cases');
    expect(orgScopedKey(undefined, 'compass_cases')).toBe('noorg:compass_cases');
    expect(orgScopedKey('', 'compass_cases')).toBe('noorg:compass_cases');
  });
});

describe('ls / lsSet through orgScopedKey — cross-tenant isolation', () => {
  beforeEach(() => { localStorage.clear(); });

  it('two different orgs never read each other\'s data under the same base key', () => {
    lsSet(orgScopedKey('org-a', 'compass_cases'), [{ id: 'case-a', employeeName: 'Org A Employee' }]);
    lsSet(orgScopedKey('org-b', 'compass_cases'), [{ id: 'case-b', employeeName: 'Org B Employee' }]);

    expect(ls(orgScopedKey('org-a', 'compass_cases'), [])).toEqual([{ id: 'case-a', employeeName: 'Org A Employee' }]);
    expect(ls(orgScopedKey('org-b', 'compass_cases'), [])).toEqual([{ id: 'case-b', employeeName: 'Org B Employee' }]);
  });

  it('a fresh, never-visited org reads its own empty fallback, not another org\'s cached data', () => {
    lsSet(orgScopedKey('org-a', 'compass_cases'), [{ id: 'case-a' }]);
    expect(ls(orgScopedKey('org-c', 'compass_cases'), [])).toEqual([]);
  });
});

// Phase 6.5 hardening (High, security review) — shared-device sign-out.
// clearAllOrgScopedData() is what main.jsx's signOut() now calls before
// tearing down the session, and what App.jsx's "Delete all data" GDPR
// flow now shares instead of its own second, previously-incomplete list.
describe('clearAllOrgScopedData', () => {
  beforeEach(() => { localStorage.clear(); });

  it('clears every known-sensitive key for a single org', () => {
    for (const key of SENSITIVE_ORG_SCOPED_KEYS) lsSet(orgScopedKey('org-a', key), ['sensitive data']);
    clearAllOrgScopedData();
    for (const key of SENSITIVE_ORG_SCOPED_KEYS) expect(localStorage.getItem(orgScopedKey('org-a', key))).toBeNull();
  });

  it('clears wellbeing notes, employee records, redundancy data, and meeting drafts specifically — the exact gap in the previous deleteAllData list', () => {
    lsSet(orgScopedKey('org-a', 'compass_wellbeing'), [{ employeeName: 'Sam', content: 'confidential health note' }]);
    lsSet(orgScopedKey('org-a', 'compass_employees'), [{ name: 'Sam', dateOfBirth: '1990-01-01' }]);
    lsSet(orgScopedKey('org-a', 'compass_redundancy'), [{ id: 'r1' }]);
    lsSet(orgScopedKey('org-a', 'compass_meeting_draft'), { transcript: 'live meeting notes' });
    clearAllOrgScopedData();
    expect(localStorage.getItem(orgScopedKey('org-a', 'compass_wellbeing'))).toBeNull();
    expect(localStorage.getItem(orgScopedKey('org-a', 'compass_employees'))).toBeNull();
    expect(localStorage.getItem(orgScopedKey('org-a', 'compass_redundancy'))).toBeNull();
    expect(localStorage.getItem(orgScopedKey('org-a', 'compass_meeting_draft'))).toBeNull();
  });

  it('clears sensitive data for EVERY org this browser has ever used, not just one — the shared/kiosk-device scenario', () => {
    lsSet(orgScopedKey('org-a', 'compass_cases'), [{ id: 'case-a' }]);
    lsSet(orgScopedKey('org-b', 'compass_wellbeing'), [{ employeeName: 'Other org employee' }]);
    clearAllOrgScopedData();
    expect(localStorage.getItem(orgScopedKey('org-a', 'compass_cases'))).toBeNull();
    expect(localStorage.getItem(orgScopedKey('org-b', 'compass_wellbeing'))).toBeNull();
  });

  it('clears legacy pre-org-scoping keys defensively, even though nothing writes them anymore', () => {
    localStorage.setItem('compass_user', '{"name":"Stale User"}');
    localStorage.setItem('compass_vault', '{}');
    clearAllOrgScopedData();
    expect(localStorage.getItem('compass_user')).toBeNull();
    expect(localStorage.getItem('compass_vault')).toBeNull();
  });

  it('does not touch unrelated, non-sensitive keys (e.g. compass_gdpr, an unscoped UI-acknowledgement flag)', () => {
    localStorage.setItem('compass_gdpr', 'true');
    localStorage.setItem('some_other_apps_key', 'unrelated');
    clearAllOrgScopedData();
    expect(localStorage.getItem('compass_gdpr')).toBe('true');
    expect(localStorage.getItem('some_other_apps_key')).toBe('unrelated');
  });
});
