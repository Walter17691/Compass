import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  EMPLOYMENT_STATUSES, IDENTITY,
  findEmployeeById, findEmployeeByName, employeesSharingDisplayName,
  findPossibleDuplicates, classifyIdentityByName, identityRequiresReconciliation,
} from '../lib/employeeRecords.js';
import { compileSubjectData } from '../lib/dsarCompile.js';
import { ORG_SCOPED_TABLES } from '../lib/dataInventory.js';

// Phase E0 — employee identity foundation.
//
// The canonical-table decision was to EVOLVE public.employee_records rather than
// create a second employees table, because a second table would leave Compass
// with two permanent sources of employee truth. These tests hold the identity
// principle: `id` is identity, everything else is a label.
//
// UNIQUE(org_id, name) is still in place, so duplicate names cannot yet exist in
// production. These tests therefore prove the TARGET model is safe — that the
// primitives behave correctly the moment the constraint is removed — which is
// exactly what the phase that removes it will need.

const sql = readFileSync('supabase/employee_identity_foundation_2026-09-26.sql', 'utf8');
const sqlCode = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
const app = readFileSync('src/App.jsx', 'utf8');

// Two genuinely different people who share a display name — the situation the
// whole phase exists to make safe.
const JOHN_A = { id: 'emp-aaaa', name: 'John Smith', employeeNumber: '1042', workEmail: 'j.smith@x.test', location: 'Manchester', employmentStatus: 'active' };
const JOHN_B = { id: 'emp-bbbb', name: 'John Smith', employeeNumber: '2841', workEmail: 'john.smith@x.test', location: 'Leeds', employmentStatus: 'active' };
const DANA   = { id: 'emp-cccc', name: 'Dana Keys', employeeNumber: '3300', workEmail: 'd.keys@x.test', location: 'Leeds', employmentStatus: 'leaver' };

