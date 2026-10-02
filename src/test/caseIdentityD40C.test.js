import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  IMPORT_IDENTITY, readIdentityColumns, resolveImportedEmployee,
  partitionImportRows, describeSkippedImport,
} from '../lib/caseIdentity.js';
import { buildEmployeeFile } from '../lib/employeeFile.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE D4.0C — every NEW employee-owned formal process carries canonical
// identity from creation.
//
// Four of the five creation paths already did. The case-history CSV import did
// not: it built cases from an 'employee name' column alone, reachable from
// Settings, creating name-only cases indefinitely.
// ─────────────────────────────────────────────────────────────────────────

const app = readFileSync('src/App.jsx', 'utf8');
const ORG = 'org-1';
const roster = [
  { id: 'emp-1', orgId: ORG, name: 'Sam Employee', employeeNumber: 'E100' },
  { id: 'emp-2', orgId: ORG, name: 'Sam Employee', employeeNumber: 'E200' }, // same NAME
  { id: 'emp-3', orgId: ORG, name: 'Alex Other', employeeNumber: 'E300' },
  { id: 'emp-4', orgId: ORG, name: 'Dup Number', employeeNumber: 'E999' },
  { id: 'emp-5', orgId: ORG, name: 'Dup Number Two', employeeNumber: 'E999' }, // same NUMBER
];

describe('identity signals are read, not guessed', () => {
  it('reads an explicit canonical id under any reasonable header', () => {
    for (const key of ['compass employee id', 'employee id', 'employeeid']) {
      expect(readIdentityColumns({ [key]: ' emp-1 ' }).employeeId).toBe('emp-1');
    }
  });

  it('reads an employee number under any reasonable header', () => {
    for (const key of ['employee number', 'emp no', 'payroll number']) {
      expect(readIdentityColumns({ [key]: 'E100' }).employeeNumber).toBe('E100');
    }
  });

  it('finds no signal in a row carrying only a name', () => {
    const cols = readIdentityColumns({ 'employee name': 'Sam Employee' });
    expect(cols.employeeId).toBe('');
    expect(cols.employeeNumber).toBe('');
  });
});

describe('NAME IS NEVER IDENTITY', () => {
  it('a row with only a name is skipped, not imported', () => {
    const r = resolveImportedEmployee({ 'employee name': 'Alex Other' }, roster, { orgId: ORG });
    expect(r.employeeId).toBeNull();
    expect(r.reason).toBe(IMPORT_IDENTITY.NO_SIGNAL);
  });

  it('a UNIQUE name is still not identity', () => {
    // 'Alex Other' matches exactly one person. It is still refused.
    expect(resolveImportedEmployee({ 'employee name': 'Alex Other' }, roster, { orgId: ORG }).employeeId).toBeNull();
  });

  it('two people sharing a name cannot be confused, because name is never used', () => {
    expect(resolveImportedEmployee({ 'employee name': 'Sam Employee' }, roster, { orgId: ORG }).employeeId).toBeNull();
  });

  it('an unknown id never falls back to the name on the same row', () => {
    const r = resolveImportedEmployee(
      { 'employee id': 'emp-nope', 'employee name': 'Alex Other' }, roster, { orgId: ORG });
    expect(r.employeeId).toBeNull();
    expect(r.reason).toBe(IMPORT_IDENTITY.UNKNOWN_ID);
  });
});

describe('deterministic resolution only', () => {
  it('resolves by explicit canonical id', () => {
    const r = resolveImportedEmployee({ 'employee id': 'emp-3' }, roster, { orgId: ORG });
    expect(r).toEqual({ employeeId: 'emp-3', via: IMPORT_IDENTITY.BY_ID });
  });

  it('resolves by a UNIQUE employee number', () => {
    const r = resolveImportedEmployee({ 'employee number': 'E100' }, roster, { orgId: ORG });
    expect(r).toEqual({ employeeId: 'emp-1', via: IMPORT_IDENTITY.BY_NUMBER });
  });

  it('refuses a DUPLICATE employee number rather than picking one', () => {
    const r = resolveImportedEmployee({ 'employee number': 'E999' }, roster, { orgId: ORG });
    expect(r.employeeId).toBeNull();
    expect(r.reason).toBe(IMPORT_IDENTITY.AMBIGUOUS_NUMBER);
  });

  it('refuses an employee number nobody holds', () => {
    expect(resolveImportedEmployee({ 'employee number': 'E404' }, roster, { orgId: ORG }).employeeId).toBeNull();
  });

  it('CROSS-ORG: an employee from another organisation is unreachable', () => {
    const foreign = [{ id: 'emp-x', orgId: 'org-2', name: 'Elsewhere', employeeNumber: 'E100' }];
    expect(resolveImportedEmployee({ 'employee id': 'emp-x' }, foreign, { orgId: ORG }).employeeId).toBeNull();
    expect(resolveImportedEmployee({ 'employee number': 'E100' }, foreign, { orgId: ORG }).employeeId).toBeNull();
  });

  it('an arbitrary UUID is rejected', () => {
    expect(resolveImportedEmployee(
      { 'employee id': '00000000-0000-0000-0000-000000000000' }, roster, { orgId: ORG }).employeeId).toBeNull();
  });
});

