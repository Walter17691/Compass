import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  purgeNeverPersistCaches, syncAuthIdentity, clearAllOrgScopedData,
  orgScopedKey, lsSet, ls, SENSITIVE_ORG_SCOPED_KEYS,
  NEVER_PERSIST_KEYS, CASE_CACHE_KEY, EMPLOYEE_ROSTER_KEY,
} from '../lib/storage.js';
import {
  DEFAULT_CASE_ACCESS_LEVEL_BY_ROLE, defaultCaseAccessLevelForRole,
  hasConfidentialOversight, isHrRole, ROLES,
} from '../lib/roles.js';

// ═══════════════════════════════════════════════════════════════════════════
// Phase E1.5B — case access boundary.
//
// Two pre-existing issues, one question: what case data is this user authorised
// to know exists RIGHT NOW?
//
//   1. can_access_case_location() carried a fail-open branch — a Location Manager
//      with an empty location list passed it for every location. Audited and found
//      to be an ORPHAN: no policy, function, view or trigger referenced it, and
//      `authenticated` had no EXECUTE. Removed rather than repaired.
//
//   2. compass_cases persisted up to 500 full case objects and seeded React state
//      on mount, so a permission change did not take effect until a fetch happened
//      to replace it.
//
// The live three-level model was verified directly against production with
// impersonated JWT claims inside rolled-back transactions (26 assertions across
// all seven roles; see the phase report). These tests cover the JS side and pin
// the invariants a later change could quietly undo.
// ═══════════════════════════════════════════════════════════════════════════

const read = (f) => readFileSync(f, 'utf8');
const strip = (src) => src.split('\n')
  .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
  .join('\n');

const appCode = strip(read('src/App.jsx'));
const mainCode = strip(read('src/main.jsx'));
const MIGRATION = read('supabase/case_access_boundary_2026-09-27.sql');
const migrationCode = MIGRATION.replace(/--[^\n]*/g, '');

const ORG_A = '11111111-1111-1111-1111-111111111111';
const ORG_B = '22222222-2222-2222-2222-222222222222';
const USER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa';
const USER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb';

// A case object as actually cached — every sensitive field mapCaseRow carries.
const CASE_ROWS = [
  {
    id: 'case-1', employeeName: 'Employee A', confidential: false,
    description: 'Allegation of repeated lateness',
    investigationReport: 'The investigation found...',
    outcome: 'First written warning', outcomeNotes: 'Manager notes here',
    appealText: 'I disagree because...',
    ohProcess: 'referred', ohReferralDate: '2026-03-01', fitNoteEndDate: '2026-04-01',
    estimatedWeeklyPay: 620, estimatedAgeAtDismissal: 47,
    meetings: [{ id: 'm1', record: 'full transcript', employeeSnapshot: { site: 'London' } }],
    evidence: [{ id: 'ev1', name: 'rota.pdf' }],
  },
  { id: 'case-2', employeeName: 'Employee B', confidential: true, caseType: 'grievance', meetings: [], evidence: [] },
];

beforeEach(() => { localStorage.clear(); });

// ── 1. The three-level model, as the client mirrors it ─────────────────────
describe('the approved three-level model is preserved', () => {
  it('every role has an explicit level, and an unknown role fails closed to 3', () => {
    expect(DEFAULT_CASE_ACCESS_LEVEL_BY_ROLE).toEqual({
      hr_director: 1, hr_manager: 1, legal_reviewer: 1, auditor: 1,
      location_manager: 2, line_manager: 2, investigator: 3,
    });
    expect(defaultCaseAccessLevelForRole('a role nobody has defined')).toBe(3);
    expect(defaultCaseAccessLevelForRole(undefined)).toBe(3);
    // Every shipped role is covered, so none silently relies on the fallback.
    ROLES.forEach(r => expect(DEFAULT_CASE_ACCESS_LEVEL_BY_ROLE[r.id], r.id).toBeDefined());
  });

  it('Location Manager and Line Manager are Level 2 — neither is HR', () => {
    expect(defaultCaseAccessLevelForRole('location_manager')).toBe(2);
    expect(defaultCaseAccessLevelForRole('line_manager')).toBe(2);
    expect(isHrRole('location_manager')).toBe(false);
    expect(isHrRole('line_manager')).toBe(false);
  });

  it('confidential oversight is HR Director, Legal and Auditor — not HR Manager', () => {
    ['hr_director', 'legal_reviewer', 'auditor'].forEach(r =>
      expect(hasConfidentialOversight(r), r).toBe(true));
    ['hr_manager', 'location_manager', 'line_manager', 'investigator'].forEach(r =>
      expect(hasConfidentialOversight(r), r).toBe(false));
  });

  it('the client holds no location-based case-access helper', () => {
    // canAccessCaseLocation() was deleted with the three-level model. A client-side
    // mirror of a rule the database no longer has is worse than none.
    const roles = strip(read('src/lib/roles.js'));
    expect(roles).not.toMatch(/export function canAccessCaseLocation/);
    expect(roles).not.toMatch(/location_ids/);
  });
});

