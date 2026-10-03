import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  setEmployeeLocationWrite, describeLocationOutcome, LOCATION_RESULT,
} from '../lib/employeeLocationWrites.js';
import { buildEmployeeRoster } from '../lib/employeeContext.js';

// ═══════════════════════════════════════════════════════════════════════════
// Phase E1.5 — employee location foundation.
//
// The real enforcement boundary is employee_records RLS, proven directly against
// the production database inside rolled-back transactions (see the phase report).
// These tests cover the parts that live in JS, and — just as importantly — assert
// the invariants a future change could quietly undo: that free text never decides
// permission, that no location means HR-only rather than everyone, and that the
// client never filters employees by location itself.
// ═══════════════════════════════════════════════════════════════════════════

const SQL = readFileSync('supabase/employee_location_foundation_2026-09-27.sql', 'utf8');
// Comments explain the rules; they must never be what satisfies an assertion
// about them. Both line and block comments go.
const sqlCode = SQL.replace(/--[^\n]*/g, '').replace(/\/\*[\s\S]*?\*\//g, '');

const APP = readFileSync('src/App.jsx', 'utf8');
const appCode = APP.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');

describe('setEmployeeLocationWrite', () => {
  const rpc = (impl) => ({ rpc: vi.fn(impl) });

  it('passes the employee, the location and the expected version to the RPC', async () => {
    const supabase = rpc(async () => ({ error: null }));
    const out = await setEmployeeLocationWrite({
      supabase, employeeId: 'e1', locationId: 'loc1', expectedUpdatedAt: '2026-09-27T00:00:00Z',
    });
    expect(out.result).toBe(LOCATION_RESULT.OK);
    expect(supabase.rpc).toHaveBeenCalledWith('set_employee_location', {
      p_employee_id: 'e1', p_location_id: 'loc1', p_expected_updated_at: '2026-09-27T00:00:00Z',
    });
  });

  it('sends a null location when clearing, not the string "null"', async () => {
    const supabase = rpc(async () => ({ error: null }));
    await setEmployeeLocationWrite({ supabase, employeeId: 'e1', locationId: null, expectedUpdatedAt: 'v1' });
    expect(supabase.rpc.mock.calls[0][1].p_location_id).toBeNull();
  });

  it('reports a lost race as a CONFLICT, by errcode', async () => {
    const supabase = rpc(async () => ({ error: { code: 'PT409', message: 'anything at all' } }));
    const out = await setEmployeeLocationWrite({ supabase, employeeId: 'e1', locationId: 'loc1' });
    expect(out.result).toBe(LOCATION_RESULT.CONFLICT);
    // And the message blames nobody.
    const { tone, message } = describeLocationOutcome(out);
    expect(tone).toBe('error');
    expect(message).toMatch(/Someone else updated this employee/);
    expect(message).not.toMatch(/error|failed|invalid/i);
  });

  it('reports a refusal as REFUSED, and never as success', async () => {
    const supabase = rpc(async () => ({ error: { code: '42501', message: 'Only HR can assign an employee’s canonical location' } }));
    const out = await setEmployeeLocationWrite({ supabase, employeeId: 'e1', locationId: 'loc1' });
    expect(out.result).toBe(LOCATION_RESULT.REFUSED);
    expect(describeLocationOutcome(out).tone).toBe('error');
  });

  it('a thrown exception is a refusal, not an unhandled rejection', async () => {
    const supabase = rpc(async () => { throw new Error('network gone'); });
    const out = await setEmployeeLocationWrite({ supabase, employeeId: 'e1', locationId: 'loc1' });
    expect(out.result).toBe(LOCATION_RESULT.REFUSED);
  });

  it('refuses to call the RPC without an employee id', async () => {
    const supabase = rpc(async () => ({ error: null }));
    const out = await setEmployeeLocationWrite({ supabase, employeeId: '', locationId: 'loc1' });
    expect(out.result).toBe(LOCATION_RESULT.INVALID);
    expect(supabase.rpc).not.toHaveBeenCalled();
  });

  it('describes clearing a location differently from setting one', async () => {
    expect(describeLocationOutcome({ result: LOCATION_RESULT.OK }, 'Manchester').message).toMatch(/set to Manchester/);
    expect(describeLocationOutcome({ result: LOCATION_RESULT.OK }, '').message).toMatch(/unassigned again/);
  });
});

describe('the roster carries canonical location, separately from legacy free text', () => {
  const base = { cases: [], wellbeingNotes: [], concernReferrals: [], dsarRequests: [] };

  it('exposes locationId and location as two different things', () => {
    const roster = buildEmployeeRoster({
      ...base,
      employeeRecords: [{ id: 'e1', name: 'A', locationId: 'loc-uuid', location: 'Manchester' }],
    });
    expect(roster[0].locationId).toBe('loc-uuid');
    expect(roster[0].location).toBe('Manchester');
  });

  it('an employee with only free text has NO canonical location', () => {
    // This is the whole 19-row production situation: text, but nothing canonical.
    const roster = buildEmployeeRoster({
      ...base,
      employeeRecords: [{ id: 'e1', name: 'A', location: 'Manchester' }],
    });
    expect(roster[0].locationId).toBeNull();
    expect(roster[0].location).toBe('Manchester');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// Adversarial — each of these fails if someone later undoes a decision that
// took a security audit to get right.
// ═══════════════════════════════════════════════════════════════════════════
describe('E1.5 adversarial — security decisions that must not be undone', () => {
  it('NULL location is never treated as organisation-wide for a Location Manager', () => {
    // can_access_employee must test `p_location_id is not null` BEFORE consulting
    // the manager's list. Without it, `NULL = ANY(...)` yields NULL and the
    // outcome depends on where it is coerced.
    const fn = sqlCode.slice(sqlCode.indexOf('function public.can_access_employee'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).toMatch(/p_location_id is not null/);
    expect(body).toMatch(/location_manager/);
  });

  it('the helper does NOT reproduce can_access_case_location\'s fail-open clause', () => {
    // That function starts `SELECT NOT EXISTS (location_manager with locations)`,
    // so a manager with an EMPTY location list sees everything. Copying it would
    // have handed org-wide employee access to exactly that manager.
    const fn = sqlCode.slice(sqlCode.indexOf('function public.can_access_employee'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).not.toMatch(/not\s+exists/i);
  });

  it('own-org membership alone never grants a Location Manager every employee', () => {
    const fn = sqlCode.slice(sqlCode.indexOf('function public.can_access_employee'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    // The role must be discriminated. A body that only checked org membership
    // would be the pre-E1.5 policy wearing a new name.
    expect(body).toMatch(/om\.role is distinct from 'location_manager'/);
  });

  it('the free-text location column is never used in any policy or helper', () => {
    // The one thing that must never happen: permission decided by a text label.
    // Scoped to the expressions that actually DECIDE access — the three helper
    // bodies and the four policy predicates. Counting the word across the whole
    // file is meaningless, because it legitimately appears in the messages shown
    // to users and in the audit detail string.
    const deciders = [
      'function public.can_access_employee',
      'function public.is_location_manager_for',
      'function public.is_hr_in_org',
      'create policy employee_records_select_scoped',
      'create policy employee_records_insert_scoped',
      'create policy employee_records_update_scoped',
      'create policy employee_records_delete_hr_only',
    ].map(anchor => {
      const from = sqlCode.indexOf(anchor);
      expect(from, anchor).toBeGreaterThan(-1);
      const rest = sqlCode.slice(from);
      const end = anchor.startsWith('function') ? rest.indexOf('$$;') : rest.indexOf(';');
      return rest.slice(0, end);
    });
    deciders.forEach((expr, i) => {
      // location_id is the canonical column and is expected. A bare `location`
      // would be the free-text one deciding who can see a person.
      const bare = expr.match(/\blocation\b(?!_id|_ids|s\b)/g) || [];
      expect(bare, `decider ${i}: ${bare.join(',')}`).toEqual([]);
      expect(expr).not.toMatch(/\bname\b\s*(=|ilike|like)/i);
    });
  });

  it('same-organisation integrity is enforced by the database, not the app', () => {
    expect(sqlCode).toMatch(/foreign key \(location_id, org_id\)\s*references public\.locations \(id, org_id\)/);
    expect(sqlCode).toMatch(/unique \(id, org_id\)/);
  });

  it('deleting a location cannot silently unassign employees', () => {
    // ON DELETE SET NULL would move every employee at that location into the
    // HR-only unassigned pool without anyone deciding to.
    expect(sqlCode).toMatch(/references public\.locations \(id, org_id\)\s*\n\s*on delete restrict/);
    expect(sqlCode).not.toMatch(/references public\.locations \(id, org_id\)\s*\n\s*on delete set null/);
  });

  it('a Location Manager cannot create an unassigned employee', () => {
    // is_location_manager_for is false for a NULL location, which is what makes
    // the INSERT policy refuse it.
    const fn = sqlCode.slice(sqlCode.indexOf('function public.is_location_manager_for'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).toMatch(/p_location_id is not null/);
  });

  it('the write policies do NOT reuse the read helper, which would widen four roles', () => {
    // can_access_employee returns true for every organisation-wide role, and
    // line_manager / investigator / legal_reviewer / auditor cannot write
    // employees. Using it in a WITH CHECK would hand them the privilege.
    const insertPolicy = sqlCode.slice(sqlCode.indexOf('create policy employee_records_insert_scoped'));
    const check = insertPolicy.slice(0, insertPolicy.indexOf(';'));
    expect(check).toMatch(/is_location_manager_for/);
    expect(check).not.toMatch(/can_access_employee/);
  });

  it('a Location Manager cannot move an employee between scopes', () => {
    const fn = sqlCode.slice(sqlCode.indexOf('function public.protect_employee_location_column'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).toMatch(/new\.location_id is distinct from old\.location_id/);
    expect(body).toMatch(/is_hr_in_org/);
  });

  it('the legacy free-text column is neither dropped nor auto-synchronised', () => {
    expect(sqlCode).not.toMatch(/drop column\s+(if exists\s+)?location\b(?!_id)/i);
    // And the app stopped writing it rather than keeping a shadow copy in step.
    expect(appCode).not.toMatch(/jobTitle: editJobTitle, startDate: editStartDate, location:/);
  });

  it('no automatic mapping from legacy text to a canonical UUID exists anywhere', () => {
    // The temptation is real: all five of Compass LTD's legacy values match a
    // canonical location name exactly. Nothing may act on that.
    expect(sqlCode).not.toMatch(/lower\(trim\(l\.name\)\)\s*=\s*lower\(trim\(e?\.?location\)\)/i);
    expect(appCode).not.toMatch(/locations\.find\([^)]*\.name[^)]*===[^)]*\.location\b/);
    expect(sqlCode).not.toMatch(/update public\.employee_records\s+set location_id\s*=\s*\(?\s*select/i);
  });

  it('employee filtering is not done client-side', () => {
    // People must render what the database returned. A location predicate in JS
    // would be a second copy of the rule, and the weaker copy is the one users
    // would trust.
    const people = readFileSync('src/screens/PeopleScreen.jsx', 'utf8');
    const code = people.split('\n').filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
    // The only location filter permitted here is the HR-only "no location yet"
    // view, which narrows what HR already sees rather than granting anything.
    const filters = code.match(/\.filter\(p\s*=>\s*!p\.locationId\)/g) || [];
    expect(filters.length).toBeLessThanOrEqual(2);
    expect(code).not.toMatch(/authorisedLocationIds\.includes\(p\.locationId\)/);
  });

  it('an employee write is conditional on the version it was read at', () => {
    expect(appCode).toMatch(/query\.eq\('updated_at', existing\.updatedAt\)|query = query\.eq\('updated_at', existing\.updatedAt\)/);
  });

  it('a silent RLS refusal on write is reported, not treated as success', () => {
    // RLS filters the row rather than raising, so zero rows affected and no error
    // is what a denial looks like. Verified against the live database.
    //
    // Asserted per FUNCTION, not across the file: update and delete contain the
    // identical check, so a file-wide match passes while one of them is gutted.
    const fnBody = (marker) => {
      const from = appCode.indexOf(marker);
      expect(from, marker).toBeGreaterThan(-1);
      const rest = appCode.slice(from);
      return rest.slice(0, rest.indexOf('\n  };'));
    };
    ['const updateEmployeeRecordById', 'const deleteEmployeeRecord'].forEach(m => {
      expect(fnBody(m), m).toMatch(/if\(!data \|\| data\.length === 0\)/);
    });
    // And both must reload rather than leave the screen asserting a change the
    // database refused.
    ['const updateEmployeeRecordById', 'const deleteEmployeeRecord'].forEach(m => {
      expect(fnBody(m), m).toMatch(/loadEmployeeRecords\(\)/);
    });
  });

  it('creating an employee at a location is an INSERT, so a duplicate name cannot merge', () => {
    // E1.5 proved this for createEmployeeAtLocation. That function has since
    // become THE one manual creation operation for every surface (New Case,
    // Intake, People, Concerns, Wellbeing, reconciliation) and moved into
    // lib/employeeWrites.js, so the guarantee is asserted where it now lives.
    // The behavioural half — a duplicate name is refused and the existing
    // person is untouched — is in employeeCreation.test.jsx.
    const w = readFileSync('src/lib/employeeWrites.js', 'utf8')
      .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(w).toMatch(/\.insert\(/);
    expect(w).not.toMatch(/\.upsert\(/);
    expect(w).not.toMatch(/onConflict/);
    expect(w).toMatch(/23505/);
  });

  it('the new audit actions cannot be forged through the generic audit RPC', () => {
    const fn = sqlCode.slice(sqlCode.indexOf('function public.log_audit_event'));
    const reserved = fn.slice(fn.indexOf('p_action in ('), fn.indexOf(') then'));
    ['Employee location assigned', 'Employee location changed', 'Employee location cleared']
      .forEach(a => expect(reserved).toContain(a));
  });

  it('the audit row records the employee, and both the old and new location', () => {
    const fn = sqlCode.slice(sqlCode.indexOf('function public.set_employee_location'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).toMatch(/insert into public\.audit_log/);
    expect(body).toMatch(/employee_id/);
    expect(body).toMatch(/v_emp\.location_id/);
    expect(body).toMatch(/p_location_id/);
  });

  it('the assignment operation rejects a location from another organisation', () => {
    // The composite FK would also catch this, but defence in depth is the point:
    // failing here produces an explanation instead of a constraint-violation
    // string, and losing the check must not be silent.
    const fn = sqlCode.slice(sqlCode.indexOf('function public.set_employee_location'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).toMatch(/l\.id = p_location_id and l\.org_id = v_emp\.org_id/);
  });

  it('the assignment operation is HR-only and derives the org from the row', () => {
    const fn = sqlCode.slice(sqlCode.indexOf('function public.set_employee_location'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    expect(body).toMatch(/is_hr_role\(v_member\.role\)/);
    // org_id comes from the employee row, never from a parameter.
    expect(body).toMatch(/org_id = v_emp\.org_id/);
    expect(body).not.toMatch(/p_org_id/);
  });

  it('a missing employee is indistinguishable from an unauthorised one', () => {
    const fn = sqlCode.slice(sqlCode.indexOf('function public.set_employee_location'));
    const body = fn.slice(0, fn.indexOf('$$;'));
    const notFound = body.slice(body.indexOf('Employee record not found'));
    expect(notFound.slice(0, 120)).toMatch(/42501/);
  });
});
