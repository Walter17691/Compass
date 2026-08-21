import { describe, it, expect, beforeEach } from 'vitest';
import { ls, lsSet, orgScopedKey } from '../lib/storage.js';

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