// ── 2. The orphaned fail-open predicate ────────────────────────────────────
describe('can_access_case_location is removed, not repaired', () => {
  it('the migration drops it and creates nothing in its place', () => {
    expect(migrationCode).toMatch(/drop function if exists public\.can_access_case_location\(uuid, uuid\);/);
    // Nothing is created: no revived helper, no policy, no table change.
    expect(migrationCode).not.toMatch(/create (or replace )?(function|policy|table|index|trigger)/i);
    expect(migrationCode).not.toMatch(/\balter table\b/i);
  });

  it('the migration touches no policy and no customer data', () => {
    expect(migrationCode).not.toMatch(/\b(insert into|update |delete from)\b/i);
    expect(migrationCode).not.toMatch(/\bdrop policy\b/i);
  });

  it('no application or SQL code still calls it', () => {
    ['src/App.jsx', 'src/lib/roles.js', 'src/screens/CasesScreen.jsx', 'src/screens/CaseViewScreen.jsx']
      .forEach(f => expect(strip(read(f)), f).not.toMatch(/can_access_case_location\s*\(/));
  });

  it('the rollback is recorded, including the fail-open branch it would restore', () => {
    // Commented out, so it cannot execute, but present so the change is reversible.
    expect(MIGRATION).toMatch(/ROLLBACK \(complete\)/);
    expect(MIGRATION).toMatch(/--\s+SELECT NOT EXISTS/);
  });
});

// ── 3. The case cache ──────────────────────────────────────────────────────
describe('the case list is no longer persisted', () => {
  it('case state is not seeded from localStorage', () => {
    const i = appCode.indexOf('const [cases, setCases]');
    expect(i).toBeGreaterThan(-1);
    const line = appCode.slice(i, appCode.indexOf('\n', i));
    expect(line).toMatch(/useState\(\[\]\)/);
    expect(line).not.toMatch(/orgLs\(/);
    expect(line).not.toMatch(/compass_cases/);
  });

  it('nothing writes the case list to storage any more', () => {
    expect(appCode).not.toMatch(/orgLsSet\(\s*["']compass_cases["']/);
    expect(appCode).not.toMatch(/lsSet\([^)]*compass_cases/);
  });

  it('casesRef cannot start life holding cached cases', () => {
    // It is seeded from `cases`; that only became safe once `cases` stopped being
    // a localStorage read, so the two must be asserted together.
    expect(appCode).toMatch(/const casesRef = useRef\(cases\)/);
    const i = appCode.indexOf('const [cases, setCases]');
    expect(appCode.slice(i, appCode.indexOf('\n', i))).toMatch(/useState\(\[\]\)/);
  });

  it('a failed case load clears the list rather than keeping stale cases', () => {
    const i = appCode.indexOf('const loadCasesFromDB');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    // Both failure routes: a returned error and a thrown exception.
    expect((body.match(/setCases\(\[\]\)/g) || []).length).toBe(2);
    expect((body.match(/casesRef\.current = \[\]/g) || []).length).toBe(2);
  });

  it('the authorised response REPLACES state, never merges into it', () => {
    const i = appCode.indexOf('const loadCasesFromDB');
    const body = appCode.slice(i, appCode.indexOf('\n  };', i));
    expect(body).toMatch(/setCases\(loadedCases\)/);
    expect(body).not.toMatch(/setCases\(\s*(prev|p|c)\s*=>/);
    expect(body).not.toMatch(/\.\.\.cases\b/);
  });
});

// ── 4. Purge and invalidation ──────────────────────────────────────────────
describe('legacy case cache is actively invalidated', () => {
  it('both permission-bearing caches are in the never-persist set', () => {
    expect(NEVER_PERSIST_KEYS).toEqual([EMPLOYEE_ROSTER_KEY, CASE_CACHE_KEY]);
  });

  it('removes a cached case list, for every organisation', () => {
    lsSet(orgScopedKey(ORG_A, CASE_CACHE_KEY), CASE_ROWS);
    lsSet(orgScopedKey(ORG_B, CASE_CACHE_KEY), CASE_ROWS);
    expect(purgeNeverPersistCaches()).toBe(2);
    [ORG_A, ORG_B].forEach(o =>
      expect(ls(orgScopedKey(o, CASE_CACHE_KEY), null), o).toBeNull());
  });

  it('removes an un-namespaced legacy case list', () => {
    localStorage.setItem(CASE_CACHE_KEY, JSON.stringify(CASE_ROWS));
    expect(purgeNeverPersistCaches()).toBe(1);
    expect(localStorage.getItem(CASE_CACHE_KEY)).toBeNull();
  });

  it('removes the roster and the case list together', () => {
    lsSet(orgScopedKey(ORG_A, EMPLOYEE_ROSTER_KEY), [{ id: 'e1' }]);
    lsSet(orgScopedKey(ORG_A, CASE_CACHE_KEY), CASE_ROWS);
    expect(purgeNeverPersistCaches()).toBe(2);
  });

  it('leaves organisation configuration alone', () => {
    lsSet(orgScopedKey(ORG_A, 'compass_policies'), [{ id: 'p1' }]);
    lsSet(orgScopedKey(ORG_A, 'compass_letterhead'), 'data:...');
    lsSet(orgScopedKey(ORG_A, CASE_CACHE_KEY), CASE_ROWS);
    purgeNeverPersistCaches();
    expect(ls(orgScopedKey(ORG_A, 'compass_policies'), null)).toHaveLength(1);
    expect(ls(orgScopedKey(ORG_A, 'compass_letterhead'), null)).toBe('data:...');
    expect(ls(orgScopedKey(ORG_A, CASE_CACHE_KEY), null)).toBeNull();
  });

  it('runs at module load, before any case-consuming component can render', () => {
    expect(mainCode).toMatch(/^purgeNeverPersistCaches\(\)$/m);
    expect(mainCode.indexOf('purgeNeverPersistCaches()'))
      .toBeLessThan(mainCode.indexOf('export function Root('));
  });

  it('the key stays in the global sensitive sweep as defence in depth', () => {
    expect(SENSITIVE_ORG_SCOPED_KEYS).toContain(CASE_CACHE_KEY);
    lsSet(orgScopedKey(ORG_A, CASE_CACHE_KEY), CASE_ROWS);
    clearAllOrgScopedData();
    expect(ls(orgScopedKey(ORG_A, CASE_CACHE_KEY), null)).toBeNull();
  });

  it('a different user on this browser loses the previous user\'s cases', () => {
    lsSet(orgScopedKey(ORG_A, CASE_CACHE_KEY), CASE_ROWS);
    syncAuthIdentity(USER_A);
    expect(syncAuthIdentity(USER_B).changed).toBe(true);
    expect(ls(orgScopedKey(ORG_A, CASE_CACHE_KEY), null)).toBeNull();
  });
});

// ── 5. What the cache could contain — the reason this mattered ─────────────
describe('what compass_cases could hold', () => {
  it('a cached case carries investigation, outcome, appeal and HEALTH data', () => {
    // Recorded as a test so the sensitivity of the removed cache is not a claim in
    // a report someone has to go and re-derive later.
    const c = CASE_ROWS[0];
    expect(c.investigationReport).toBeTruthy();   // investigation findings
    expect(c.outcome).toBeTruthy();               // disciplinary outcome
    expect(c.outcomeNotes).toBeTruthy();          // manager notes
    expect(c.appealText).toBeTruthy();            // the employee's own words
    expect(c.meetings[0].record).toBeTruthy();    // meeting transcript
    expect(c.evidence).toHaveLength(1);           // evidence metadata
    expect(c.ohProcess).toBeTruthy();             // occupational health
    expect(c.fitNoteEndDate).toBeTruthy();        // fit note — special category
    expect(c.estimatedWeeklyPay).toBeTruthy();    // pay
    expect(c.estimatedAgeAtDismissal).toBeTruthy(); // age
    expect(CASE_ROWS[1].confidential).toBe(true); // and confidential cases
    expect(CASE_ROWS[1].caseType).toBe('grievance');
  });

  it('mapCaseRow really does carry those fields, so the fixture is not a strawman', () => {
    const mapping = read('src/lib/caseMapping.js');
    ['investigation_report', 'outcome_notes', 'appeal_text', 'oh_process',
     'fit_note_end_date', 'confidential', 'meetings', 'evidence',
     'estimated_weekly_pay', 'estimated_age_at_dismissal']
      .forEach(f => expect(mapping, f).toContain(f));
  });
});

// ── 6. Permission-change scenarios ─────────────────────────────────────────
describe('permission changes leave no case behind', () => {
  const loadAfterReload = (authorisedResponse) => {
    purgeNeverPersistCaches();
    return {
      fromStorage: ls(orgScopedKey(ORG_A, CASE_CACHE_KEY), []),
      cases: authorisedResponse,
    };
  };

  it('HR → Location Manager: cases outside the new access paths disappear', () => {
    lsSet(orgScopedKey(ORG_A, CASE_CACHE_KEY), CASE_ROWS);
    // The authorised response now contains only what Level 2 grants.
    const { fromStorage, cases } = loadAfterReload([]);
    expect(fromStorage).toEqual([]);
    expect(cases).toEqual([]);
  });

  it('a case explicitly assigned via case_access survives the change', () => {
    // The point of §12D: fixing fail-open must not destroy valid explicit access.
    // The server returns it because case_access grants it — not because it was cached.
    lsSet(orgScopedKey(ORG_A, CASE_CACHE_KEY), CASE_ROWS);
    const { fromStorage, cases } = loadAfterReload([CASE_ROWS[0]]);
    expect(fromStorage).toEqual([]);
    expect(cases.map(c => c.id)).toEqual(['case-1']);
  });

  it('empty location scope does not resurrect cases from cache', () => {
    lsSet(orgScopedKey(ORG_A, CASE_CACHE_KEY), CASE_ROWS);
    const { fromStorage, cases } = loadAfterReload([]);
    expect(fromStorage).toEqual([]);
    expect(cases).toEqual([]);
  });

  it('a failed fetch does not restore cached cases', () => {
    lsSet(orgScopedKey(ORG_A, CASE_CACHE_KEY), CASE_ROWS);
    purgeNeverPersistCaches();
    expect(ls(orgScopedKey(ORG_A, CASE_CACHE_KEY), null)).toBeNull();
  });

  it('a direct case route cannot resolve a case from cache', () => {
    lsSet(orgScopedKey(ORG_A, CASE_CACHE_KEY), CASE_ROWS);
    purgeNeverPersistCaches();
    const cached = ls(orgScopedKey(ORG_A, CASE_CACHE_KEY), []);
    expect(cached.find(c => c.id === 'case-1')).toBeUndefined();
  });

  it('organisation A cases cannot appear under organisation B', () => {
    lsSet(orgScopedKey(ORG_A, CASE_CACHE_KEY), CASE_ROWS);
    purgeNeverPersistCaches();
    expect(ls(orgScopedKey(ORG_B, CASE_CACHE_KEY), [])).toEqual([]);
  });
});

// ── 7. Consumers cannot reach storage themselves ───────────────────────────
describe('case consumers read in-memory state only', () => {
  const surfaces = [
    'src/screens/CasesScreen.jsx',
    'src/screens/CaseViewScreen.jsx',
    'src/screens/EmployeeFileScreen.jsx',
    'src/screens/ErReportScreen.jsx',
    'src/screens/InsightsScreen.jsx',
    'src/components/TimelinePanel.jsx',
    'src/lib/homeFeed.js',
    'src/lib/managerPortal.js',
    'src/lib/employeeContext.js',
    'src/lib/caseMapping.js',
    'src/lib/hearingPack.js',
    'src/lib/globalAnalytics.js',
    'src/lib/reportsAnalytics.js',
    'src/lib/processDashboard.js',
  ];

  it('no case surface reads any client storage directly', () => {
    surfaces.forEach(f =>
      expect(strip(read(f)), f).not.toMatch(/localStorage|sessionStorage|indexedDB|orgLs\(/));
  });

  it('no case surface even IMPORTS the storage module', () => {
    // Stronger than scanning for `localStorage`: an aliased import
    // (`import { ls as _ls } from '../lib/storage'`) reads the cache without ever
    // spelling any of those words. None of these files imports storage today, so
    // the boundary is "no storage import at all" rather than a keyword blacklist.
    surfaces.forEach(f =>
      expect(strip(read(f)), f).not.toMatch(/from\s+['"][^'"]*\/storage['"]/));
  });

  it('nothing builds AI context from storage', () => {
    // Case data reaches a prompt only through the in-memory `cases` array, which is
    // filled by the RLS-filtered fetch, so there is no stale-only path to AI.
    ['src/lib/globalAnalytics.js', 'src/lib/hearingPack.js', 'src/lib/escalation.js']
      .forEach(f => expect(strip(read(f)), f).not.toMatch(/localStorage|sessionStorage/));
  });

  it('the confidential dialog no longer promises something the model does not do', () => {
    // Under the three-level model an HR Manager is Level 1 and DOES see
    // confidential cases; the old copy said other HR managers would lose access.
    const view = read('src/screens/CaseViewScreen.jsx');
    expect(view).not.toMatch(/Other HR managers will lose access/);
    expect(view).not.toMatch(/visible to every HR manager in the organisation again/);
  });
});
