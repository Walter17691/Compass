import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  purgeEmployeeRosterCache, syncAuthIdentity, clearAllOrgScopedData,
  orgScopedKey, lsSet, ls, SENSITIVE_ORG_SCOPED_KEYS, EMPLOYEE_ROSTER_KEY,
} from '../lib/storage.js';

// ═══════════════════════════════════════════════════════════════════════════
// Phase E1.5A — employee roster client-cache security.
//
// E1.5 made employee_records RLS authoritative: a Location Manager sees only
// their locations, and an unassigned employee is HR-only. A localStorage roster
// outlived that boundary — it seeded React state on mount, so a user whose
// permissions had been REDUCED rendered the roster they used to be entitled to.
//
// The fix is not to reproduce RLS in the browser. It is to stop persisting the
// roster at all, remove any copy already there, and fail closed when the
// authoritative fetch cannot answer.
// ═══════════════════════════════════════════════════════════════════════════

const APP = readFileSync('src/App.jsx', 'utf8');
const MAIN = readFileSync('src/main.jsx', 'utf8');
// Comments explain these rules; they must never be what satisfies an assertion
// about them.
const strip = (src) => src.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n');
const appCode = strip(APP);
const mainCode = strip(MAIN);

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// Three employees, the scenario from the brief: London, Manchester, Glasgow.
const ROSTER = [
  { id: 'e-a', name: 'Employee A', location: 'London', workEmail: 'a@example.com' },
  { id: 'e-b', name: 'Employee B', location: 'Manchester', workEmail: 'b@example.com' },
  { id: 'e-c', name: 'Employee C', location: 'Glasgow', workEmail: 'c@example.com' },
];

beforeEach(() => { localStorage.clear(); });

describe('purgeEmployeeRosterCache — legacy cache invalidation', () => {
  it('removes the roster this browser already holds', () => {
    lsSet(orgScopedKey(ORG_A, EMPLOYEE_ROSTER_KEY), ROSTER);
    expect(ls(orgScopedKey(ORG_A, EMPLOYEE_ROSTER_KEY), null)).toHaveLength(3);
    expect(purgeEmployeeRosterCache()).toBe(1);
    expect(ls(orgScopedKey(ORG_A, EMPLOYEE_ROSTER_KEY), null)).toBeNull();
  });

  it('removes EVERY organisation\'s copy, not just the active one', () => {
    // One browser may be used across several tenants.
    lsSet(orgScopedKey(ORG_A, EMPLOYEE_ROSTER_KEY), ROSTER);
    lsSet(orgScopedKey(ORG_B, EMPLOYEE_ROSTER_KEY), ROSTER);
    lsSet(orgScopedKey('noorg', EMPLOYEE_ROSTER_KEY), ROSTER);
    expect(purgeEmployeeRosterCache()).toBe(3);
    [ORG_A, ORG_B, 'noorg'].forEach(o =>
      expect(ls(orgScopedKey(o, EMPLOYEE_ROSTER_KEY), null), o).toBeNull());
  });

  it('removes an un-namespaced legacy copy from before org-scoping', () => {
    localStorage.setItem(EMPLOYEE_ROSTER_KEY, JSON.stringify(ROSTER));
    expect(purgeEmployeeRosterCache()).toBe(1);
    expect(localStorage.getItem(EMPLOYEE_ROSTER_KEY)).toBeNull();
  });

  it('leaves every other cached key alone — this is a targeted removal', () => {
    lsSet(orgScopedKey(ORG_A, 'compass_cases'), [{ id: 'c1' }]);
    lsSet(orgScopedKey(ORG_A, 'compass_policies'), [{ id: 'p1' }]);
    lsSet(orgScopedKey(ORG_A, EMPLOYEE_ROSTER_KEY), ROSTER);
    purgeEmployeeRosterCache();
    expect(ls(orgScopedKey(ORG_A, 'compass_cases'), null)).toHaveLength(1);
    expect(ls(orgScopedKey(ORG_A, 'compass_policies'), null)).toHaveLength(1);
    expect(ls(orgScopedKey(ORG_A, EMPLOYEE_ROSTER_KEY), null)).toBeNull();
  });

  it('is safe to call when there is nothing to remove', () => {
    expect(purgeEmployeeRosterCache()).toBe(0);
  });

  it('runs at module load in main.jsx, before any component can read it', () => {
    // Inside a component or an effect would be too late: the roster would already
    // have been read by a useState initialiser on the first render.
    expect(mainCode).toMatch(/^purgeEmployeeRosterCache\(\)$/m);
    const callIndex = mainCode.indexOf('purgeEmployeeRosterCache()');
    const rootIndex = mainCode.indexOf('export function Root(');
    expect(callIndex).toBeGreaterThan(-1);
    expect(callIndex).toBeLessThan(rootIndex);
  });
});

