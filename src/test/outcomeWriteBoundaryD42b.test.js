import { describe, it, expect } from 'vitest';
import { readFileSync } from 'fs';
import {
  partitionImportRows, countImportedOutcomes, describeSkippedOutcomes, describeSkippedImport,
} from '../lib/caseIdentity.js';

// ─────────────────────────────────────────────────────────────────────────
// WAVE D4.2b — OUTCOME WRITE BOUNDARY HARDENING (NEW-48).
//
// Before case_decisions becomes authoritative in D4.3, prove no existing
// operational path can manufacture outcome state outside the future
// authoritative operation.
//
// TWO HALVES, AND ONLY ONE IS CLOSED HERE — deliberately:
//
//   INSERT   closed. The historical CSV importer was the only producer, and the
//            database now refuses an outcome-bearing insert regardless.
//   UPDATE   still open to HR / the case's disciplinary officer, because
//            finalizeOutcome is an UPDATE and the D4.3 RPC does not exist yet.
//            protect_case_hr_only_columns already enforces that authority, so
//            this is the pre-existing intended path, not a new hole.
//
// The UPDATE half and the D4.3 RPC must deploy as one unit. Asserted at the end.
// ─────────────────────────────────────────────────────────────────────────

const appSrc = () => readFileSync('src/App.jsx', 'utf8');
const migration = () => readFileSync('supabase/outcome_insert_boundary_2026-10-03.sql', 'utf8');
const stripSql = t => t.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');

const ORG = 'org-1';
const roster = [
  { id: 'emp-1', orgId: ORG, name: 'Sam Employee', employeeNumber: 'E100' },
  { id: 'emp-2', orgId: ORG, name: 'Alex Other', employeeNumber: 'E200' },
];