// ═══════════════════════════════════════════════════════════════════════════
describe('1-3. two employees may share a name, and are never confused', () => {
  it('1. both can be represented in the target model', () => {
    const records = [JOHN_A, JOHN_B, DANA];
    expect(employeesSharingDisplayName(records, 'John Smith')).toHaveLength(2);
    // Nothing in the primitives rejects, dedupes or merges them.
    expect(records.filter(r => r.name === 'John Smith')).toHaveLength(2);
  });

  it('2. their ids remain distinct, and identity resolves by id alone', () => {
    const records = [JOHN_A, JOHN_B];
    expect(JOHN_A.id).not.toBe(JOHN_B.id);
    expect(findEmployeeById(records, 'emp-aaaa')).toBe(JOHN_A);
    expect(findEmployeeById(records, 'emp-bbbb')).toBe(JOHN_B);
    // Same name, different location — the id decides, not the label.
    expect(findEmployeeById(records, 'emp-aaaa').location).toBe('Manchester');
    expect(findEmployeeById(records, 'emp-bbbb').location).toBe('Leeds');
  });

  it('3. no ID-based helper returns one because the other shares a name', () => {
    const records = [JOHN_A, JOHN_B, DANA];
    // The decisive assertion: an id lookup must never fall back to a name.
    expect(findEmployeeById(records, 'John Smith')).toBeNull();
    expect(findEmployeeById(records, 'emp-zzzz')).toBeNull();
    expect(findEmployeeById(records, '')).toBeNull();
    expect(findEmployeeById(records, null)).toBeNull();
    expect(findEmployeeById(records, undefined)).toBeNull();
  });

  it('the LEGACY name lookup is honest about what it is', () => {
    const records = [JOHN_A, JOHN_B];
    // It returns the first match. That is why it is not identity, and why it is
    // labelled legacy rather than quietly kept.
    expect(findEmployeeByName(records, 'John Smith')).toBe(JOHN_A);
    expect(findEmployeeByName(records, '')).toBeNull();      // blank-name guard retained
    expect(findEmployeeByName(records, null)).toBeNull();
    const lib = readFileSync('src/lib/employeeRecords.js', 'utf8');
    expect(lib).toContain('LEGACY');
    expect(lib).toContain('It is NOT an identity function');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('duplicate detection is for humans, and never merges', () => {
  const records = [JOHN_A, JOHN_B, DANA];

  it('surfaces candidates with the reason each matched', () => {
    const byNumber = findPossibleDuplicates(records, { employeeNumber: '1042' });
    expect(byNumber).toEqual([{ employee: JOHN_A, reason: 'employee_number' }]);
    const byEmail = findPossibleDuplicates(records, { workEmail: 'D.KEYS@X.TEST' });
    expect(byEmail).toEqual([{ employee: DANA, reason: 'work_email' }]);
    const byName = findPossibleDuplicates(records, { name: 'john smith' });
    expect(byName.map(c => c.employee.id)).toEqual(['emp-aaaa', 'emp-bbbb']);
    expect(byName.every(c => c.reason === 'display_name')).toBe(true);
  });

  it('a stronger signal wins the reason, and nobody appears twice', () => {
    const found = findPossibleDuplicates(records, { name: 'John Smith', employeeNumber: '2841' });
    expect(found.filter(c => c.employee.id === 'emp-bbbb')).toHaveLength(1);
    expect(found.find(c => c.employee.id === 'emp-bbbb').reason).toBe('employee_number');
  });

  it('returns candidates, never a decision — and never merges', () => {
    const found = findPossibleDuplicates(records, { name: 'John Smith' });
    // A list of suggestions, each still a separate employee with its own id.
    expect(found).toHaveLength(2);
    expect(new Set(found.map(c => c.employee.id)).size).toBe(2);
    const lib = readFileSync('src/lib/employeeRecords.js', 'utf8').split('\n')
      .filter(l => !l.trim().startsWith('//')).join('\n');
    // No merge/link/assign machinery exists in the module at all.
    ['merge', 'link(', 'assignIdentity', 'dedupe'].forEach(f => expect(lib, f).not.toContain(f));
  });

  it('excludes the record being edited, and finds nothing from nothing', () => {
    expect(findPossibleDuplicates(records, { name: 'John Smith', excludeId: 'emp-aaaa' }).map(c => c.employee.id))
      .toEqual(['emp-bbbb']);
    expect(findPossibleDuplicates(records, {})).toEqual([]);
    expect(findPossibleDuplicates(null, { name: 'John Smith' })).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('12/13. the DSAR identity gate', () => {
  const base = { employeeRecords: [JOHN_A, JOHN_B, DANA] };

  it('12. cannot silently combine two same-named canonical employees', () => {
    const out = compileSubjectData('John Smith', base);
    expect(out.identityStatus).toBe(IDENTITY.AMBIGUOUS);
    expect(out.identityRequiresReconciliation).toBe(true);
    // Both ids are reported, so a human can see exactly what the ambiguity is.
    expect(out.canonicalEmployeeIds.sort()).toEqual(['emp-aaaa', 'emp-bbbb']);
  });

  it('12. the export is BLOCKED, not merely annotated', () => {
    const screen = readFileSync('src/screens/DsarScreen.jsx', 'utf8');
    // The download button is conditional on identity being resolvable.
    expect(screen).toContain('compiled&&!compiled.identityRequiresReconciliation&&<Btn');
    expect(screen).toContain('Download blocked — employee identity requires reconciliation');
    // And the previous shape — an unconditional download — is gone.
    expect(screen).not.toContain('{compiled&&<Btn variant="secondary" onClick={()=>{downloadJson(');
  });

  it('a single canonical employee resolves and is not blocked', () => {
    const out = compileSubjectData('Dana Keys', base);
    expect(out.identityStatus).toBe(IDENTITY.RESOLVED);
    expect(out.identityRequiresReconciliation).toBe(false);
    expect(out.canonicalEmployeeIds).toEqual(['emp-cccc']);
  });

  it('13. legacy name-only data is UNRECONCILED and now FAILS CLOSED (E0.5A)', () => {
    // TIGHTENED IN E0.5A. E0 let this through with a warning, reasoning that 650 of
    // 2,939 production subjects are name-only. That traded a privacy guarantee for
    // convenience. If Compass cannot establish which canonical employee owns a set
    // of name-matched records, it must not disclose them.
    const out = compileSubjectData('Someone With No Record', base);
    expect(out.identityStatus).toBe(IDENTITY.UNRECONCILED);
    expect(out.identityRequiresReconciliation).toBe(true);
    expect(out.canonicalEmployeeIds).toEqual([]);
    const screen = readFileSync('src/screens/DsarScreen.jsx', 'utf8');
    expect(screen).toContain('Employee identity requires reconciliation');
    // The copy must not imply data is missing — it is all there; the LINK is not.
    expect(screen).toContain('Nothing is missing and nothing has been removed');
  });

  it('13b. ONLY resolved identity permits an export', () => {
    const records = [JOHN_A, JOHN_B, DANA];
    // resolved -> allowed
    expect(identityRequiresReconciliation(records, 'Dana Keys')).toBe(false);
    // ambiguous -> blocked
    expect(identityRequiresReconciliation(records, 'John Smith')).toBe(true);
    // unreconciled -> blocked
    expect(identityRequiresReconciliation(records, 'Nobody At All')).toBe(true);
    expect(identityRequiresReconciliation([], 'Anyone')).toBe(true);
  });

  it('13. conflicting email evidence reads as ambiguous even with one record', () => {
    // The old detector depended on this alone and was inert because 0 of 2,960
    // production cases carry an email. It still contributes, but is no longer the
    // only signal.
    const out = compileSubjectData('Dana Keys', {
      ...base,
      cases: [
        { id: 'c1', employeeName: 'Dana Keys', employeeEmail: 'd.keys@x.test', meetings: [] },
        { id: 'c2', employeeName: 'Dana Keys', employeeEmail: 'other.person@x.test', meetings: [] },
      ],
    });
    expect(out.identityStatus).toBe(IDENTITY.AMBIGUOUS);
    expect(out.identityRequiresReconciliation).toBe(true);
  });

  it('the dead condition is documented as dead, so it is not trusted again', () => {
    const lib = readFileSync('src/lib/dsarCompile.js', 'utf8');
    expect(lib).toContain('was inert in production');
    expect(lib).toContain('UNIQUE(org_id, name)');
    expect(lib).toContain('advisory only');
  });

  it('the gate classifies correctly in isolation', () => {
    expect(classifyIdentityByName([JOHN_A, JOHN_B], 'John Smith')).toBe(IDENTITY.AMBIGUOUS);
    expect(classifyIdentityByName([DANA], 'Dana Keys')).toBe(IDENTITY.RESOLVED);
    expect(classifyIdentityByName([], 'Nobody')).toBe(IDENTITY.UNRECONCILED);
    expect(identityRequiresReconciliation([JOHN_A, JOHN_B], 'John Smith')).toBe(true);
    expect(identityRequiresReconciliation([DANA], 'Dana Keys')).toBe(false);
    // Case and whitespace must not create a false "resolved".
    expect(classifyIdentityByName([JOHN_A, { ...JOHN_B, name: '  john smith ' }], 'John Smith'))
      .toBe(IDENTITY.AMBIGUOUS);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the schema change', () => {
  it('EVOLVES employee_records and creates no second employee table', () => {
    expect(sqlCode).toContain('alter table public.employee_records');
    expect(sqlCode).not.toMatch(/create table public\.employees\b/);
    expect(sql).toContain('this table EVOLVES');
  });

  it('RETAINS UNIQUE(org_id, name) — the constraint is not dropped here', () => {
    expect(sqlCode).not.toMatch(/drop constraint .*employee_records_org_id_name_key/i);
    expect(sqlCode).not.toMatch(/drop index .*employee_records_org_id_name_key/i);
    expect(sql).toContain('It does NOT drop UNIQUE (org_id, name)');
  });

  it('adds the identity and employment-period columns', () => {
    ['work_email text', 'employment_status text not null default \'unknown\'',
      'end_date text', 'created_at timestamptz not null default now()', 'created_by uuid',
    ].forEach(frag => expect(sqlCode).toContain(frag));
  });

  it('the status vocabulary matches the database CHECK exactly', () => {
    expect(EMPLOYMENT_STATUSES).toEqual(['active', 'leaver', 'unknown']);
    expect(sqlCode).toContain("check (employment_status in ('active', 'leaver', 'unknown'))");
    EMPLOYMENT_STATUSES.forEach(v => expect(sqlCode).toContain(`'${v}'`));
  });

  it("defaults to 'unknown' rather than inventing 'active' about real people", () => {
    expect(sqlCode).toContain("default 'unknown'");
    expect(sqlCode).not.toContain("default 'active'");
  });

  it('the duplicate-detection indexes are deliberately NOT unique', () => {
    expect(sqlCode).toContain('create index if not exists employee_records_org_number_idx');
    expect(sqlCode).toContain('create index if not exists employee_records_org_email_idx');
    // Making either unique would repeat the very mistake being corrected.
    expect(sqlCode).not.toMatch(/create unique index if not exists employee_records_org_(number|email)_idx/);
  });

  it('changes no RLS policy and touches no other table', () => {
    expect(sqlCode).not.toMatch(/create policy|drop policy|alter policy/i);
    ['public.cases', 'public.meetings', 'cases.meetings', 'documents']
      .forEach(t => expect(sqlCode, t).not.toContain(t));
  });

  it('performs no identity backfill', () => {
    // The ONE update is a status normalisation on the employee row itself.
    const updates = sqlCode.match(/update public\.\w+/g) || [];
    expect(updates).toEqual(['update public.employee_records']);
    expect(sqlCode).toContain("set employment_status = 'active'");
    expect(sqlCode).not.toMatch(/employee_id/);
  });

  it('documents a complete rollback', () => {
    expect(sql).toContain('ROLLBACK');
    ['drop column if exists created_by', 'drop column if exists employment_status',
      'drop column if exists work_email', 'drop index if exists public.employee_records_org_email_idx',
    ].forEach(frag => expect(sql).toContain(frag));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('client + security wiring', () => {
  it('the canonical id now reaches client state', () => {
    // It was previously discarded, which is why nothing could reference an
    // employee by anything but their name.
    expect(app).toContain('setEmployeeRecords(data.map(r=>({id:r.id,name:r.name');
    expect(app).toContain('employmentStatus:r.employment_status||"unknown"');
    expect(app).toContain('workEmail:r.work_email||""');
  });

  it('the upsert cannot write an invalid employment status into a NOT NULL column', () => {
    expect(app).toContain('...(EMPLOYMENT_STATUSES.includes(fields.employmentStatus) ? { employment_status: fields.employmentStatus } : {})');
    // Never `employment_status: fields.employmentStatus || null` — that would fail
    // the NOT NULL constraint on every caller that does not supply one.
    expect(app).not.toContain('employment_status: fields.employmentStatus||null');
  });

  it('5. employee_records is named in the platform-admin content prohibition', () => {
    const guard = readFileSync('api/_platformAdmin.js', 'utf8');
    expect(guard).toMatch(/never query cases[\s\S]{0,260}employee_records/);
    // Matched across the comment's line wrap rather than as one literal.
    expect(guard).toMatch(/canonical\s*\n?\s*\/\/\s*Employee File/);
    expect(guard).toContain('single most disclosing table');
  });

  it('5. no platform-admin route reads employee content', () => {
    ['api/_platformAdmin.js', 'api/team/[...action].js', 'api/billing/[...action].js'].forEach(path => {
      const code = readFileSync(path, 'utf8').split('\n')
        .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
      expect(code, path).not.toMatch(/from\(['"]employee_records['"]\)/);
      expect(code, path).not.toMatch(/employee_records\?/);
    });
  });

  it('6. creation authority stays conservative, and the reason is recorded', () => {
    // Location-scoped creation cannot be expressed: org_members.location_ids is
    // uuid[] while employee_records.location is free text with no FK.
    expect(sql).toContain('RLS: deliberately UNCHANGED');
    expect(sql).toContain('CANNOT be expressed safely');
    expect(sql).toContain('BLOCKED ON adding location_id');
    // And the case-scoped roles are explicitly excluded.
    expect(sql).toContain('Investigator, Legal/Compliance Reviewer and Auditor are NOT granted');
  });

  it('7/19. employee_records remains registered for organisation erasure', () => {
    expect(ORG_SCOPED_TABLES).toContain('employee_records');
  });

  it('rehire stays possible: identity is not the employment period', () => {
    expect(sql).toContain('A rehire keeps the same `id`');
    // And historical meeting snapshots are protected.
    expect(sql).toContain('buildEmployeeSnapshot');
    const hist = readFileSync('src/lib/employeeHistory.js', 'utf8');
    expect(hist).toContain('buildEmployeeSnapshot');
  });

  it('the stale migration header was corrected', () => {
    const standalone = readFileSync('supabase/standalone_meetings_2026-09-25.sql', 'utf8');
    expect(standalone).toContain('APPLIED to production 2026-09-25');
    expect(standalone).not.toContain('NOT YET APPLIED. Held for pre-deploy review');
    // The applied semantics are untouched.
    expect(standalone).toContain('create table public.meetings (');
    expect(standalone).toContain("check (meeting_type_id in ('informal', 'return', 'investigation'))");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('9. nothing else changed', () => {
  it('no meeting or case parentage was touched', () => {
    // E0 adds identity only. No employee_id column anywhere, no migration.
    expect(sqlCode).not.toMatch(/alter table public\.cases/i);
    expect(sqlCode).not.toMatch(/alter table public\.meetings/i);
  });

  it('the name-based legacy consumers are still present and still work', () => {
    // Deliberately unchanged in E0 — they are Class C, legacy compatibility.
    expect(app).toContain("onConflict: 'org_id,name'");
    expect(app).toContain("findEmployeeByName");
  });

  it('the formal workflow primitives are untouched', () => {
    ['src/lib/meetingWrites.js', 'src/lib/meetingLifecycle.js', 'src/lib/nextStep.js',
      'src/lib/appealIndependence.js'].forEach(path => {
      const src = readFileSync(path, 'utf8');
      expect(src, path).not.toContain('employee_records');
      expect(src, path).not.toContain('employeeId');
    });
  });
});
