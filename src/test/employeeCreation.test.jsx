import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import {
  createEmployeeWrite, describeEmployeeCreateOutcome, isDuplicateName, isRefused,
  EMPLOYEE_CREATE_RESULT,
} from '../lib/employeeWrites.js';
import { mapEmployeeRow, findPossibleDuplicates } from '../lib/employeeRecords.js';
import { EmployeeCreateInline } from '../components/EmployeeCreateInline.jsx';
import { PeopleScreen } from '../screens/PeopleScreen.jsx';

// ─────────────────────────────────────────────────────────────────────────
// MANUAL EMPLOYEE CREATION — the dead end found during D4.3 browser UAT.
//
// EmployeeSelect has always offered `Add "[name]" as a new employee`, but both
// case-creation paths wired that callback to a Settings redirect plus a toast,
// and Settings → Employee data only ever exposed CSV import/export. So the
// action promised an operation Compass did not provide, and the redirect threw
// away everything already typed into the case form.
//
// Behaviour is exercised rather than grepped wherever it is reachable from
// JavaScript. The RLS and audit halves are not reachable from here — they are
// proven by live adversarial probes in the wave report, as the database is the
// only place those rules exist.
// ─────────────────────────────────────────────────────────────────────────

const ok = (row) => ({ data: row, error: null });
const fail = (error) => ({ data: null, error });

// A fake client shaped like the one call the write actually makes.
function fakeSupabase(response) {
  const insert = vi.fn(() => ({ select: () => ({ single: async () => response }) }));
  return { client: { from: vi.fn(() => ({ insert })) }, insert };
}

const ROW = {
  id: 'emp-new', name: 'Ada Lovelace', job_title: 'Engineer', start_date: null,
  location: null, location_id: 'loc-1', employee_number: null, department: null,
  manager: null, status: null, working_pattern: null, probation_end_date: null,
  work_email: null, employment_status: 'unknown', end_date: null, updated_at: null,
};