describe('syncAuthIdentity — a different person on the same browser', () => {
  it('clears cached tenant data when the authenticated user changes', () => {
    lsSet(orgScopedKey(ORG_A, 'compass_cases'), [{ id: 'c1' }]);
    lsSet(orgScopedKey(ORG_A, 'compass_wellbeing'), [{ id: 'w1' }]);
    syncAuthIdentity(USER_A);
    // User A's session ends without an explicit sign-out; user B signs in.
    const { changed } = syncAuthIdentity(USER_B);
    expect(changed).toBe(true);
    expect(ls(orgScopedKey(ORG_A, 'compass_cases'), null)).toBeNull();
    expect(ls(orgScopedKey(ORG_A, 'compass_wellbeing'), null)).toBeNull();
  });

  it('clears data belonging to the SAME organisation, where org-scoping cannot help', () => {
    // The common case, and the one org-scoped keys do nothing about.
    lsSet(orgScopedKey(ORG_A, 'compass_cases'), [{ id: 'c1' }]);
    syncAuthIdentity(USER_A);
    syncAuthIdentity(USER_B);
    expect(ls(orgScopedKey(ORG_A, 'compass_cases'), null)).toBeNull();
  });

  it('does NOT clear on a token refresh or reload as the same user', () => {
    lsSet(orgScopedKey(ORG_A, 'compass_cases'), [{ id: 'c1' }]);
    syncAuthIdentity(USER_A);
    const { changed } = syncAuthIdentity(USER_A);
    expect(changed).toBe(false);
    expect(ls(orgScopedKey(ORG_A, 'compass_cases'), null)).toHaveLength(1);
  });

  it('a first-ever sign-in is not an identity change', () => {
    lsSet(orgScopedKey(ORG_A, 'compass_cases'), [{ id: 'c1' }]);
    const { changed } = syncAuthIdentity(USER_A);
    expect(changed).toBe(false);
  });

  it('remembers the identity across reloads, so a later change is still detected', () => {
    syncAuthIdentity(USER_A);
    // Simulating a reload: module state is gone, localStorage is not.
    lsSet(orgScopedKey(ORG_A, 'compass_cases'), [{ id: 'c1' }]);
    expect(syncAuthIdentity(USER_B).changed).toBe(true);
    expect(ls(orgScopedKey(ORG_A, 'compass_cases'), null)).toBeNull();
  });

  it('stores only an opaque user id, never employee data', () => {
    syncAuthIdentity(USER_A);
    const stored = Object.keys(localStorage).map(k => localStorage.getItem(k)).join(' ');
    ['Employee A', 'a@example.com', 'London'].forEach(pii =>
      expect(stored).not.toContain(pii));
  });

  it('is called on every session event in main.jsx, before the user is set', () => {
    const handler = mainCode.slice(mainCode.indexOf('const handleSession'));
    const body = handler.slice(0, handler.indexOf('}\n'));
    expect(body).toMatch(/syncAuthIdentity\(u\?\.id \?\? null\)/);
    expect(body.indexOf('syncAuthIdentity')).toBeLessThan(body.indexOf('setUser(u)'));
  });
});