// ── A. CSV import no longer issues decisions ──
describe('D4.2b/A — the historical importer imports history, not decisions', () => {
  // The importer's own transformation, extracted exactly as App.jsx performs it,
  // so this exercises the real mapping rather than describing it. If the
  // production mapping gains an outcome field again, the assertion below fails.
  const importRows = rows => {
    const named = rows.filter(o => o['employee name']?.trim());
    const { accepted, skipped } = partitionImportRows(named, roster, { orgId: ORG });
    const skippedOutcomeCount = countImportedOutcomes(accepted.map(a => ({ outcome: a.row['outcome'] })));
    const imported = accepted.map(({ row: o, employeeId }) => ({
      id: 'generated', employeeId, employeeName: o['employee name'].trim(), email: '',
      caseType: (o['case type'] || '').trim().toLowerCase(),
      description: o['description'] || '',
      dateReceived: o['date received'] || '2026-10-03',
      stage: (o['stage'] || '').trim().toLowerCase() === 'closed' ? 'closed' : 'open',
      meetings: [], evidence: [], urgency: 'normal',
    }));
    return { imported, skipped, skippedOutcomeCount };
  };

  it('does not carry an outcome onto the imported case, for arbitrary text', () => {
    const { imported } = importRows([
      { 'employee name': 'Sam Employee', 'employee id': 'emp-1', outcome: 'whatever HR typed' },
    ]);
    expect(imported).toHaveLength(1);
    expect(imported[0]).not.toHaveProperty('outcome');
    expect(Object.values(imported[0])).not.toContain('whatever HR typed');
  });

  it('does not carry an outcome even for a RECOGNISED sanction string', () => {
    // The dangerous case: a value that looks legitimate must not be waved
    // through, because the controls (sign-off, quality check, dated decision
    // record) are what make it a decision — not the spelling.
    for (const sanction of [
      'No further action', 'First written warning', 'Final written warning',
      'Demotion', 'Dismissal with notice', 'Summary dismissal (gross misconduct)',
    ]) {
      const { imported } = importRows([
        { 'employee name': 'Sam Employee', 'employee id': 'emp-1', outcome: sanction },
      ]);
      expect(imported[0], sanction).not.toHaveProperty('outcome');
    }
  });

  it('never produces legacy_unmapped — that marker is historical preservation only', () => {
    const { imported } = importRows([
      { 'employee name': 'Sam Employee', 'employee id': 'emp-1', outcome: 'First written warning issued' },
    ]);
    expect(JSON.stringify(imported)).not.toContain('legacy_unmapped');
    expect(JSON.stringify(imported)).not.toContain('First written warning issued');
  });

  it('still imports the remaining historical case fields', () => {
    const { imported } = importRows([{
      'employee name': 'Alex Other', 'employee id': 'emp-2', 'case type': 'Misconduct',
      description: 'Repeated lateness', 'date received': '2025-03-10', stage: 'closed',
      outcome: 'Final written warning',
    }]);
    expect(imported[0]).toMatchObject({
      employeeId: 'emp-2', employeeName: 'Alex Other', caseType: 'misconduct',
      description: 'Repeated lateness', dateReceived: '2025-03-10', stage: 'closed',
    });
  });

  it('PRESERVES the imported stage — closed-without-outcome is already legitimate', () => {
    // Production holds 37 closed cases with no outcome (of 106), getCaseStage
    // returns "closed" before any outcome branch, and protect_case_closure
    // requires HR authority rather than an outcome. So there is no stage/outcome
    // coupling to invent, and dropping the outcome must not downgrade the stage.
    const { imported } = importRows([
      { 'employee name': 'Sam Employee', 'employee id': 'emp-1', stage: 'closed', outcome: 'Dismissal with notice' },
    ]);
    expect(imported[0].stage).toBe('closed');
    expect(imported[0]).not.toHaveProperty('outcome');
  });

  it('counts the outcomes it declined, so nothing disappears silently', () => {
    const { skippedOutcomeCount } = importRows([
      { 'employee name': 'Sam Employee', 'employee id': 'emp-1', outcome: 'Final written warning' },
      { 'employee name': 'Alex Other', 'employee id': 'emp-2', outcome: '   ' },
      { 'employee name': 'Alex Other', 'employee id': 'emp-2' },
    ]);
    expect(skippedOutcomeCount).toBe(1);
  });

  it('does not count outcomes on rows that were skipped for identity reasons', () => {
    // Otherwise one row would be reported twice — once as unidentified, once as
    // an outcome skip — and the counts would not add up for the user.
    const { skipped, skippedOutcomeCount } = importRows([
      { 'employee name': 'Nobody Known', outcome: 'Final written warning' },
    ]);
    expect(skipped).toHaveLength(1);
    expect(skippedOutcomeCount).toBe(0);
  });

  it('reports a skipped FIELD, not a skipped row — and says why', () => {
    const msg = describeSkippedOutcomes(2);
    expect(msg).toMatch(/2 imported cases had an outcome value/);
    expect(msg).toMatch(/the cases were imported, but the outcome were not|cases were imported/);
    expect(msg).toMatch(/decision process/);
    // it must NOT read as rows having been dropped
    expect(msg).not.toMatch(/rows skipped/);
    expect(msg).not.toMatch(/not imported\./);
  });

  it('says nothing when no outcome was present', () => {
    expect(describeSkippedOutcomes(0)).toBeNull();
    const { skippedOutcomeCount, imported } = importRows([
      { 'employee name': 'Sam Employee', 'employee id': 'emp-1', description: 'No outcome here' },
    ]);
    expect(skippedOutcomeCount).toBe(0);
    expect(describeSkippedOutcomes(skippedOutcomeCount)).toBeNull();
    expect(imported).toHaveLength(1);
  });

  it('keeps the identity notice and the outcome notice separate', () => {
    // Two different facts; one count must never be read as the other.
    const identity = describeSkippedImport([{ row: {}, reason: 'no_identity_signal' }]);
    const outcome = describeSkippedOutcomes(1);
    expect(identity).toMatch(/row skipped/);
    expect(outcome).not.toMatch(/row skipped/);
  });

  it('the production importer no longer writes outcome, and the template no longer advertises it', () => {
    const src = appSrc();
    const fn = src.slice(src.indexOf('const handleCaseCsvImport'), src.indexOf('const downloadCaseCsvTemplate'));
    const code = fn.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toMatch(/outcome:\s*o\['outcome'\]/);
    expect(code).toContain('countImportedOutcomes');
    expect(code).toContain('describeSkippedOutcomes');
    // the template's Outcome column — and its "First written warning issued"
    // example, which D4.1 traced as the origin of the one stray value — are gone
    const tpl = src.slice(src.indexOf('const downloadCaseCsvTemplate'), src.indexOf('const downloadCaseCsvTemplate') + 1600);
    const tplCode = tpl.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(tplCode).not.toMatch(/"Outcome"/);
    expect(tplCode).not.toContain('First written warning issued');
  });
});

