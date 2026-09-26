import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
import { EmployeeSelect } from '../components/EmployeeSelect.jsx';
import { mapCaseRow } from '../lib/caseMapping.js';
import { IDENTITY, identityRequiresReconciliation } from '../lib/employeeRecords.js';
import { compileSubjectData } from '../lib/dsarCompile.js';

// Phase E0.5A — new-write employee identity.
//
// One objective: every NEW case is created against an explicit canonical employee
// identity, so Compass stops manufacturing the identity debt that E0.5B will have
// to reconcile. Plus the E0 DSAR rule tightened to fail closed.

const sql = readFileSync('supabase/case_employee_identity_2026-09-26.sql', 'utf8');
const sqlCode = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
const app = readFileSync('src/App.jsx', 'utf8');
const appCode = app.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const intake = readFileSync('src/screens/IntakeScreen.jsx', 'utf8');
const selector = readFileSync('src/components/EmployeeSelect.jsx', 'utf8');

const JOHN_A = { id: 'emp-aaaa', name: 'John Smith', jobTitle: 'Sales Manager', location: 'Manchester', employeeNumber: '1042' };
const JOHN_B = { id: 'emp-bbbb', name: 'John Smith', jobTitle: 'Team Leader', location: 'Leeds', employeeNumber: '2841' };
const DANA   = { id: 'emp-cccc', name: 'Dana Keys', jobTitle: 'Analyst', location: 'Leeds', employeeNumber: '3300' };
const ROSTER = [JOHN_A, JOHN_B, DANA];