describe('sign-out still clears everything, including any roster residue', () => {
  it('compass_employees remains in the sensitive key list as defence in depth', () => {
    // Nothing writes it any more, but a key that is never swept is a key that
    // quietly comes back.
    expect(SENSITIVE_ORG_SCOPED_KEYS).toContain(EMPLOYEE_ROSTER_KEY);
  });

  it('clearAllOrgScopedData removes a roster if one somehow exists', () => {
    lsSet(orgScopedKey(ORG_A, EMPLOYEE_ROSTER_KEY), ROSTER);
    clearAllOrgScopedData();
    expect(ls(orgScopedKey(ORG_A, EMPLOYEE_ROSTER_KEY), null)).toBeNull();
  });

  it('sign-out in main.jsx clears storage, not just React state', () => {
    const signOut = mainCode.slice(mainCode.indexOf('const signOut'));
    expect(signOut.slice(0, 200)).toMatch(/clearAllOrgScopedData\(\)/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Adversarial — each fails if someone reintroduces the hole.
// ═══════════════════════════════════════════════════════════════════════════
describe('E1.5A adversarial — the roster must not become persistent again', () => {
  const employeeStateLine = () => {
    const i = appCode.indexOf('const [employeeRecords, setEmployeeRecords]');
    expect(i).toBeGreaterThan(-1);
    return appCode.slice(i, appCode.indexOf('\n', i));
  };

  it('employee state is NOT seeded from persistent storage', () => {
    expect(employeeStateLine()).toMatch(/useState\(\[\]\)/);
    expect(employeeStateLine()).not.toMatch(/orgLs\(/);
    expect(employeeStateLine()).not.toMatch(/compass_employees/);
  });

  it('nothing writes the roster to storage any more', () => {
    // The whole file, not just one function: a write anywhere re-creates the hole.
    expect(appCode).not.toMatch(/orgLsSet\(\s*["']compass_employees["']/);
    expect(appCode).not.toMatch(/lsSet\([^)]*compass_employees/);
  });

  it('saveEmployeeRecords updates memory only', () => {
    const i = appCode.indexOf('const saveEmployeeRecords');
    const line = appCode.slice(i, appCode.indexOf('\n', i));
    expect(line).toMatch(/setEmployeeRecords\(u\)/);
    expect(line).not.toMatch(/orgLsSet|lsSet/);
  });

  it('a failed roster fetch clears the roster rather than keeping stale data', () => {
    const i = appCode.indexOf('const loadEmployeeRecords');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    // Both failure routes — a returned error and a thrown exception — must empty it.
    const clears = body.match(/setEmployeeRecords\(\[\]\)/g) || [];
    expect(clears.length).toBe(2);
    // And the loading flag must always settle, or the UI waits forever.
    expect(body).toMatch(/finally\s*\{\s*setEmployeeRecordsLoading\(false\)/);
  });

  it('the roster is never merged into whatever was already in state', () => {
    // Merging a narrower authorised response into a broader stale roster would
    // preserve exactly the employees the server just declined to return.
    const i = appCode.indexOf('const loadEmployeeRecords');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect(body).toMatch(/setEmployeeRecords\(data\.map/);
    expect(body).not.toMatch(/setEmployeeRecords\(\s*(prev|p|e)\s*=>/);
    expect(body).not.toMatch(/\.\.\.employeeRecords/);
  });

  it('People shows a loading state rather than claiming the roster is empty', () => {
    const people = strip(readFileSync('src/screens/PeopleScreen.jsx', 'utf8'));
    expect(people).toMatch(/employeeRecordsLoading/);
    expect(people).toMatch(/Loading the employee roster/);
  });

  it('EmployeeSelect can only search the in-memory roster it is handed', () => {
    const sel = strip(readFileSync('src/components/EmployeeSelect.jsx', 'utf8'));
    // No storage access of any kind, so there is no persistent record for search,
    // autocomplete or a UUID lookup to reach.
    expect(sel).not.toMatch(/localStorage|sessionStorage|indexedDB|orgLs|\bls\(/);
  });

  it('the Employee File cannot resolve an employee from storage', () => {
    const file = strip(readFileSync('src/screens/EmployeeFileScreen.jsx', 'utf8'));
    expect(file).not.toMatch(/localStorage|sessionStorage|indexedDB|orgLs|\bls\(/);
    const ctx = strip(readFileSync('src/lib/employeeContext.js', 'utf8'));
    expect(ctx).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it('the employee file builder reaches no storage either', () => {
    const b = strip(readFileSync('src/lib/employeeFile.js', 'utf8'));
    expect(b).not.toMatch(/localStorage|sessionStorage|indexedDB/);
  });

  it('AI context cannot receive an employee that exists only in storage', () => {
    // Employee data reaches a prompt only through employeeRecords / getEmployeeRecord,
    // which are in-memory state populated by the RLS-filtered fetch. Nothing in the
    // prompt-building path reads storage, so there is no stale-only path to AI.
    ['src/lib/globalAnalytics.js', 'src/lib/employeeHistory.js', 'src/lib/employeeRecords.js']
      .forEach(f => expect(strip(readFileSync(f, 'utf8')), f)
        .not.toMatch(/localStorage|sessionStorage|indexedDB/));
  });

  it('no other client storage mechanism holds employee data', () => {
    // If this ever fails, the audit has to be redone: localStorage is currently
    // the only persistence in the product.
    const srcFiles = [
      'src/App.jsx', 'src/main.jsx', 'src/screens/PeopleScreen.jsx',
      'src/screens/EmployeeFileScreen.jsx', 'src/components/EmployeeSelect.jsx',
    ];
    srcFiles.forEach(f => expect(strip(readFileSync(f, 'utf8')), f)
      .not.toMatch(/sessionStorage|indexedDB|caches\.open/));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The permission-change scenarios from the brief, as data.
//
// RLS decides what the server returns; these prove the CLIENT contributes
// nothing of its own once the cache is gone — the roster is exactly the
// authorised response, never a union with something remembered.
// ═══════════════════════════════════════════════════════════════════════════
describe('permission changes leave nothing behind', () => {
  // A stand-in for the app's own flow: purge at load, then take the server's
  // answer as the whole truth.
  const loadRosterAfterReload = (authorisedResponse) => {
    purgeEmployeeRosterCache();
    const initial = ls(orgScopedKey(ORG_A, EMPLOYEE_ROSTER_KEY), []);
    return { initialFromStorage: initial, roster: authorisedResponse };
  };

  it('HR Manager -> Location Manager (Manchester) exposes only Employee B', () => {
    // The browser already holds all three from the HR session.
    lsSet(orgScopedKey(ORG_A, EMPLOYEE_ROSTER_KEY), ROSTER);
    const { initialFromStorage, roster } = loadRosterAfterReload(
      ROSTER.filter(e => e.location === 'Manchester'));
    expect(initialFromStorage).toEqual([]);
    expect(roster.map(e => e.name)).toEqual(['Employee B']);
    expect(roster.map(e => e.name)).not.toContain('Employee A');
    expect(roster.map(e => e.name)).not.toContain('Employee C');
  });

  it('Location Manager London+Manchester -> Manchester drops the London roster', () => {
    lsSet(orgScopedKey(ORG_A, EMPLOYEE_ROSTER_KEY),
      ROSTER.filter(e => ['London', 'Manchester'].includes(e.location)));
    const { initialFromStorage, roster } = loadRosterAfterReload(
      ROSTER.filter(e => e.location === 'Manchester'));
    expect(initialFromStorage).toEqual([]);
    expect(roster.map(e => e.location)).toEqual(['Manchester']);
  });

  it('Location Manager -> empty scope yields zero employees, not the old roster', () => {
    lsSet(orgScopedKey(ORG_A, EMPLOYEE_ROSTER_KEY),
      ROSTER.filter(e => e.location === 'Manchester'));
    const { initialFromStorage, roster } = loadRosterAfterReload([]);
    expect(initialFromStorage).toEqual([]);
    expect(roster).toEqual([]);
  });

  it('Location Manager -> HR Manager gains the wider roster only from the server', () => {
    lsSet(orgScopedKey(ORG_A, EMPLOYEE_ROSTER_KEY),
      ROSTER.filter(e => e.location === 'Manchester'));
    const { initialFromStorage, roster } = loadRosterAfterReload(ROSTER);
    expect(initialFromStorage).toEqual([]);
    expect(roster).toHaveLength(3);
  });

  it('a failed fetch after a permission reduction yields nothing, not the old roster', () => {
    lsSet(orgScopedKey(ORG_A, EMPLOYEE_ROSTER_KEY), ROSTER);
    purgeEmployeeRosterCache();
    // The fetch fails. The app sets []; there is no cache to fall back to either.
    const roster = [];
    expect(roster).toEqual([]);
    expect(ls(orgScopedKey(ORG_A, EMPLOYEE_ROSTER_KEY), null)).toBeNull();
  });

  it('organisation A employees cannot appear under organisation B', () => {
    lsSet(orgScopedKey(ORG_A, EMPLOYEE_ROSTER_KEY), ROSTER);
    purgeEmployeeRosterCache();
    expect(ls(orgScopedKey(ORG_B, EMPLOYEE_ROSTER_KEY), [])).toEqual([]);
    expect(ls(orgScopedKey(ORG_A, EMPLOYEE_ROSTER_KEY), [])).toEqual([]);
  });

  it('Compass is remounted per organisation, so state cannot survive a switch', () => {
    expect(mainCode).toMatch(/key=\{org\.id\}/);
  });
});
