import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import { mapCaseRow } from '../lib/caseMapping.js';

// ─────────────────────────────────────────────────────────────────────────
// THE CASE LOAD/SAVE ROUND TRIP MUST BE SYMMETRIC.
//
// Production failure, 2026-10-04, found during D4.3 human UAT. Starting a
// Disciplinary meeting showed "Couldn't save this meeting — please try again."
// The server said something far more specific:
//
//   A case's employee cannot be cleared once set (case 25d61d15-…).
//
// A case-linked meeting lives in cases.meetings, so starting one is an UPDATE on
// cases. loadCasesFromDB's explicit select list did not include employee_id, so
// mapCaseRow read `undefined || null` and every case in client state believed its
// employee was null. saveCaseToDB then wrote `employee_id: caseObj.employeeId ??
// null`, and cases_employee_parentage_guard correctly refused to clear a link
// that was set.
//
// WHY IT HAD NEVER FIRED. The guard and the write both arrived in 62656ad
// ("create new cases against a canonical employee, not a typed name"), long
// before D4.3. It was unreachable because employee_id was populated on 0 of
// 2,960 production cases. The repaired employee-creation flow attached one for
// the first time, and the latent defect became a hard blocker on every case
// created from then on.
//
// So the test that matters is not "employee_id is in the select list" — it is
// the GENERAL invariant: a column the save writes must be a column the load
// reads. That is the bug class, and it will catch the next one.
// ─────────────────────────────────────────────────────────────────────────

const app = () => readFileSync('src/App.jsx', 'utf8');

// The explicit column list loadCasesFromDB asks for.
function selectedColumns() {
  const m = app().match(/from\('cases'\)\s*\n?\s*\.select\('([^']+)'\)/);
  expect(m, 'loadCasesFromDB select list must be findable').toBeTruthy();
  return new Set(m[1].split(',').map(c => c.trim()).filter(Boolean));
}

// The column keys saveCaseToDB writes, split by where the VALUE comes from.
//
// The invariant only applies to columns written FROM THE CASE OBJECT: those are
// the ones the client must have read in order to write them back truthfully. A
// column written from authoritative session context (org_id: org.id) or derived
// at write time (updated_at: nowIso) cannot be stale and needs no round trip —
// and that exemption is derived from the value expression rather than kept as an
// allowlist someone would have to remember to update.
function writtenColumns() {
  const src = app();
  const start = src.indexOf('const payload = {', src.indexOf('const saveCaseToDB'));
  expect(start, 'saveCaseToDB payload must be findable').toBeGreaterThan(-1);
  const end = src.indexOf('\n      };', start);
  const body = src.slice(start, end)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  const fromCase = new Set();
  const fromContext = new Set();
  for (const line of body.split('\n')) {
    const m = line.match(/^\s{8}([a-z][a-z0-9_]*)\s*:\s*(.*)$/);
    if (!m) continue;
    const [, key, value] = m;
    if (/\b(caseObj|safeCase)\./.test(value)) fromCase.add(key);
    else fromContext.add(key);
  }
  return { fromCase, fromContext, all: new Set([...fromCase, ...fromContext]) };
}

describe('case save/load round trip', () => {
  it('every column the save WRITES is a column the load READS', () => {
    // The generalised invariant. A column written but not read means the client
    // holds null for it, writes that null back, and either silently erases real
    // data or — as here — is refused by a guard that exists precisely to stop
    // the erasure.
    const selected = selectedColumns();
    const { fromCase, fromContext } = writtenColumns();
    expect(fromCase.size, 'payload keys must have parsed').toBeGreaterThan(20);

    const writtenButNotRead = [...fromCase].filter(c => !selected.has(c)).sort();
    expect(writtenButNotRead, 'these columns would be written back as null').toEqual([]);

    // The exempt set is small, explicit and checked — if something case-derived
    // ever lands here the test above would miss it, so assert what it contains.
    //
    // org_id and updated_at are legitimately context-derived. assigned_to is NOT
    // legitimate and is recorded here rather than hidden: it is written as
    // `user?.id || null`, so every save silently reassigns the case to whoever
    // saved it last, discarding the value mapCaseRow just read. That is a
    // separate, non-blocking defect reported alongside this fix — it fails
    // silently rather than erroring, so it is not what blocked the UAT, and it
    // is deliberately not changed here. If it is fixed, this list shrinks.
    expect([...fromContext].sort()).toEqual(['assigned_to', 'org_id', 'updated_at']);
  });

  it('employee_id specifically is read back — the 2026-10-04 production failure', () => {
    expect(selectedColumns().has('employee_id')).toBe(true);
    expect(writtenColumns().fromCase.has('employee_id')).toBe(true);
  });

  it('mapCaseRow reports a real employee link, and null only when genuinely absent', () => {
    // Behavioural: the mapping is what turned a present link into null once the
    // column was missing from the row.
    expect(mapCaseRow({ id: 'c1', employee_id: 'emp-1', employee_name: 'Ada' }).employeeId).toBe('emp-1');
    expect(mapCaseRow({ id: 'c1', employee_name: 'Ada' }).employeeId).toBeNull();
  });

  it('a mapped case can be written back without clearing its employee', () => {
    // The exact round trip that failed: row -> mapCaseRow -> payload value.
    const row = { id: 'c1', employee_id: 'emp-1', employee_name: 'Ada', outcome: '' };
    const mapped = mapCaseRow(row);
    // saveCaseToDB writes `caseObj.employeeId ?? null`
    const written = mapped.employeeId ?? null;
    expect(written).toBe('emp-1');
    expect(written).not.toBeNull();
  });
});

describe('the failure is no longer reported as an unexplained generic error', () => {
  it('a cleared-employee refusal gets a specific, actionable, non-leaky message', () => {
    const src = app();
    const fn = src.slice(src.indexOf('const describeSaveMeetingError'));
    const body = fn.slice(0, fn.indexOf('\n  };'));
    expect(body).toContain('employee cannot be cleared once set');
    const msg = body.match(/return "(This case's employee link[^"]+)"/);
    expect(msg, 'a specific message must be returned').toBeTruthy();
    // actionable
    expect(msg[1]).toMatch(/refresh/i);
    // and safe: no table, column, trigger or SQL state named to the user
    for (const leak of ['cases_employee', 'employee_id', 'trigger', 'postgres', '42501', 'RLS', 'row-level']) {
      expect(msg[1].toLowerCase(), `must not leak ${leak}`).not.toContain(leak.toLowerCase());
    }
  });

  it('the generic fallback still exists for genuinely unclassified errors', () => {
    expect(app()).toContain('Couldn\'t save this meeting — please try again.');
  });
});