// ═══════════════════════════════════════════════════════════════════════════
describe('1. DSAR fails closed on BOTH unsafe identity states', () => {
  const base = { employeeRecords: ROSTER };

  it('RESOLVED → export available', () => {
    const out = compileSubjectData('Dana Keys', base);
    expect(out.identityStatus).toBe(IDENTITY.RESOLVED);
    expect(out.identityRequiresReconciliation).toBe(false);
  });

  it('AMBIGUOUS → export unavailable', () => {
    const out = compileSubjectData('John Smith', base);
    expect(out.identityStatus).toBe(IDENTITY.AMBIGUOUS);
    expect(out.identityRequiresReconciliation).toBe(true);
  });

  it('UNRECONCILED → export unavailable (tightened from E0)', () => {
    const out = compileSubjectData('Nobody On The Roster', base);
    expect(out.identityStatus).toBe(IDENTITY.UNRECONCILED);
    expect(out.identityRequiresReconciliation).toBe(true);
  });

  it('only RESOLVED permits an export, in the predicate itself', () => {
    expect(identityRequiresReconciliation(ROSTER, 'Dana Keys')).toBe(false);
    expect(identityRequiresReconciliation(ROSTER, 'John Smith')).toBe(true);
    expect(identityRequiresReconciliation(ROSTER, 'Ghost')).toBe(true);
    expect(identityRequiresReconciliation([], 'Anyone')).toBe(true);
  });

  it('neither same-named employee can receive the other\'s records', () => {
    // The only safe answer while two people answer to one name: refuse, and say
    // which canonical employees the ambiguity is between.
    const out = compileSubjectData('John Smith', base);
    expect(out.identityRequiresReconciliation).toBe(true);
    expect(out.canonicalEmployeeIds.sort()).toEqual(['emp-aaaa', 'emp-bbbb']);
  });

  it('legacy name-only data is never silently attached to a canonical employee', () => {
    const out = compileSubjectData('Ghost Employee', base);
    expect(out.canonicalEmployeeIds).toEqual([]);
    expect(out.employeeRecord).toBeNull();
    expect(out.identityRequiresReconciliation).toBe(true);
  });

  it('the copy blocks without implying data is missing', () => {
    const dsarScreen = readFileSync('src/screens/DsarScreen.jsx', 'utf8');
    expect(dsarScreen).toContain('Download blocked — employee identity requires reconciliation');
    expect(dsarScreen).toContain('Nothing is missing and nothing has been removed');
    // Asserted against RENDERED copy only. A code comment legitimately names what
    // the wording must not imply, and punishing the explanation is not the point.
    const rendered = dsarScreen.split('\n')
      .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('{/*') && !l.trim().startsWith('*')).join('\n');
    expect(rendered).not.toMatch(/your records (are|were) missing/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('2/3. cases.employee_id and its database guarantees', () => {
  it('2. the column is additive, nullable, and indexed for employee lookup', () => {
    expect(sqlCode).toContain('add column if not exists employee_id uuid');
    expect(sqlCode).toContain('references public.employee_records(id) on delete restrict');
    expect(sqlCode).not.toMatch(/employee_id uuid not null/i);
    expect(sqlCode).toContain('create index if not exists cases_org_employee_idx');
    expect(sqlCode).toContain('on public.cases (org_id, employee_id)');
  });

  it('2. ON DELETE RESTRICT — deleting an employee cannot erase their cases', () => {
    expect(sqlCode).toContain('on delete restrict');
    expect(sqlCode).not.toMatch(/employee_records\(id\) on delete cascade/i);
  });

  it('2. performs no backfill and no name mapping whatsoever', () => {
    expect(sqlCode).not.toMatch(/^\s*update public\./m);
    // employee_name appears only inside a `comment on column` string, explaining
    // that it is a display snapshot. It is never read, written or joined on.
    expect(sqlCode).not.toMatch(/where[\s\S]{0,80}employee_name/i);
    expect(sqlCode).not.toMatch(/set[\s\S]{0,40}employee_id/i);
    expect(sql).toContain('NO BACKFILL');
  });

  it('3. cross-org parentage is enforced at the database, on INSERT and UPDATE', () => {
    expect(sqlCode).toContain('create trigger cases_employee_parentage_guard_trg');
    expect(sqlCode).toContain('before insert or update on public.cases');
    expect(sqlCode).toContain('to an employee in org %');
    // Tenancy is never exempted for any role — no service_role escape hatch.
    expect(sqlCode).not.toMatch(/service_role/i);
  });

  it('3/4. fill-once: value→other and value→NULL are rejected, NULL→value permitted', () => {
    expect(sqlCode).toContain("cannot be cleared once set");
    expect(sqlCode).toContain("cannot be moved between employees");
    // The fill transition is deliberately left open for E0.5B, so reconciliation
    // will not have to change this trigger.
    expect(sql).toContain('NULL  -> value   PERMITTED');
  });

  it('3. uses a purpose-built guard rather than the plain immutability helper', () => {
    // protect_immutable_columns blocks EVERY change including NULL -> value, which
    // is the one transition reconciliation needs.
    expect(sqlCode).not.toContain("protect_immutable_columns('employee_id')");
    expect(sql).toContain('FILL-ONCE, not plain immutability');
  });

  it('touches no other table, no RLS, no recipe and no case type', () => {
    ['alter table public.meetings', 'create policy', 'drop policy', 'case_type', 'cases.meetings']
      .forEach(f => expect(sqlCode.toLowerCase(), f).not.toContain(f.toLowerCase()));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('4. the shared employee selector', () => {
  it('returns a UUID, never a name, and only on an explicit pick', async () => {
    const picked = [];
    const user = userEvent.setup();
    render(<EmployeeSelect employeeRecords={ROSTER} onChange={(id, e) => picked.push([id, e?.name])} />);
    await user.type(screen.getByLabelText('Employee'), 'Dana');
    // Typing alone selects nothing — even an exact match.
    expect(picked).toEqual([]);
    await user.click(screen.getByRole('option', { name: /Dana Keys/ }));
    expect(picked).toEqual([['emp-cccc', 'Dana Keys']]);
  });

  it('10. two employees sharing a name are distinguishable, and flagged as such', async () => {
    const picked = [];
    const user = userEvent.setup();
    render(<EmployeeSelect employeeRecords={ROSTER} onChange={id => picked.push(id)} />);
    await user.type(screen.getByLabelText('Employee'), 'John Smith');
    const options = screen.getAllByRole('option');
    expect(options).toHaveLength(2);
    // Enough detail to tell them apart.
    expect(document.body.textContent).toContain('Sales Manager · Manchester · #1042');
    expect(document.body.textContent).toContain('Team Leader · Leeds · #2841');
    // And Compass says out loud that the name is not unique.
    expect(screen.getAllByText(/another employee shares this name/).length).toBe(2);
    // Picking the second one yields ITS uuid, not the first.
    await user.click(options[1]);
    expect(picked).toEqual(['emp-bbbb']);
  });

  it('9. searches the ROSTER, not cases — so an employee with no case is findable', () => {
    // 396 production employees are currently unreachable from People precisely
    // because that screen derives people from cases.
    const code = selector.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toContain('cases');
    expect(code).toContain('employeeRecords');
  });

  it('offers no free-text identity fallback to anyone', async () => {
    const user = userEvent.setup();
    render(<EmployeeSelect employeeRecords={ROSTER} onChange={() => {}} />);
    await user.type(screen.getByLabelText('Employee'), 'Someone Entirely New');
    expect(screen.getByText(/No employee found/)).toBeInTheDocument();
    // No "use this name anyway" escape.
    expect(document.body.textContent).not.toMatch(/use this name|continue anyway|add as text/i);
  });

  it('8/12. a non-HR user is given a route, never a creation button', async () => {
    const user = userEvent.setup();
    render(<EmployeeSelect employeeRecords={ROSTER} canCreateEmployee={false} onRequestCreate={() => {}} onChange={() => {}} />);
    await user.type(screen.getByLabelText('Employee'), 'Someone Entirely New');
    expect(screen.getByText(/ask an HR Director or HR Manager to add them/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Add .* as a new employee/ })).toBeNull();
  });

  it('11. an HR user is offered the authorised creation route', async () => {
    const asked = [];
    const user = userEvent.setup();
    render(<EmployeeSelect employeeRecords={ROSTER} canCreateEmployee onRequestCreate={n => asked.push(n)} onChange={() => {}} />);
    await user.type(screen.getByLabelText('Employee'), 'Brand New Person');
    await user.click(screen.getByRole('button', { name: /Add “Brand New Person” as a new employee/ }));
    expect(asked).toEqual(['Brand New Person']);
  });

  it('a roster row with only a name is still selectable', async () => {
    const picked = [];
    const user = userEvent.setup();
    render(<EmployeeSelect employeeRecords={[{ id: 'emp-thin', name: 'Sparse Record' }]} onChange={id => picked.push(id)} />);
    await user.type(screen.getByLabelText('Employee'), 'Sparse');
    expect(screen.getByText('No further details on file')).toBeInTheDocument();
    await user.click(screen.getByRole('option', { name: /Sparse Record/ }));
    expect(picked).toEqual(['emp-thin']);
  });

  it('finds people by job title, location and employee number too', async () => {
    const user = userEvent.setup();
    const { unmount } = render(<EmployeeSelect employeeRecords={ROSTER} onChange={() => {}} />);
    await user.type(screen.getByLabelText('Employee'), '2841');
    expect(screen.getByRole('option', { name: /Team Leader/ })).toBeInTheDocument();
    unmount();
    render(<EmployeeSelect employeeRecords={ROSTER} onChange={() => {}} />);
    await userEvent.setup().type(screen.getByLabelText('Employee'), 'Manchester');
    expect(screen.getByRole('option', { name: /Sales Manager/ })).toBeInTheDocument();
  });

  it('never merges, never auto-selects', () => {
    const code = selector.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    ['merge', 'autoSelect', 'useEffect'].forEach(f => expect(code, f).not.toContain(f));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('5/6/7/8. both creation paths, one contract', () => {
  it('6. "+ New case" requires a selected employee and stamps employee_id', () => {
    expect(appCode).toContain('const [casePromptEmployeeId, setCasePromptEmployeeId] = useState(null);');
    expect(appCode).toContain('disabled={!casePromptEmployeeId}');
    expect(appCode).toContain('if(!casePromptEmployeeId) return;');
    expect(appCode).toContain('employeeId: casePromptEmployeeId,');
    // The old guard — any non-empty string — is gone.
    expect(appCode).not.toContain('disabled={!casePromptName.trim()}');
  });

  it('6. it no longer writes to the employee roster from a case form', () => {
    const submit = appCode.slice(appCode.indexOf('if(!casePromptEmployeeId) return;'),
                                appCode.indexOf('employeeId: casePromptEmployeeId,'));
    expect(submit).not.toContain('upsertEmployeeRecord');
    expect(submit).toContain('findEmployeeById(employeeRecords, casePromptEmployeeId)');
  });

  it('7. IntakeScreen requires a selected employee and stamps employee_id', () => {
    expect(intake).toContain('disabled={!intake.employeeId||!intake.type}');
    expect(intake).toContain('if(!intake.employeeId) return;');
    expect(intake).toContain('employeeId: intake.employeeId,');
    expect(intake).not.toContain("disabled={!intake.employee.trim()||!intake.type}");
  });

  it('8. BOTH paths use the same selector component — no divergent semantics', () => {
    expect(appCode).toContain('<EmployeeSelect');
    expect(intake).toContain('<EmployeeSelect');
    // And neither keeps a cases-derived datalist for identity.
    expect(appCode).not.toContain('<datalist id="employee-suggestions">');
    expect(intake).not.toContain('intake-employee-list');
  });

  it('9. the selected UUID determines identity; the name is a snapshot', () => {
    // The name is derived FROM the selection in both paths. The modal no longer
    // keeps a parallel name in state at all (removed in E0.5A.1) — it reads it off
    // the selected employee at submit time, which is one fewer place a name could
    // drift back into being identity.
    expect(appCode).toContain('const name = selectedEmployee.name;');
    expect(appCode).not.toContain('const [casePromptName, setCasePromptName]');
    expect(intake).toContain('employeeId:id, employee:employee?.name || ""');
    // And it is still stored, for display/compatibility.
    expect(appCode).toContain('employeeName: name,');
    expect(intake).toContain('employeeName: intake.employee.trim(),');
  });

  it('employee_id is persisted and read back', () => {
    expect(appCode).toContain('employee_id: caseObj.employeeId ?? null,');
    const mapping = readFileSync('src/lib/caseMapping.js', 'utf8');
    expect(mapping).toContain('employeeId: row.employee_id || null,');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('5/9. legacy cases stay valid', () => {
  it('5. a case row with no employee_id maps to null, not to a guess', () => {
    const legacy = mapCaseRow({ id: 'c-legacy', employee_name: 'Historic Person', meetings: [] });
    expect(legacy.employeeId).toBeNull();
    expect(legacy.employeeName).toBe('Historic Person');
  });

  it('5. NULL is never reinterpreted as new, unknown, or resolvable by name', () => {
    const mapping = readFileSync('src/lib/caseMapping.js', 'utf8');
    expect(mapping).toContain('NULL must never be reinterpreted');
    expect(mapping).not.toContain('findEmployeeByName');
    // Nothing in the read path resolves a case's employee from its name.
    expect(mapping).not.toMatch(/employee_name.*employee_records/);
  });

  it('the column comment records the transitional contract', () => {
    expect(sqlCode).toContain('NEVER interpret NULL as a new or unknown employee');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('10/14/15. audit and non-regression', () => {
  it('10. case creation audits identity provenance', () => {
    // The audit records who the case is for and who created it, without copying
    // case content into the audit detail.
    expect(appCode).toContain('audit("Case created", `${name} — employee ${casePromptEmployeeId}`, newCase.id);');
    expect(intake).toContain('audit?.("Case created"');
    // Identity provenance: which employee, the display name at the time, plus the
    // actor and timestamp audit() stamps itself. No case content in the detail.
    expect(appCode).not.toMatch(/audit\("Case created"[^)]*description/);
  });

  it('14/15. confidential-case and case_access controls are untouched', () => {
    expect(sqlCode).not.toMatch(/confidential/i);
    expect(sqlCode).not.toMatch(/case_access/i);
  });

  it('the formal workflow primitives know nothing about employee identity', () => {
    ['src/lib/meetingWrites.js', 'src/lib/meetingLifecycle.js', 'src/lib/nextStep.js',
      'src/lib/appealIndependence.js', 'src/lib/caseStage.js'].forEach(path => {
      const src = readFileSync(path, 'utf8');
      expect(src, path).not.toContain('employeeId');
      expect(src, path).not.toContain('employee_id');
    });
  });

  it('meetings were not touched', () => {
    expect(sqlCode).not.toContain('public.meetings');
    const standaloneLib = readFileSync('src/lib/standaloneMeetings.js', 'utf8');
    expect(standaloneLib).not.toContain('employeeId');
  });

  it('UNIQUE(org_id, name) is still not dropped, and analytics migration is recorded', () => {
    expect(sqlCode).not.toMatch(/drop constraint .*employee_records_org_id_name_key/i);
    expect(sql).toContain('NOT dropping UNIQUE(org_id, name)');
    expect(sql).toContain('4 live analytics functions');
  });
});
