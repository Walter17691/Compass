import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  CORRECT_RESULT, MIN_CORRECTION_REASON, correctionReasonIsUsable,
  correctCaseEmployeeWrite, describeCorrectionOutcome,
} from '../lib/reconciliationWrites.js';
import { canCorrectEmployeeIdentity, isHrRole, ROLES } from '../lib/roles.js';

// Phase E0.6 Part A — the correction operation.
//
// Reconciliation answers "who is this unattributed record about?" from nothing.
// Correction OVERRULES a colleague's recorded decision and moves a case between
// two real people's Employee Files. Everything here defends that distinction.

const sql = readFileSync('supabase/employee_identity_correction_2026-09-26.sql', 'utf8');
// Comment-stripped, so prohibitions are asserted against executable statements
// rather than against the header that legitimately describes them.
const sqlCode = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
const section = readFileSync('src/screens/settings/IdentityReconciliationSection.jsx', 'utf8');
const sectionCode = section.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const app = readFileSync('src/App.jsx', 'utf8');
const appCode = app.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const settings = readFileSync('src/screens/SettingsScreen.jsx', 'utf8');

// The function body alone — end-anchored on CODE, never left to run to EOF,
// because log_audit_event is re-created later in this same file.
const fn = sqlCode.slice(
  sqlCode.indexOf('function public.correct_case_employee'),
  sqlCode.indexOf('grant execute on function public.correct_case_employee')
);
const guard = sqlCode.slice(
  sqlCode.indexOf('function public.cases_employee_parentage_guard'),
  sqlCode.indexOf('function public.correct_case_employee')
);

const rpcClient = (error = null) => {
  const rpc = vi.fn().mockResolvedValue({ error });
  return { client: { rpc }, rpc };
};
const GOOD_REASON = 'Reconciled to the wrong John Smith; confirmed with the line manager.';

