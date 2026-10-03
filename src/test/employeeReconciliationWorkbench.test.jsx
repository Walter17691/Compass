import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import {
  RECONCILE_RESULT, ALREADY_RECONCILED_CODE, isAlreadyReconciled,
  reconcileCaseEmployeeWrite, describeReconcileOutcome, shouldReloadAfter,
} from '../lib/reconciliationWrites.js';
import { compileSubjectData } from '../lib/dsarCompile.js';

// Phase E0.5B — the reconciliation workbench and its write contract.
//
// The state model itself is proven in employeeReconciliation.test.js. This file
// covers the WRITE, the UI's refusal to decide, the DSAR canonicalisation, and
// the migration's promise not to reconcile anything on deployment.

const app = readFileSync('src/App.jsx', 'utf8');
const appCode = app.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const section = readFileSync('src/screens/settings/IdentityReconciliationSection.jsx', 'utf8');
const sectionCode = section.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
const settings = readFileSync('src/screens/SettingsScreen.jsx', 'utf8');
const sql = readFileSync('supabase/employee_reconciliation_2026-09-26.sql', 'utf8');
// Comment-stripped SQL, so prohibitions are asserted against executable
// statements and not against the header that legitimately DESCRIBES them.
const sqlCode = sql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
const writes = readFileSync('src/lib/reconciliationWrites.js', 'utf8');

const rpcClient = (error = null) => {
  const rpc = vi.fn().mockResolvedValue({ error });
  return { client: { rpc }, rpc };
};