// ── B. the INSERT boundary, in the database ──
describe('D4.2b/B — the database refuses an outcome-bearing case INSERT', () => {
  it('guards all six protected columns, not just outcome', () => {
    const sql = stripSql(migration());
    for (const col of ['outcome', 'outcome_issued_at', 'outcome_notes',
      'warning_duration_months', 'warning_expires_at', 'disciplinary_decided_by']) {
      expect(sql, col).toContain(`'${col}'`);
    }
  });

  it('fires BEFORE INSERT on public.cases', () => {
    const sql = stripSql(migration());
    expect(sql).toMatch(/create trigger protect_case_outcome_on_insert_trigger\s*\n?\s*before insert on public\.cases/);
  });

  it('raises rather than silently stripping — a refused import must be visible', () => {
    const sql = stripSql(migration());
    expect(sql).toMatch(/raise exception/);
    expect(sql).toMatch(/errcode = '42501'/);
    // and it names the offending fields, so the operator knows what to remove
    expect(sql).toMatch(/array_to_string\(v_attempted, ', '\)/);
  });

  it('treats empty strings as absent, so an ordinary insert is unaffected', () => {
    // saveCaseToDB writes `outcome: caseObj.outcome || ""` — every normal case
    // creation sends an empty string, which must NOT be refused.
    const sql = stripSql(migration());
    expect(sql).toMatch(/nullif\(trim\(coalesce\(new\.outcome, ''\)\), ''\) is not null/);
    expect(sql).toMatch(/nullif\(trim\(coalesce\(new\.outcome_notes, ''\)\), ''\) is not null/);
  });

  it('exempts service role ONLY — never current_user, which is always the owner', () => {
    // The first draft also exempted current_user in ('postgres','supabase_admin').
    // Inside a SECURITY DEFINER function current_user is ALWAYS the owner, so
    // that exemption is unconditionally true and the guard never fires. Proven
    // live before correcting. This test exists so it cannot come back.
    const sql = stripSql(migration());
    expect(sql).toMatch(/coalesce\(auth\.role\(\), ''\) = 'service_role'/);
    expect(sql, 'current_user must not gate a SECURITY DEFINER guard').not.toMatch(/if[^;]*current_user/);
    expect(sql).toMatch(/security definer/);
  });

  it('changes no data and no RLS', () => {
    const sql = stripSql(migration());
    for (const forbidden of [/update public\.cases/i, /delete from/i, /insert into public\.cases/i,
      /alter table public\.cases enable/i, /create policy/i, /drop policy/i, /alter column/i]) {
      expect(sql, String(forbidden)).not.toMatch(forbidden);
    }
  });

  it('documents a complete rollback', () => {
    const sql = migration();
    expect(sql).toContain('drop trigger if exists protect_case_outcome_on_insert_trigger on public.cases');
    expect(sql).toContain('drop function if exists public.protect_case_outcome_on_insert()');
  });
});