// ═══════════════════════════════════════════════════════════════════════════
describe('HR DIRECTOR only — narrower than reconciliation, deliberately', () => {
  it('the database checks the role literally, NOT via is_hr_role()', () => {
    // is_hr_role() would admit hr_manager. The whole point is that it must not.
    expect(fn).toContain("if v_member.role <> 'hr_director' then");
    expect(fn).toContain('Only an HR Director can correct an established employee identity');
    expect(fn).not.toContain('is_hr_role');
  });

  it('the client predicate admits hr_director and nothing else', () => {
    ROLES.forEach(({ id }) => {
      expect(canCorrectEmployeeIdentity(id)).toBe(id === 'hr_director');
    });
    // Strictly narrower than the reconciliation gate.
    expect(isHrRole('hr_manager')).toBe(true);
    expect(canCorrectEmployeeIdentity('hr_manager')).toBe(false);
    [null, undefined, '', 'HR_DIRECTOR', 'admin'].forEach(r =>
      expect(canCorrectEmployeeIdentity(r)).toBe(false));
  });

  it('platform admins are not consulted at all', () => {
    // Authorisation runs entirely through org_members. A platform_admins row
    // cannot grant this because the function never looks at that table.
    expect(sqlCode).not.toContain('platform_admin');
    expect(fn).toContain('from public.org_members');
  });

  it('org_id is derived from the case row, never a parameter', () => {
    expect(fn).toContain('public.correct_case_employee');
    expect(fn).not.toContain('p_org_id');
    expect(fn).toContain('where org_id = v_case.org_id and user_id = auth.uid()');
  });

  it('authentication is checked before anything is read', () => {
    const authAt = fn.indexOf('auth.uid() is null');
    const readAt = fn.indexOf('select * into v_case');
    expect(authAt).toBeGreaterThan(-1);
    expect(authAt).toBeLessThan(readAt);
    expect(sqlCode).toContain('revoke all on function public.correct_case_employee(uuid, uuid, text) from anon, public;');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the fill-once invariant is not weakened globally', () => {
  it('UUID → NULL stays blocked for EVERYONE, including the correction', () => {
    // The brief is explicit: do not implement an ordinary "unlink".
    // NOTE the doubled apostrophe: plpgsql escapes it as '' inside a literal.
    expect(guard).toContain("A case''s employee cannot be cleared once set");
    // Exposed by mutation testing: asserting only the MESSAGE cannot detect the
    // branch being disabled — `if false and <cond> then raise ...` keeps the
    // message and loses the guarantee. So the CONDITION is asserted exactly, with
    // nothing permitted in front of it.
    expect(guard).toMatch(/\n\s*if old\.employee_id is not null and new\.employee_id is null then\n/);
    expect(guard).not.toMatch(/if\s+\w+\s+and\s+old\.employee_id is not null and new\.employee_id is null/);
    // The clearing branch carries no exemption check at all — sliced from the
    // clearing test to the start of the moving test, both anchored on CODE.
    const clearing = guard.slice(guard.indexOf('new.employee_id is null then'),
                                 guard.indexOf('correcting :='));
    expect(clearing.length).toBeGreaterThan(20);
    expect(clearing).not.toContain('correcting');
    expect(clearing).not.toContain('current_setting');
    expect(fn).not.toContain('employee_id = null');
    expect(fn).not.toContain('set employee_id = null');
  });

  it('UUID → different UUID is blocked unless THIS row is being corrected', () => {
    expect(guard).toContain("current_setting('compass.correcting_case_employee', true)");
    // Bound to the row: a boolean flag would unlock every row in the transaction.
    expect(guard).toContain('correcting <> old.id::text');
    expect(guard).toContain('A case cannot be moved between employees');
  });

  it('tenancy is checked OUTSIDE the exemption', () => {
    // A correction may move a case between employees, never between orgs.
    const tenancy = guard.slice(guard.indexOf('select er.org_id into employee_org'),
                                guard.indexOf("if tg_op = 'UPDATE' then"));
    expect(tenancy).toContain('employee_org <> new.org_id');
    expect(tenancy).not.toContain('correcting');
  });

  it('the exemption is transaction-local and closed immediately after the write', () => {
    // is_local => true, so it cannot leak into a later statement or request.
    expect(fn).toContain("set_config('compass.correcting_case_employee', p_case_id::text, true)");
    // Reset on BOTH the success and the conflict path — not just success.
    expect((fn.match(/set_config\('compass\.correcting_case_employee', '', true\)/g) || []).length).toBe(2);
    // And specifically the one AFTER `end if;`, i.e. the success path — a
    // mutation that deletes only that line must fail this.
    expect(fn).toMatch(/end if;\s*\n\s*perform set_config\('compass\.correcting_case_employee', '', true\);/);
    // The reset follows the UPDATE, so the door does not stay open for a 2nd row.
    expect(fn.indexOf("set_config('compass.correcting_case_employee', '', true)"))
      .toBeGreaterThan(fn.indexOf('update public.cases'));
  });

  it('no client can set that GUC', () => {
    // set_config lives in pg_catalog, which PostgREST does not expose for RPC,
    // and no function in public wraps it except this one — verified against the
    // live database during this phase, not assumed.
    const others = sqlCode.match(/set_config/g) || [];
    expect(others.length).toBe(3);   // one set + two resets, all inside correct_case_employee
    expect(guard).not.toContain('set_config');  // the trigger only ever READS it
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('preconditions the database enforces', () => {
  it('a meaningful reason is required', () => {
    expect(fn).toContain('v_reason := btrim(coalesce(p_reason, \'\'))');
    expect(fn).toContain(`length(v_reason) < ${MIN_CORRECTION_REASON}`);
    expect(fn).toContain('A correction requires a reason');
  });

  it('there must already BE an identity to correct', () => {
    expect(fn).toContain('if v_case.employee_id is null then');
    expect(fn).toContain('Reconcile it instead');
  });

  it('correcting to the same employee is refused', () => {
    expect(fn).toContain('if v_case.employee_id = p_new_employee_id then');
    expect(fn).toContain('already attributed to that employee');
  });

  it('the target employee must exist and be in the same organisation', () => {
    expect(fn).toContain('if v_new.id is null then');
    expect(fn).toContain('if v_new.org_id <> v_case.org_id then');
    expect(fn).toContain('Cannot correct a case to an employee in another organisation');
  });

  it('the write is optimistic — it refuses if the identity moved underneath', () => {
    expect(fn).toContain('and employee_id = v_case.employee_id;');
    expect(fn).toContain("errcode = 'PT409'");
  });

  it('ONLY employee_id is assigned', () => {
    const assignments = fn.match(/set\s+employee_id\s*=\s*\S+/gi) || [];
    expect(assignments).toHaveLength(1);
    expect(assignments[0].replace(/\s+/g, ' ')).toBe('set employee_id = p_new_employee_id');
    const upd = fn.slice(fn.indexOf('update public.cases'), fn.indexOf('if not found'));
    ['employee_name', 'stage', 'case_type', 'outcome', 'meetings', 'evidence',
     'appeal_text', 'confidential', 'investigation_report'].forEach(col =>
      expect(upd).not.toContain(col));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('audit provenance records what it replaced', () => {
  it('the OLD display name is captured BEFORE the write', () => {
    // Otherwise the trail records a uuid nobody can read — and if that employee
    // is later deleted, the only human-readable trace of the original decision
    // is gone.
    expect(fn).toContain('select name into v_old_name from public.employee_records where id = v_case.employee_id;');
    expect(fn.indexOf('v_old_name')).toBeLessThan(fn.indexOf('update public.cases'));
  });

  it('old uuid, old name, new uuid, new name, historical name and reason are all recorded', () => {
    expect(fn).toContain("'Employee identity corrected'");
    expect(fn).toContain("format('employee %s (%L) -> %s (%L); historical name %L; reason: %s'");
    expect(fn).toContain('v_case.employee_id');
    expect(fn).toContain('coalesce(v_old_name');
    expect(fn).toContain('p_new_employee_id');
    expect(fn).toContain('v_reason');
    // Actor is server-derived.
    expect(fn).toContain('auth.uid()');
    expect(fn).toContain('coalesce(v_member.name');
  });

  it('no case narrative reaches the audit detail', () => {
    const ins = fn.slice(fn.indexOf('insert into public.audit_log'));
    ['v_case.description', 'v_case.outcome', 'v_case.investigation_report',
     'v_case.meetings', 'v_case.evidence', 'v_case.appeal_text'].forEach(f =>
      expect(ins).not.toContain(f));
  });

  it('the generic audit RPC cannot forge a correction', () => {
    const gen = sqlCode.slice(sqlCode.indexOf('function public.log_audit_event'));
    expect(gen).toContain("'Employee identity corrected'");
    expect(gen).toContain('can only be logged by its own authoritative function');
    // and every previously reserved action survives
    ['Case deleted', 'Employee identity reconciled', 'Appeal officer appointed',
     'Appeal officer revoked'].forEach(a => expect(gen).toContain(`'${a}'`));
  });

  it('the client does not audit the correction', () => {
    const handler = appCode.slice(appCode.indexOf('const correctCaseEmployee = async'),
                                 appCode.indexOf('const reconcileCaseEmployee = async'));
    expect(handler.length).toBeGreaterThan(100);
    expect(handler).not.toContain('audit(');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the write path', () => {
  it('passes case, employee and a trimmed reason', async () => {
    const { client, rpc } = rpcClient();
    const out = await correctCaseEmployeeWrite({
      supabase: client, caseId: 'c1', employeeId: 'e2', reason: `  ${GOOD_REASON}  `,
    });
    expect(out.result).toBe(CORRECT_RESULT.OK);
    expect(rpc).toHaveBeenCalledWith('correct_case_employee', {
      p_case_id: 'c1', p_new_employee_id: 'e2', p_reason: GOOD_REASON,
    });
  });

  it('refuses locally before the round trip when the input cannot be valid', async () => {
    const { client, rpc } = rpcClient();
    for (const args of [
      { caseId: 'c', employeeId: 'e', reason: '' },
      { caseId: 'c', employeeId: 'e', reason: 'typo' },
      { caseId: 'c', employeeId: 'e', reason: '          ' },
      { caseId: 'c', employeeId: null, reason: GOOD_REASON },
      { caseId: null, employeeId: 'e', reason: GOOD_REASON },
    ]) {
      const out = await correctCaseEmployeeWrite({ supabase: client, ...args });
      expect(out.result).toBe(CORRECT_RESULT.INVALID);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('the local reason threshold matches the database, and the database wins', () => {
    expect(MIN_CORRECTION_REASON).toBe(10);
    expect(correctionReasonIsUsable('a'.repeat(10))).toBe(true);
    expect(correctionReasonIsUsable('a'.repeat(9))).toBe(false);
    expect(correctionReasonIsUsable('   ' + 'a'.repeat(9) + '   ')).toBe(false);
    expect(correctionReasonIsUsable(null)).toBe(false);
    expect(sqlCode).toContain(`length(v_reason) < ${MIN_CORRECTION_REASON}`);
  });

  it('re-checks NO authorisation rule of its own', () => {
    const writes = readFileSync('src/lib/reconciliationWrites.js', 'utf8');
    const block = writes.slice(writes.indexOf('export const CORRECT_RESULT'));
    expect(block).not.toContain('hr_director');
    expect(block).not.toContain('org_members');
    expect(block).not.toContain('.update(');
  });

  it('a concurrent change is reported as such, not as the user\'s error', () => {
    const said = describeCorrectionOutcome({ result: CORRECT_RESULT.CHANGED_UNDERNEATH });
    expect(said.tone).toBe('error');
    expect(said.message).toContain('changed while you were correcting it');
    expect(said.message).not.toMatch(/you (did|entered|chose)/i);
  });

  it('success states plainly that both decisions stay in the audit history', () => {
    const said = describeCorrectionOutcome({ result: CORRECT_RESULT.OK }, 'Dana Keys');
    expect(said.tone).toBe('success');
    expect(said.message).toContain('Dana Keys');
    expect(said.message).toContain('audit history');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('correction UX', () => {
  it('HR Manager sees the resolved identity but NOT the control', () => {
    // canCorrect is a separate prop from canCreateEmployee (which is HR), so the
    // two authorities cannot be conflated by a later edit.
    expect(sectionCode).toContain('{canCorrect && !correcting && (');
    expect(sectionCode).toContain('Correct employee identity');
    expect(sectionCode).toContain('canCorrectIdentity = false, correctCaseEmployee,');
    expect(sectionCode).toContain('canCorrect={canCorrectIdentity}');
    // Gated on the director predicate at the App boundary.
    expect(appCode).toContain('canCorrectIdentity: canCorrectEmployeeIdentity(member?.role)');
    expect(settings).toContain('canCorrectIdentity={reconciliation.canCorrectIdentity}');
  });

  it('it does NOT look like an ordinary edit', () => {
    const resolved = sectionCode.slice(sectionCode.indexOf('if (cls.state === RECONCILIATION.RESOLVED)'),
                                       sectionCode.indexOf('return (\n    <div style={{ ...PANEL, marginTop: 8 }}>'));
    expect(resolved).not.toContain('>Edit<');
    expect(resolved).not.toContain('Change employee<');
    expect(resolved).toContain('Correct employee identity');
  });

  it('shows current employee, new employee and a reason field', () => {
    expect(sectionCode).toContain('Current employee:');
    expect(sectionCode).toContain('label="New employee"');
    expect(sectionCode).toContain('Reason for the correction');
    expect(sectionCode).toContain('<textarea');
  });

  it('requires an explicit confirmation naming BOTH people', () => {
    expect(sectionCode).toContain('Change this case from');
    expect(sectionCode).toContain('Confirm correction');
    // Both names, with employee numbers where held, so two same-named people
    // are distinguishable in the confirmation itself.
    expect(sectionCode).toContain('emp?.employeeNumber ? ` #${emp.employeeNumber}` : ""');
    expect(sectionCode).toContain('target.employeeNumber ? ` #${target.employeeNumber}` : ""');
  });

  it('explains the consequence in the reviewer\'s terms', () => {
    expect(sectionCode).toContain('This changes which Employee File this historical case belongs to');
    expect(sectionCode).toContain('remain in the audit history');
  });

  it('confirm is disabled until a different employee AND a real reason exist', () => {
    expect(sectionCode).toContain('disabled={busy || !target || !correctionReasonIsUsable(reason)}');
    // The new employee comes from the ONE shared selector, not a new picker.
    expect(sectionCode).toContain('inputId={`correct-${legacyCase.id}`}');
    expect(sectionCode).toContain('<EmployeeSelect');
  });

  it('no bulk correction exists', () => {
    ['correctAll', 'Correct all', 'bulkCorrect'].forEach(t => {
      expect(sectionCode).not.toContain(t);
      expect(appCode).not.toContain(t);
    });
    expect(sqlCode).not.toContain('p_case_ids');
    expect(sqlCode).not.toContain('uuid[]');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the migration changes nothing else', () => {
  it('no DDL on any table, policy or trigger', () => {
    ['alter table', 'create table', 'drop table', 'create policy', 'drop policy',
     'alter policy', 'drop trigger', 'create trigger'].forEach(ddl =>
      expect(sqlCode.toLowerCase()).not.toContain(ddl));
  });

  it('no data is written by applying it', () => {
    // The only UPDATE is inside the function body, parameterised by p_case_id.
    expect(sqlCode).not.toContain('insert into public.cases');
    expect(sqlCode).not.toContain('insert into public.employee_records');
    expect(sqlCode).not.toMatch(/join\s+public\.employee_records[\s\S]{0,120}on[\s\S]{0,80}name/i);
  });

  it('reconciliation itself is untouched', () => {
    expect(sqlCode).not.toContain('function public.reconcile_case_employee');
  });
});