// ═══════════════════════════════════════════════════════════════════════════
// THE CANONICAL WRITE
// ═══════════════════════════════════════════════════════════════════════════
describe('canonical employee creation — INSERT, never UPSERT', () => {
  it('inserts, and sends org_id from session context rather than any form field', async () => {
    const { client, insert } = fakeSupabase(ok(ROW));
    const res = await createEmployeeWrite({
      supabase: client, orgId: 'org-1', name: '  Ada Lovelace  ', locationId: 'loc-1',
    });
    expect(res.result).toBe(EMPLOYEE_CREATE_RESULT.OK);
    const payload = insert.mock.calls[0][0];
    expect(payload.org_id).toBe('org-1');
    expect(payload.name).toBe('Ada Lovelace');       // trimmed
    expect(payload.location_id).toBe('loc-1');
  });

  it('NEVER upserts — a matching name must not merge two people', () => {
    // The behavioural half is the duplicate test below; this pins the one thing
    // a mock cannot show, namely that no conflict target exists to merge on.
    const src = readFileSync('src/lib/employeeWrites.js', 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(src).toContain('.insert(');
    expect(src).not.toContain('.upsert(');
    expect(src).not.toContain('onConflict');
  });

  it('does not send employment_status, so the truthful DB default applies', async () => {
    const { client, insert } = fakeSupabase(ok(ROW));
    await createEmployeeWrite({ supabase: client, orgId: 'org-1', name: 'Ada' });
    expect(insert.mock.calls[0][0]).not.toHaveProperty('employment_status');
  });

  it('does not send created_by — provenance is the database\'s to assign', async () => {
    const { client, insert } = fakeSupabase(ok(ROW));
    await createEmployeeWrite({
      supabase: client, orgId: 'org-1', name: 'Ada',
      fields: { createdBy: 'someone-else', created_by: 'someone-else' },
    });
    const payload = insert.mock.calls[0][0];
    expect(payload).not.toHaveProperty('created_by');
    expect(JSON.stringify(payload)).not.toContain('someone-else');
  });

  it('omits absent optional fields rather than writing empty strings', async () => {
    const { client, insert } = fakeSupabase(ok(ROW));
    await createEmployeeWrite({
      supabase: client, orgId: 'org-1', name: 'Ada',
      fields: { jobTitle: 'Engineer', department: '   ', manager: null },
    });
    const payload = insert.mock.calls[0][0];
    expect(payload.job_title).toBe('Engineer');
    expect(payload).not.toHaveProperty('department');
    expect(payload).not.toHaveProperty('manager');
  });

  it('reports a duplicate name as a refusal to merge, not a generic failure', async () => {
    const { client } = fakeSupabase(fail({
      code: '23505',
      message: 'duplicate key value violates unique constraint "employee_records_org_id_name_key"',
    }));
    const res = await createEmployeeWrite({ supabase: client, orgId: 'org-1', name: 'Ada Lovelace' });
    expect(res.result).toBe(EMPLOYEE_CREATE_RESULT.DUPLICATE_NAME);
    const said = describeEmployeeCreateOutcome(res.result, 'Ada Lovelace');
    expect(said).toMatch(/already an employee/i);
    expect(said).toMatch(/won't merge two people/i);
  });

  it('recognises the duplicate by constraint name even without a code', () => {
    expect(isDuplicateName({ message: 'violates employee_records_org_id_name_key' })).toBe(true);
    expect(isDuplicateName({ code: '23505' })).toBe(true);
    expect(isDuplicateName(null)).toBe(false);
  });

  it('reports an RLS refusal as an authority problem', async () => {
    const { client } = fakeSupabase(fail({
      code: '42501', message: 'new row violates row-level security policy for table "employee_records"',
    }));
    const res = await createEmployeeWrite({ supabase: client, orgId: 'org-1', name: 'Ada', locationId: 'loc-other-org' });
    expect(res.result).toBe(EMPLOYEE_CREATE_RESULT.REFUSED);
    expect(describeEmployeeCreateOutcome(res.result)).toMatch(/do not have authority/i);
    expect(isRefused({ message: 'violates row-level security policy' })).toBe(true);
  });

  it('refuses to call the database at all without an org or a name', async () => {
    const { client, insert } = fakeSupabase(ok(ROW));
    expect((await createEmployeeWrite({ supabase: client, orgId: null, name: 'Ada' })).result)
      .toBe(EMPLOYEE_CREATE_RESULT.INVALID);
    expect((await createEmployeeWrite({ supabase: client, orgId: 'org-1', name: '   ' })).result)
      .toBe(EMPLOYEE_CREATE_RESULT.INVALID);
    expect(insert).not.toHaveBeenCalled();
  });

  it('creates exactly once per call', async () => {
    const { client, insert } = fakeSupabase(ok(ROW));
    await createEmployeeWrite({ supabase: client, orgId: 'org-1', name: 'Ada' });
    expect(insert).toHaveBeenCalledTimes(1);
  });

  it('returns the inserted row so the caller can select the person immediately', async () => {
    const { client } = fakeSupabase(ok(ROW));
    const res = await createEmployeeWrite({ supabase: client, orgId: 'org-1', name: 'Ada Lovelace' });
    expect(mapEmployeeRow(res.row)).toMatchObject({
      id: 'emp-new', name: 'Ada Lovelace', jobTitle: 'Engineer',
      locationId: 'loc-1', employmentStatus: 'unknown',
    });
  });

  it('creates no case, and says nothing about cases at all', () => {
    const src = readFileSync('src/lib/employeeWrites.js', 'utf8');
    expect(src).not.toMatch(/from\(['"]cases['"]\)/);
    expect(src).not.toContain('employee_id');
  });
});

describe('only ONE manual persistence implementation survives', () => {
  const app = () => readFileSync('src/App.jsx', 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

  it('the retired upsert and its second implementation are gone', () => {
    const code = app();
    expect(code).not.toContain('createEmployeeRecord');
    expect(code).not.toContain('createEmployeeAtLocation');
  });

  it('no employee_records upsert remains outside the bulk CSV importer', () => {
    // CSV import legitimately merges by name — that is what an import IS. Manual
    // creation must not, which is the whole point of this slice.
    const code = app();
    const upserts = [...code.matchAll(/from\('employee_records'\)\s*\n?\s*\.upsert\(/g)];
    expect(upserts.length, 'exactly one: the CSV importer').toBeLessThanOrEqual(1);
  });

  it('every creation surface routes through the one operation', () => {
    const code = app();
    for (const surface of [
      /onCreateEmployee=\{\(name, locationId, fields\)=>createEmployee\(/,          // People
      /onCreateEmployee=\{\(name, locationId\)=>createEmployee\(/,                  // Intake
      /onCreate=\{\(name, locationId\)=>createEmployee\(/,                          // New Case
    ]) expect(code, String(surface)).toMatch(surface);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE INLINE PANEL — New Case / Intake
// ═══════════════════════════════════════════════════════════════════════════
describe('inline creation panel', () => {
  const LOCS = [{ id: 'loc-1', name: 'London' }, { id: 'loc-2', name: 'Manchester' }];
  const setup = (over = {}) => {
    const onCreate = vi.fn(async () => ({ ok: true, employee: mapEmployeeRow(ROW) }));
    const onCreated = vi.fn();
    render(<EmployeeCreateInline
      initialName="Ada Lovelace" employeeRecords={[]} locations={LOCS}
      isHR onCreate={onCreate} onCreated={onCreated} onCancel={() => {}} {...over} />);
    return { onCreate, onCreated };
  };

  it('pre-populates the typed name', () => {
    setup();
    expect(screen.getByLabelText('Full name')).toHaveValue('Ada Lovelace');
  });

  it('offers HR the explicit unassigned option', () => {
    setup();
    expect(screen.getByRole('option', { name: /No location yet/ })).toBeInTheDocument();
  });

  it('does NOT offer a location manager an unassigned route', () => {
    setup({ isHR: false, authorisedLocationIds: ['loc-1'] });
    expect(screen.queryByRole('option', { name: /No location yet/ })).not.toBeInTheDocument();
  });

  it('offers a location manager only their authorised locations', () => {
    setup({ isHR: false, authorisedLocationIds: ['loc-2'] });
    expect(screen.getByRole('option', { name: 'Manchester' })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: 'London' })).not.toBeInTheDocument();
  });

  it('HR with ZERO locations can still create an unassigned employee', async () => {
    const user = userEvent.setup();
    const { onCreate } = setup({ locations: [] });
    await user.selectOptions(screen.getByLabelText('Location'), '__unassigned__');
    await user.click(screen.getByRole('button', { name: 'Add employee' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Ada Lovelace', null));
  });

  it('sends the chosen location id, and null for the unassigned sentinel', async () => {
    const user = userEvent.setup();
    const { onCreate } = setup();
    await user.selectOptions(screen.getByLabelText('Location'), 'loc-2');
    await user.click(screen.getByRole('button', { name: 'Add employee' }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith('Ada Lovelace', 'loc-2'));
  });

  it('cannot be submitted without a location decision', () => {
    setup();
    expect(screen.getByRole('button', { name: 'Add employee' })).toBeDisabled();
  });

  it('hands the created employee back for selection', async () => {
    const user = userEvent.setup();
    const { onCreated } = setup();
    await user.selectOptions(screen.getByLabelText('Location'), 'loc-1');
    await user.click(screen.getByRole('button', { name: 'Add employee' }));
    await waitFor(() => expect(onCreated).toHaveBeenCalledWith(
      expect.objectContaining({ id: 'emp-new', name: 'Ada Lovelace' })));
  });

  it('stays open with the name intact when creation fails', async () => {
    const user = userEvent.setup();
    const { onCreated } = setup({ onCreate: vi.fn(async () => ({ ok: false })) });
    await user.selectOptions(screen.getByLabelText('Location'), 'loc-1');
    await user.click(screen.getByRole('button', { name: 'Add employee' }));
    await waitFor(() => expect(screen.getByLabelText('Full name')).toHaveValue('Ada Lovelace'));
    expect(onCreated).not.toHaveBeenCalled();
  });

  it('warns about a likely duplicate without blocking, and never merges', async () => {
    setup({ employeeRecords: [{ id: 'emp-old', name: 'Ada Lovelace' }] });
    expect(await screen.findByRole('status')).toHaveTextContent(/already an employee/i);
    // advisory only — the database constraint is the boundary
    expect(findPossibleDuplicates([{ id: 'emp-old', name: 'Ada Lovelace' }], { name: 'Ada Lovelace' }))
      .toHaveLength(1);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// PEOPLE
// ═══════════════════════════════════════════════════════════════════════════
describe('People — Add employee visibility', () => {
  const base = {
    cases: [], employeeRecords: [], wellbeingNotes: [], concernReferrals: [], dsarRequests: [],
    setActiveEmployeeId: () => {}, setScreen: () => {}, setMeetingSetup: () => {},
    employmentEvents: [], onCreateEmployee: vi.fn(),
  };

  it('is visible to HR even when the organisation has ZERO locations', () => {
    // The defect: the gate required assignable.length>0, so an org with no
    // locations had no way to add an employee at all — while the form it opens
    // deliberately offers HR "No location yet".
    render(<PeopleScreen {...base} locations={[]} isHR />);
    expect(screen.getByRole('button', { name: 'Add employee' })).toBeInTheDocument();
  });

  it('is visible to HR when locations exist', () => {
    render(<PeopleScreen {...base} locations={[{ id: 'loc-1', name: 'London' }]} isHR />);
    expect(screen.getByRole('button', { name: 'Add employee' })).toBeInTheDocument();
  });

  it('is NOT visible to a location manager with no authorised locations', () => {
    render(<PeopleScreen {...base} locations={[{ id: 'loc-1', name: 'London' }]}
      isHR={false} authorisedLocationIds={[]} />);
    expect(screen.queryByRole('button', { name: 'Add employee' })).not.toBeInTheDocument();
  });

  it('IS visible to a location manager who has one', () => {
    render(<PeopleScreen {...base} locations={[{ id: 'loc-1', name: 'London' }]}
      isHR={false} authorisedLocationIds={['loc-1']} />);
    expect(screen.getByRole('button', { name: 'Add employee' })).toBeInTheDocument();
  });

  it('is never offered in the Archive view', () => {
    render(<PeopleScreen {...base} locations={[]} isHR archived />);
    expect(screen.queryByRole('button', { name: 'Add employee' })).not.toBeInTheDocument();
    expect(screen.getByText('Archive')).toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE DEAD END IS GONE
// ═══════════════════════════════════════════════════════════════════════════
describe('no journey redirects to Settings any more', () => {
  const strip = f => readFileSync(f, 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

  it('neither case-creation path sends the adviser to Settings', () => {
    for (const f of ['src/App.jsx', 'src/screens/IntakeScreen.jsx']) {
      expect(strip(f), f).not.toContain('then create the case');
      expect(strip(f), f).not.toContain('Employee records, then');
    }
  });

  it('both case paths pass the typed name into the panel', () => {
    expect(strip('src/App.jsx')).toMatch(/onRequestCreate=\{\(typed\)=>setCasePromptCreateName\(typed\|\|""\)\}/);
    expect(strip('src/screens/IntakeScreen.jsx')).toMatch(/onRequestCreate=\{\(typed\)=>setCreateName\(typed\|\|""\)\}/);
  });

  it('the panel renders INSIDE the New Case modal — which is what preserves its state', () => {
    // Nothing is saved or restored; the fix is that nothing unmounts. If this
    // ever became a navigation again, every value in the modal would reset.
    const code = strip('src/App.jsx');
    const modal = code.slice(code.indexOf('case-prompt-name'), code.indexOf('case-prompt-name') + 3000);
    expect(modal).toContain('EmployeeCreateInline');
    expect(modal).not.toContain('setScreen(');
  });

  it('creating an employee touches no New Case field except the employee', () => {
    const code = strip('src/App.jsx');
    const handler = code.slice(code.indexOf('onCreated={(employee)=>{'),
                               code.indexOf('onCancel={()=>setCasePromptCreateName(null)}'));
    for (const preserved of ['setNewCaseType', 'setNewCaseOwnerId', 'setNewCasePriority',
      'setNewCaseDescription', 'setNewCaseEvidence']) {
      expect(handler, `${preserved} must not be reset by employee creation`).not.toContain(preserved);
    }
    // it DOES select the new person, and may prefill from their own record
    expect(handler).toContain('setCasePromptEmployeeId');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// §5 REGRESSION — a same-name employee must NEVER be silently mutated
// ═══════════════════════════════════════════════════════════════════════════
describe('a duplicate attempt refuses rather than merging', () => {
  // A client that would SCREAM if anything but insert were attempted. The old
  // upsert is unrepresentable here: calling .upsert or .update throws.
  function strictClient(response) {
    const insert = vi.fn(() => ({ select: () => ({ single: async () => response }) }));
    const forbidden = (m) => () => { throw new Error(`${m} must never be used for manual creation`); };
    return {
      client: { from: vi.fn(() => ({ insert, upsert: forbidden('upsert'), update: forbidden('update'), delete: forbidden('delete') })) },
      insert,
    };
  }

  it('attempts exactly one INSERT and never an upsert, update or delete', async () => {
    const { client, insert } = strictClient(fail({
      code: '23505', message: 'violates unique constraint "employee_records_org_id_name_key"',
    }));
    const res = await createEmployeeWrite({ supabase: client, orgId: 'org-1', name: 'Ada Lovelace' });
    expect(res.result).toBe(EMPLOYEE_CREATE_RESULT.DUPLICATE_NAME);
    expect(insert).toHaveBeenCalledTimes(1);
    expect(client.from).toHaveBeenCalledTimes(1);
    expect(client.from).toHaveBeenCalledWith('employee_records');
  });

  it('does not retry as an update or fall back to a merge after refusal', async () => {
    const { client } = strictClient(fail({ code: '23505', message: 'employee_records_org_id_name_key' }));
    // If any fallback existed, strictClient's forbidden methods would throw and
    // this would surface as ERROR rather than DUPLICATE_NAME.
    const res = await createEmployeeWrite({ supabase: client, orgId: 'org-1', name: 'Ada Lovelace' });
    expect(res.result).toBe(EMPLOYEE_CREATE_RESULT.DUPLICATE_NAME);
  });

  it('the message tells the user Compass did NOT merge the two people', () => {
    const said = describeEmployeeCreateOutcome(EMPLOYEE_CREATE_RESULT.DUPLICATE_NAME, 'Ada Lovelace');
    expect(said).toMatch(/won't merge two people with the same name/i);
    expect(said).toMatch(/same person first/i);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// AUDIT AND PROVENANCE — the migration artifact
// ═══════════════════════════════════════════════════════════════════════════
describe('employee creation provenance migration', () => {
  const FILE = 'supabase/employee_creation_provenance_2026-10-03.sql';
  const raw = () => readFileSync(FILE, 'utf8');
  const sql = () => raw().split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

  it('assigns created_by server-side on INSERT, overwriting any client value', () => {
    const s = sql();
    expect(s).toMatch(/create or replace function public\.set_employee_created_by/);
    expect(s).toMatch(/new\.created_by := auth\.uid\(\)/);
    expect(s).toMatch(/before insert on public\.employee_records/);
  });

  it('writes an Employee created audit event with a server-derived actor', () => {
    const s = sql();
    expect(s).toMatch(/create or replace function public\.log_employee_created/);
    expect(s).toMatch(/after insert on public\.employee_records/);
    expect(s).toMatch(/'Employee created'/);
    expect(s).toMatch(/new\.org_id, auth\.uid\(\)/);
    expect(s).toMatch(/new\.id\);/);
  });

  it('records NOTHING rather than inventing an actor when there is none', () => {
    // audit_log.user_id and user_name are both NOT NULL, so a service-role or
    // migration insert has no truthful row to write. Skipping is the honest
    // answer; created_by stays NULL and says so.
    const body = sql().slice(sql().indexOf('function public.log_employee_created'));
    expect(body).toMatch(/if auth\.uid\(\) is null then\s*\n\s*return null;/);
    expect(raw()).toMatch(/invented|fabricate/i);
  });

  it('makes Employee created unforgeable through the generic audit RPC', () => {
    const s = sql();
    const fn = s.slice(s.indexOf('FUNCTION public.log_audit_event'));
    const reserved = fn.slice(fn.indexOf('p_action in ('), fn.indexOf(') then'));
    expect(reserved).toContain("'Employee created'");
    // every previously reserved action survives
    for (const keep of ['Case deleted', 'Outcome issued', 'Employee details corrected',
      'Employee identity reconciled', 'Employee identity corrected']) {
      expect(reserved, keep).toContain(`'${keep}'`);
    }
  });

  it('did not retype log_audit_event — the D4.3 lesson', () => {
    // In D4.3 this section was hand-transcribed, a column name was mistyped,
    // CREATE OR REPLACE reported success (plpgsql bodies are not name-resolved
    // until first execution) and the generic audit RPC broke in production.
    const s = sql();
    expect(s).toMatch(/insert into public\.audit_log \(org_id, user_id, user_name, action, detail, case_id, ai_prepared, approved_by, data_used\)/);
    expect(s).not.toContain('p_case_id_col_placeholder');
    expect(raw()).toMatch(/programmatically/);
  });

  it('writes no employee row and repairs no history', () => {
    const s = sql();
    for (const forbidden of [/insert into public\.employee_records/i, /update public\.employee_records/i,
      /delete from public\.employee_records/i, /alter table/i, /create table/i]) {
      expect(s, String(forbidden)).not.toMatch(forbidden);
    }
    expect(raw()).toMatch(/does not backfill created_by/);
  });

  it('leaves the existing UPDATE-side triggers alone', () => {
    const s = sql();
    expect(s).not.toMatch(/log_employee_detail_correction/);
    expect(s).not.toMatch(/protect_employee_location_column/);
  });
});