// ── C. the UPDATE transition is untouched, and no new authority exists ──
describe('D4.2b/C — legitimate issuance is untouched, and no marker was added', () => {
  it('finalizeOutcome still writes the outcome through saveCases — unchanged', () => {
    const src = readFileSync('src/screens/OutcomeModal.jsx', 'utf8');
    const fn = src.slice(src.indexOf('const finalizeOutcome'), src.indexOf('const issueOutcome'));
    expect(fn).toContain('outcome:outcomeType');
    expect(fn).toContain('outcomeIssuedAt:issuedAt.toISOString()');
    expect(fn).toContain('disciplinaryDecidedBy:currentUserId||null');
    expect(fn).toContain('await saveCases(');
    // it is an UPDATE of an existing case, which is why the INSERT guard cannot
    // affect it
    expect(fn).toContain('cases.map(');
  });

  it('adds NO transaction-local marker infrastructure — that is D4.3\'s, with the RPC', () => {
    // A marker is not authorization. Adding the plumbing before an RPC exists to
    // set it would put a second accepted branch into a security-critical trigger
    // for no behavioural gain. The migration must therefore contain none.
    const sql = stripSql(migration());
    expect(sql).not.toMatch(/current_setting/);
    expect(sql).not.toMatch(/set_config/);
    expect(sql).not.toMatch(/compass\./);
  });

  it('does not touch the existing UPDATE protection', () => {
    const sql = stripSql(migration());
    // It must not redefine the UPDATE guard, and must not create an UPDATE
    // trigger of its own. (The phrase "BEFORE UPDATE" does appear inside the
    // comment on function, explaining which gap this closes — that is
    // documentation, not a code path, so the assertion is on the DDL.)
    expect(sql).not.toMatch(/create or replace function public\.protect_case_hr_only_columns/);
    expect(sql).not.toMatch(/create trigger[\s\S]{0,80}?before\s+(insert\s+or\s+)?update/i);
    expect(sql).not.toMatch(/drop trigger[^\n]*protect_case_hr_only_columns/i);
    // the only trigger it creates is the INSERT one
    const triggers = [...sql.matchAll(/create trigger (\w+)/g)].map(m => m[1]);
    expect(triggers).toEqual(['protect_case_outcome_on_insert_trigger']);
  });

  it('records the D4.3 handoff obligation in the migration itself', () => {
    const sql = migration();
    expect(sql).toMatch(/D4\.3 OBLIGATION/);
    expect(sql).toMatch(/must deploy as ONE unit|one unit/i);
  });
});

// ── D. the retired completion route ──
describe('D4.2b/D — the completion route is no longer a mutation path', () => {
  it('no component holds completion state or passes it', () => {
    for (const file of ['src/App.jsx', 'src/screens/CaseViewScreen.jsx',
      'src/components/caseTabs/OutcomeTab.jsx']) {
      const code = readFileSync(file, 'utf8').split('\n')
        .filter(l => !l.trim().startsWith('//') && !l.trim().startsWith('*')).join('\n');
      expect(code, file).not.toContain('completingOutcomeDetails');
    }
  });

  it('OutcomeModal has no amendment write function left', () => {
    const code = readFileSync('src/screens/OutcomeModal.jsx', 'utf8').split('\n')
      .filter(l => !l.trim().startsWith('//')).join('\n');
    expect(code).not.toContain('completeOutcomeDetails');
    expect(code).not.toContain('Outcome details amended');
    expect(code).not.toContain('confirmedIssueDate');
  });

  it('the incomplete-warning predicate survives, because the read-only notice uses it', () => {
    // Removing it would remove the honest indicator that a historical record is
    // incomplete, which was explicitly to be preserved.
    const tab = readFileSync('src/components/caseTabs/OutcomeTab.jsx', 'utf8');
    expect(tab).toContain('function needsOutcomeDetailsCompletion');
    expect(tab).toMatch(/no recorded duration/);
  });

  it('nothing repairs or infers historical values', () => {
    const tab = readFileSync('src/components/caseTabs/OutcomeTab.jsx', 'utf8');
    expect(tab).not.toMatch(/warningDurationMonths\s*=\s*\d/);
    expect(tab).not.toMatch(/outcomeIssuedAt\s*=\s*new Date/);
  });
});

// ── E. D4.2 guarantees intact ──
describe('D4.2b/E — the D4.2 decision foundation is untouched', () => {
  it('this slice creates no decision rows and no new table', () => {
    const sql = stripSql(migration());
    expect(sql).not.toMatch(/insert into public\.case_decisions/);
    expect(sql).not.toMatch(/create table/);
    expect(sql).not.toMatch(/legacy_unmapped/);
  });

  it('the D4.2 migration is unmodified by this slice', () => {
    const d42 = readFileSync('supabase/case_decisions_2026-10-03.sql', 'utf8');
    expect(d42).toContain('foreign key (case_id, org_id) references public.cases(id, org_id)');
    expect(d42).toContain('case_decisions_one_successor_idx');
    expect(d42).toContain('case_decisions_one_original_per_case_idx');
    expect(d42).toMatch(/case_decisions_append_only_guard/);
  });

  it('no application path writes case_decisions yet — D4.3 owns that', () => {
    for (const file of ['src/App.jsx', 'src/screens/OutcomeModal.jsx',
      'src/lib/employeeFile.js', 'src/lib/caseStage.js']) {
      expect(readFileSync(file, 'utf8'), file).not.toContain('case_decisions');
    }
  });
});