// ═══════════════════════════════════════════════════════════════════════════
describe('5/6. case-level reconciliation calls the privileged RPC with two ids', () => {
  it('6. a successful write passes the case id and the employee UUID', async () => {
    const { client, rpc } = rpcClient();
    const out = await reconcileCaseEmployeeWrite({ supabase: client, caseId: 'case-1', employeeId: 'uuid-john-1' });
    expect(out.result).toBe(RECONCILE_RESULT.OK);
    expect(rpc).toHaveBeenCalledWith('reconcile_case_employee', {
      p_case_id: 'case-1', p_employee_id: 'uuid-john-1',
    });
  });

  it('5. a missing employee id is refused before any call is made', async () => {
    const { client, rpc } = rpcClient();
    for (const args of [{ caseId: 'c', employeeId: null }, { caseId: null, employeeId: 'e' }, {}]) {
      const out = await reconcileCaseEmployeeWrite({ supabase: client, ...args });
      expect(out.result).toBe(RECONCILE_RESULT.INVALID);
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it('the client re-checks NO authorisation rule of its own', () => {
    // A second, client-side copy of an authorisation rule is a rule that can
    // drift from the real one — and the weaker copy always wins in someone's
    // head. Authority lives in the RPC alone.
    expect(writes).not.toContain('is_hr_role');
    expect(writes).not.toContain('hr_director');
    expect(writes).not.toContain('hr_manager');
    expect(writes).not.toContain('org_members');
    expect(writes).not.toContain('case_access');
    // And it never writes to cases directly.
    expect(writes).not.toContain(".from('cases')");
    expect(writes).not.toContain('.update(');
  });

  it('a thrown transport error is a refusal, not an unhandled rejection', async () => {
    const client = { rpc: vi.fn().mockRejectedValue(new Error('network down')) };
    const out = await reconcileCaseEmployeeWrite({ supabase: client, caseId: 'c', employeeId: 'e' });
    expect(out.result).toBe(RECONCILE_RESULT.REFUSED);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('12. an already-reconciled case is never silently overwritten', () => {
  it('12. the PT409 SQLSTATE is recognised as a concurrent reconciliation', async () => {
    const { client } = rpcClient({ code: ALREADY_RECONCILED_CODE, message: 'whatever' });
    const out = await reconcileCaseEmployeeWrite({ supabase: client, caseId: 'c', employeeId: 'e' });
    expect(out.result).toBe(RECONCILE_RESULT.ALREADY_RECONCILED);
  });

  it('12. it is also recognised by MESSAGE, not only by code', () => {
    // Supabase surfaces SQLSTATEs inconsistently across transports. Losing this
    // distinction would turn "somebody else already decided" into a generic
    // failure, and the user would retry rather than refresh.
    expect(isAlreadyReconciled({ code: 'PT409' })).toBe(true);
    expect(isAlreadyReconciled({ message: 'This case has already been reconciled to an employee by someone else.' })).toBe(true);
    expect(isAlreadyReconciled({ code: '42501', message: 'permission denied' })).toBe(false);
    expect(isAlreadyReconciled(null)).toBe(false);
  });

  it('12. the message tells the truth about whose decision stands', () => {
    const said = describeReconcileOutcome({ result: RECONCILE_RESULT.ALREADY_RECONCILED });
    expect(said.tone).toBe('error');
    expect(said.message).toContain('already reconciled by someone else');
    // It must not read as the user's mistake, and must not claim WE saved it.
    expect(said.message).not.toMatch(/you (did|entered|chose)/i);
    expect(said.message.toLowerCase()).not.toContain('now belongs to');
  });

  it('12. the view is reloaded after a concurrent reconciliation, not left stale', () => {
    expect(shouldReloadAfter(RECONCILE_RESULT.ALREADY_RECONCILED)).toBe(true);
    expect(shouldReloadAfter(RECONCILE_RESULT.OK)).toBe(true);
    // A plain refusal changed nothing, so there is nothing to reload.
    expect(shouldReloadAfter(RECONCILE_RESULT.REFUSED)).toBe(false);
    expect(shouldReloadAfter(RECONCILE_RESULT.INVALID)).toBe(false);
  });

  it('12. the database makes the check and the write ONE atomic statement', () => {
    // A read-then-update would leave a window in which another administrator
    // reconciles the same case between the two statements — and the loser would
    // overwrite the winner. The guard is in the WHERE clause.
    expect(sqlCode).toContain('update public.cases');
    expect(sqlCode).toContain('where id = p_case_id');
    expect(sqlCode).toContain('and employee_id is null;');
    expect(sqlCode).toContain('if not found then');
    expect(sqlCode).toContain("errcode = 'PT409'");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('13/14. reconciliation changes WHO, never WHAT HAPPENED', () => {
  it('13/14. the UPDATE assigns employee_id and nothing else', () => {
    const upd = sqlCode.slice(sqlCode.indexOf('update public.cases'), sqlCode.indexOf("errcode = 'PT409'"));
    expect(upd).toContain('set employee_id = p_employee_id');
    // Every column the brief lists as untouchable.
    ['employee_name', 'stage', 'case_type', 'outcome', 'meetings', 'evidence',
     'investigation_report', 'appeal_text', 'confidential', 'next_steps',
     'hr_review_status', 'disciplinary_officer'].forEach(col => {
      expect(upd).not.toContain(col);
    });
  });

  it('13. the historical display name is explicitly NOT rewritten', () => {
    // "John A. Smith" stays "John A. Smith" even when reconciled to an employee
    // recorded as "John Smith". The uuid establishes identity; the stored name
    // remains a point-in-time snapshot.
    expect(sqlCode).not.toContain('set employee_name');
    expect(sqlCode).not.toMatch(/employee_name\s*=\s*v_employee\.name/);
    // and the workbench says so where a reviewer can see it
    expect(sectionCode).toContain('Recorded on this case as');
  });

  it('14. the migration contains no DDL on any workflow object', () => {
    ['alter table', 'drop table', 'create table', 'drop policy', 'create policy',
     'alter policy', 'drop trigger'].forEach(ddl => {
      expect(sqlCode.toLowerCase()).not.toContain(ddl);
    });
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('15. every reconciliation is auditable, and the action is unforgeable', () => {
  it('15. the audit row is written in the same transaction as the assignment', () => {
    expect(sqlCode).toContain('insert into public.audit_log');
    expect(sqlCode).toContain("'Employee identity reconciled'");
    // Provenance: historical name snapshot, chosen uuid, chosen display name.
    expect(sqlCode).toContain('historical name %L -> employee %s (%L); single case');
    expect(sqlCode).toContain('v_case.employee_name');
    expect(sqlCode).toContain('p_employee_id');
    // Actor is server-derived, never client-supplied.
    expect(sqlCode).toContain('auth.uid()');
    expect(sqlCode).toContain('coalesce(v_member.name');
  });

  it('15. no case narrative is written into the audit detail', () => {
    // End-anchored on the function's own terminator, NOT left to run to EOF:
    // log_audit_event is re-created further down this file and legitimately
    // mentions v_case.outcome, so an unbounded slice asserts against the wrong
    // function entirely.
    const ins = sqlCode.slice(sqlCode.indexOf('insert into public.audit_log'),
                              sqlCode.indexOf('grant execute on function public.reconcile_case_employee'));
    ['v_case.description', 'v_case.outcome', 'v_case.investigation_report',
     'v_case.meetings', 'v_case.evidence', 'v_case.appeal_text'].forEach(f => {
      expect(ins).not.toContain(f);
    });
  });

  it('15. the generic audit RPC is BLOCKED from logging this action', () => {
    // Exactly as it already refuses 'Case deleted' and the appeal-officer
    // actions: an identity decision must be attributable to the function that
    // actually performed it.
    const gen = sqlCode.slice(sqlCode.indexOf('function public.log_audit_event'));
    expect(gen).toContain("'Employee identity reconciled'");
    expect(gen).toContain('can only be logged by its own authoritative function');
    // The reserved list keeps every prior entry.
    ['Case deleted', 'Appeal officer appointed', 'Appeal officer replaced',
     'Appeal officer revoked'].forEach(a => expect(gen).toContain(`'${a}'`));
  });

  it('15. the client does NOT audit — the database owns the record', () => {
    const handler = appCode.slice(appCode.indexOf('const reconcileCaseEmployee = async'),
                                 appCode.indexOf('const employeeRecordPayload'));
    expect(handler.length).toBeGreaterThan(100);
    expect(handler).not.toContain('audit(');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('10/11. permission model', () => {
  it('10. the RPC refuses a non-HR actor', () => {
    expect(sqlCode).toContain('if not public.is_hr_role(v_member.role) then');
    expect(sqlCode).toContain('Only an HR Director or HR Manager can reconcile employee identity');
    expect(sqlCode).toContain("errcode = '42501'");
  });

  it('10. the RPC checks org membership, HR role AND case access — all three', () => {
    expect(sqlCode).toContain('Not a member of this organisation');
    expect(sqlCode).toContain('You do not have access to this case');
    expect(sqlCode).toContain('case_access_level = 1');
    expect(sqlCode).toContain('from public.case_access ca');
  });

  it('10. org_id is derived from the case row, never taken as a parameter', () => {
    // A caller-supplied org_id is a parameter the caller can lie about.
    expect(sqlCode).toContain('public.reconcile_case_employee(\n  p_case_id uuid,\n  p_employee_id uuid\n)');
    // Scoped to THIS function: log_audit_event legitimately takes p_org_id.
    const fn = sqlCode.slice(sqlCode.indexOf('function public.reconcile_case_employee'),
                             sqlCode.indexOf('grant execute on function public.reconcile_case_employee'));
    expect(fn).not.toContain('p_org_id');
    expect(sqlCode).toContain('where org_id = v_case.org_id and user_id = auth.uid()');
  });

  it('9. a cross-org target employee is rejected', () => {
    expect(sqlCode).toContain('if v_employee.org_id <> v_case.org_id then');
    expect(sqlCode).toContain('Cannot reconcile a case to an employee in another organisation');
  });

  it('11. the workbench tab is HR-only, and deep links cannot bypass it', () => {
    expect(settings).toContain('...(isHR?[{id:"identity-reconciliation", label:"Identity reconciliation"}]:[])');
    // Double-gated in the render branch, matching organisation/employee-records/
    // automations, so an initialSection deep link can't reach it.
    expect(settings).toContain('{active==="identity-reconciliation"&&isHR&&<IdentityReconciliationSection');
  });

  it('11. authenticated-only: an unauthenticated caller is refused first', () => {
    const fn = sqlCode.slice(sqlCode.indexOf('function public.reconcile_case_employee'));
    const authCheck = fn.indexOf('auth.uid() is null');
    const anyQuery = fn.indexOf('select * into v_case');
    expect(authCheck).toBeGreaterThan(-1);
    expect(authCheck).toBeLessThan(anyQuery);
    expect(sqlCode).toContain('revoke all on function public.reconcile_case_employee(uuid, uuid) from anon, public;');
    expect(sqlCode).toContain('grant execute on function public.reconcile_case_employee(uuid, uuid) to authenticated;');
  });

  it('11. security definer with a pinned search_path', () => {
    const fn = sqlCode.slice(sqlCode.indexOf('function public.reconcile_case_employee'),
                             sqlCode.indexOf('grant execute on function public.reconcile_case_employee'));
    expect(fn).toContain('security definer');
    expect(fn).toContain("set search_path to 'public'");
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('8. no batch action exists, and no machine may decide', () => {
  it('8. there is no batch / assign-all control anywhere in the workbench', () => {
    ['Reconcile all', 'reconcileAll', 'Assign all', 'assignAll', 'selectAll',
     'Accept all', 'acceptAll', 'reconcileGroup', 'assignGroup'].forEach(t => {
      expect(sectionCode).not.toContain(t);
    });
    expect(appCode).not.toContain('reconcileAll');
  });

  it('8. the RPC takes ONE case id — a batch is not expressible against it', () => {
    expect(sqlCode).not.toContain('uuid[]');
    expect(sqlCode).not.toContain('p_case_ids');
    expect(sqlCode).toContain('p_case_id uuid');
  });

  it('8. no candidate is pre-selected, pre-checked or defaulted', () => {
    // Every confirm button names the person and requires a click.
    expect(sectionCode).toContain('Confirm this is ${emp.name}');
    expect(sectionCode).toContain('useState(null)');
    // The manual selector starts empty and gates its own confirm.
    expect(sectionCode).toContain('value={manualId}');
    expect(sectionCode).toContain('{manualId && (');
    // No autoselect / first-match shortcuts.
    ['autoSelect', 'candidates[0]', 'defaultValue', 'preselect'].forEach(t => {
      expect(sectionCode).not.toContain(t);
    });
  });

  it('7. grouping is presented to the user as NOT identity', () => {
    expect(sectionCode).toContain('That does not make them the same');
    expect(sectionCode).toContain('confirm each one separately');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('7. employee creation is explicit and never automatic', () => {
  it('7. creating an employee requires a confirmation dialog', () => {
    const fn = appCode.slice(appCode.indexOf('const createEmployeeForReconciliation'),
                             appCode.indexOf('const reconcileCaseEmployee'));
    expect(fn.length).toBeGreaterThan(100);
    expect(fn).toContain('await confirmDialog(');
    expect(fn).toContain('if(!ok) return;');
    // Migrated onto the canonical INSERT. It was an UPSERT on (org_id, name),
    // so "create" could silently UPDATE a different person of the same name.
    expect(fn).toContain('createEmployee(trimmed, null, {})');
    expect(fn).not.toContain('createEmployeeRecord');
    // Creating does NOT link any case — that stays a separate decision.
    expect(fn).toContain('It does not link any case to them');
    expect(fn).not.toContain('reconcileCaseEmployee');
  });

  it('7. nothing creates an employee merely because there is no match', () => {
    expect(sectionCode).not.toContain('createEmployeeRecord');
    expect(sqlCode).not.toContain('insert into public.employee_records');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('16/17/18. DSAR canonicalisation', () => {
  const JOHN_1 = { id: 'uuid-john-1', name: 'John Smith' };
  const JOHN_2 = { id: 'uuid-john-2', name: 'John Smith' };

  it('16. a canonical employee does NOT absorb an unresolved same-name case', () => {
    // THE transition rule. Case A is confirmed theirs; case B merely shares the
    // name and has never been confirmed. Including B is how one person's package
    // comes to contain another person's history.
    const cases = [
      { id: 'A', employeeName: 'John Smith', employeeId: 'uuid-john-1', stage: 'open', caseType: 'misconduct' },
      { id: 'B', employeeName: 'John Smith', employeeId: null, stage: 'open', caseType: 'attendance' },
    ];
    const out = compileSubjectData('John Smith', { canonicalEmployeeId: 'uuid-john-1', cases, employeeRecords: [JOHN_1] });
    expect(out.cases.map(c => c.id)).toEqual(['A']);
    expect(out.caseIdentityBasis).toBe('employee_id');
    // ...and B is reported, so exclusion is never mistaken for absence.
    expect(out.unreconciledSameNameCount).toBe(1);
    expect(out.unreconciledSameNameCases[0].id).toBe('B');
  });

  it('16. the excluded bucket carries METADATA ONLY — no case content', () => {
    const cases = [
      { id: 'A', employeeName: 'John Smith', employeeId: 'uuid-john-1' },
      { id: 'B', employeeName: 'John Smith', employeeId: null, description: 'SECRET NARRATIVE',
        outcome: 'dismissal', evidence: [{ id: 'e1' }],
        // transcript is an ARRAY of utterances — verified as the shape of all
        // 890 embedded production meetings, so the fixture matches reality.
        meetings: [{ id: 'm1', record: 'SECRET', transcript: [{ speaker: 'X', text: 'SECRET' }] }] },
    ];
    const out = compileSubjectData('John Smith', { canonicalEmployeeId: 'uuid-john-1', cases, employeeRecords: [JOHN_1] });
    const bucket = JSON.stringify(out.unreconciledSameNameCases);
    expect(bucket).not.toContain('SECRET');
    expect(bucket).not.toContain('dismissal');
    expect(bucket).not.toContain('e1');
    // It may be somebody else's record, so only enough to find it is carried.
    expect(Object.keys(out.unreconciledSameNameCases[0]).sort())
      .toEqual(['caseType', 'createdAt', 'employeeName', 'id', 'stage']);
  });

  it('16. a same-name case belonging to a DIFFERENT employee is excluded and unnamed', () => {
    const cases = [
      { id: 'A', employeeName: 'John Smith', employeeId: 'uuid-john-1' },
      { id: 'C', employeeName: 'John Smith', employeeId: 'uuid-john-2' },
    ];
    const out = compileSubjectData('John Smith', { canonicalEmployeeId: 'uuid-john-1', cases, employeeRecords: [JOHN_1, JOHN_2] });
    expect(out.cases.map(c => c.id)).toEqual(['A']);
    expect(out.otherEmployeeSameNameCount).toBe(1);
    // Counted only — naming it would disclose the other person's record.
    expect(JSON.stringify(out)).not.toContain('"C"');
  });

  it('16. with NO canonical id the historical name-based behaviour is unchanged', () => {
    const cases = [
      { id: 'A', employeeName: 'John Smith', employeeId: 'uuid-john-1' },
      { id: 'B', employeeName: 'John Smith', employeeId: null },
    ];
    const out = compileSubjectData('John Smith', { cases, employeeRecords: [JOHN_1] });
    expect(out.cases.map(c => c.id).sort()).toEqual(['A', 'B']);
    expect(out.caseIdentityBasis).toBe('employee_name');
    expect(out.unreconciledSameNameCount).toBe(0);
  });

  it('the package states that non-case collections are still name-keyed', () => {
    // Only public.cases has employee_id. Saying so in the artefact keeps the
    // limitation visible to whoever reads the export later.
    const out = compileSubjectData('John Smith', { canonicalEmployeeId: 'uuid-john-1', cases: [], employeeRecords: [JOHN_1] });
    expect(out.nonCaseIdentityBasis).toBe('employee_name');
    expect(out.canonicalEmployeeId).toBe('uuid-john-1');
  });

  it('17/18. both unsafe identity states still fail closed', () => {
    // Unchanged from E0.5A: only RESOLVED may export.
    const ambiguous = compileSubjectData('John Smith', { cases: [], employeeRecords: [JOHN_1, JOHN_2] });
    expect(ambiguous.identityStatus).toBe('ambiguous');
    expect(ambiguous.identityRequiresReconciliation).toBe(true);

    const unreconciled = compileSubjectData('Nobody Known', { cases: [], employeeRecords: [JOHN_1] });
    expect(unreconciled.identityStatus).toBe('unreconciled');
    expect(unreconciled.identityRequiresReconciliation).toBe(true);

    const resolved = compileSubjectData('John Smith', { cases: [], employeeRecords: [JOHN_1] });
    expect(resolved.identityRequiresReconciliation).toBe(false);
  });

  it('roster matching is normalised, so RESOLVED cannot export an empty package', () => {
    // The identity GATE has always normalised. Exact matching here could
    // classify a subject RESOLVED while finding zero roster rows — exporting
    // nothing while reporting success. Fail-open by arithmetic.
    const padded = { id: 'uuid-dana', name: '  dana keys ' };
    const out = compileSubjectData('Dana Keys', { cases: [], employeeRecords: [padded] });
    expect(out.identityStatus).toBe('resolved');
    expect(out.employeeRecord).not.toBeNull();
    expect(out.canonicalEmployeeIds).toEqual(['uuid-dana']);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('25. deployment reconciles nothing', () => {
  it('25. the migration contains no historical data write of any kind', () => {
    // The only UPDATE in the file is inside the function body, guarded by
    // p_case_id — it runs when a human calls the RPC, never at apply time.
    // Counted, not pattern-negated. Both `=\s*[^p]` and `=\s*(?!p_employee_id)`
    // are satisfiable by backtracking `\s*` to zero width so the assertion
    // evaluates against the space — any `\s*` before a negation is defeatable
    // that way. Counting says exactly what is meant with nothing to backtrack.
    const assignments = sqlCode.match(/set\s+employee_id\s*=\s*\S+/gi) || [];
    expect(assignments).toHaveLength(1);
    expect(assignments[0].replace(/\s+/g, ' ')).toBe('set employee_id = p_employee_id');
    expect(sqlCode).not.toContain('insert into public.cases');
    expect(sqlCode).not.toContain('insert into public.employee_records');
    ['backfill', 'from public.employee_records e where lower'].forEach(t => {
      expect(sqlCode.toLowerCase()).not.toContain(t.toLowerCase());
    });
  });

  it('25. no bulk statement could reconcile by name', () => {
    // A join between cases and employee_records on name is the exact statement
    // this whole programme exists to prevent.
    expect(sqlCode).not.toMatch(/join\s+public\.employee_records[\s\S]{0,120}on[\s\S]{0,80}name/i);
    expect(sqlCode).not.toMatch(/employee_name\s*=\s*e\.name/i);
    expect(sqlCode).not.toContain('lower(btrim(');
  });

  it('25. correction/undo is documented as a GATE and not implemented', () => {
    expect(sql).toContain('PRODUCTION RECONCILIATION OF REAL CUSTOMER CASES MUST NOT BEGIN UNTIL A');
    expect(sql).toContain('correct_case_employee');
    // Designed, not shipped — and the fill-once trigger is not weakened.
    expect(sqlCode).not.toContain('correct_case_employee');
    expect(sqlCode).not.toContain('cases_employee_parentage_guard');
    expect(sqlCode).not.toContain('drop trigger');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('the stale-client interaction is documented where it is relied upon', () => {
  it('the measured updated_at behaviour is recorded, not assumed', () => {
    // Proven against the real database with a rolled-back transaction:
    // reconciliation does not bump updated_at, so the ordinary save's
    // optimistic guard still matches for a stale client; the fill-once trigger
    // is what refuses that write (SQLSTATE 23514). Pinned here so nobody
    // "simplifies" the reload away on the assumption that updated_at protects it.
    expect(writes).toContain('does NOT bump');
    expect(writes).toContain('23514');
    expect(appCode).toContain('if(shouldReloadAfter(outcome.result)) await loadCasesFromDB();');
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('compensating control for lost lint coverage', () => {
  it('the cases-loading effect still exists, though lint no longer reports it', () => {
    // Adding a second, non-effect caller of loadCasesFromDB makes the React
    // Compiler stop reporting react-hooks/set-state-in-effect on this effect —
    // proven by probe: removing the new caller restores the error at the same
    // byte-identical line. The rule's silence is lost ANALYSIS, not a fix, so
    // the effect is asserted here instead. It is the app's entire case-load
    // path; losing it silently would empty every screen.
    expect(appCode).toContain('useEffect(() => { if(org?.id) loadCasesFromDB(); }, [org?.id]);');
    expect(appCode).toContain('if(shouldReloadAfter(outcome.result)) await loadCasesFromDB();');
  });
});