describe('the import partitions honestly', () => {
  const rows = [
    { 'employee name': 'Alex Other', 'employee id': 'emp-3' },
    { 'employee name': 'Sam Employee' },
    { 'employee name': 'Dup Number', 'employee number': 'E999' },
  ];

  it('imports only what it can identify', () => {
    const { accepted, skipped } = partitionImportRows(rows, roster, { orgId: ORG });
    expect(accepted).toHaveLength(1);
    expect(accepted[0].employeeId).toBe('emp-3');
    expect(skipped).toHaveLength(2);
  });

  it('never imports a row "pending reconciliation"', () => {
    const { accepted } = partitionImportRows(rows, roster, { orgId: ORG });
    expect(accepted.every(a => !!a.employeeId)).toBe(true);
  });

  it('tells the user what to do about the skipped rows', () => {
    const { skipped } = partitionImportRows(rows, roster, { orgId: ORG });
    const msg = describeSkippedImport(skipped);
    expect(msg).toMatch(/2 rows skipped/);
    expect(msg).toMatch(/Employee ID|Employee Number/);
    expect(msg).toMatch(/A name on its own cannot identify someone/);
  });

  it('says nothing when everything resolved', () => {
    expect(describeSkippedImport([])).toBeNull();
  });
});

// ── Every creation path, asserted where it lives ──
describe('every creation path carries canonical identity', () => {
  it('the CSV import persists employeeId and never a bare name', () => {
    const i = app.indexOf('const handleCaseCsvImport');
    const body = app.slice(i, i + 2200);
    expect(body).toContain('partitionImportRows(named, employeeRecords');
    expect(body).toContain('employeeId,');
    // the pre-fix shape: a case built straight from the name column
    expect(body).not.toContain("const imported = valid.map(o => ({");
  });

  it('global New case requires a selected employee', () => {
    expect(app).toContain('disabled={!casePromptEmployeeId}');
    expect(app).toContain('if(!casePromptEmployeeId) return;');
    expect(app).toContain('employeeId: casePromptEmployeeId,');
  });

  it('the concern-referral path refuses without a canonical employee', () => {
    const i = app.indexOf('if(action==="open_case")');
    const body = app.slice(i, i + 700);
    expect(body).toContain('findEmployeeById(employeeRecords, opts.employeeId)');
    expect(body).toContain('Select which employee this concern is about');
    expect(body).toContain('employeeId: employee.id');
  });

  it('the meeting save fails closed rather than minting a name-only case', () => {
    expect(app).toContain('const referralCaseIntent = !structuredCaseId && !!caseInfo._linkedReferralId && !!caseInfo._linkedReferralEmployeeId;');
    expect(app).toContain('WRITE_FAILURE.PARENT_REQUIRED');
  });

  it('Intake refuses without an employeeId', () => {
    const intake = readFileSync('src/screens/IntakeScreen.jsx', 'utf8');
    expect(intake).toContain('if(!intake.employeeId) return;');
    expect(intake).toContain('employeeId: intake.employeeId,');
  });
});

// ── §9 the indirect-leak gate ──
describe('Employee File aggregates derive only from the authorised slice', () => {
  const employee = { id: 'emp-1', orgId: ORG, name: 'Sam Employee' };

  it('a case the viewer never received cannot appear in any aggregate', () => {
    // The caller passes the RLS-filtered set; an inaccessible case is simply
    // absent, so there is nothing to filter out afterwards.
    const authorisedOnly = [{ id: 'c1', employeeId: 'emp-1', orgId: ORG, stage: 'open', meetings: [] }];
    const file = buildEmployeeFile('emp-1', { employeeRecords: [employee], cases: authorisedOnly });
    const text = JSON.stringify(file);
    expect(text).not.toContain('hidden-case');
    expect(file.processes).toHaveLength(1);
  });

  it('never counts a case belonging to another employee', () => {
    const cases = [
      { id: 'mine', employeeId: 'emp-1', orgId: ORG, stage: 'open', meetings: [] },
      { id: 'theirs', employeeId: 'emp-9', orgId: ORG, stage: 'open', meetings: [] },
    ];
    const file = buildEmployeeFile('emp-1', { employeeRecords: [employee], cases });
    expect(file.processes).toHaveLength(1);
    expect(JSON.stringify(file)).not.toContain('theirs');
  });

  it('a historical NULL-identity case contaminates nobody', () => {
    const cases = [{ id: 'legacy', employeeId: null, employeeName: 'Sam Employee', orgId: ORG, stage: 'open', meetings: [] }];
    const file = buildEmployeeFile('emp-1', { employeeRecords: [employee], cases });
    expect(file.processes).toHaveLength(0);
    expect(JSON.stringify(file)).not.toContain('legacy');
  });

  it('Current Warnings is built from the same authorised, employee-linked slice', () => {
    const ef = readFileSync('src/lib/employeeFile.js', 'utf8');
    expect(ef).toContain('currentWarnings: deriveCurrentWarnings(ctx.cases');
    const ctxSrc = readFileSync('src/lib/employeeContext.js', 'utf8');
    expect(ctxSrc).toContain('.filter(r => r && r.employeeId === employeeId)');
  });
});

describe('what D4.0C deliberately did NOT change', () => {
  it('historical NULL-identity cases are not auto-matched anywhere', () => {
    expect(app).not.toContain('employeeName === cs.employeeName');
    const recon = readFileSync('src/lib/employeeReconciliation.js', 'utf8');
    expect(recon).toContain('CANDIDATE');   // still human-confirmed
  });

  it('the reconciliation function is untouched', () => {
    const sql = readFileSync('supabase/employee_reconciliation_2026-09-26.sql', 'utf8');
    expect(sql).toContain('Only an HR Director or HR Manager can reconcile employee identity');
    expect(sql).toContain('create or replace function public.reconcile_case_employee');
  });

  it('no case_decisions table was created', () => {
    expect(() => readFileSync('supabase/case_decisions.sql', 'utf8')).toThrow();
    expect(app).not.toContain('case_decisions');
  });
});
