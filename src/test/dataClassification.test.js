import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import { declaredPublicTables } from '../lib/schemaDeclarations.js';
import {
  ORG_SCOPED_TABLES, allClassifiedTables, classifyTable,
  RESTRICTING_FOREIGN_KEYS, deletionOrderViolations,
} from '../lib/dataInventory.js';
import {
  TABLE_CLASSIFICATION, DATA_CLASS, DSAR_DISPOSITION, RETENTION,
  RETENTION_ENFORCEMENT_IMPLEMENTED, classificationFor, tablesWithDataClass,
  unwiredDsarObligations,
} from '../lib/dataClassification.js';

// ─────────────────────────────────────────────────────────────────────────
// NEW-44, second pass.
//
// The first pass made it impossible for a live table to be unclassified FOR
// DELETION. It left two things a reviewer still cannot be forced to answer:
//
//   1. what IS this table — customer data, platform, or plumbing — and what
//      does DSAR owe it? Those answers were prose comments, and prose is not
//      a gate.
//   2. WHEN is it deleted? The deletion list encodes an ORDER, and the first
//      pass only proved the SET was complete. That distinction was not
//      academic: `meetings` sat at index 23 while employee_records sat at 9,
//      and meetings.employee_id RESTRICT-references it.
// ─────────────────────────────────────────────────────────────────────────

const corpus = () => readdirSync('supabase')
  .filter(f => f.endsWith('.sql'))
  .map(name => ({ name, sql: readFileSync(`supabase/${name}`, 'utf8') }));

// ── A. every table in the schema is classified, in BOTH registers ──
describe('NEW-44 — classification coverage', () => {
  it('every table the migration corpus declares has a classification', () => {
    const declared = declaredPublicTables(corpus());
    const missing = declared.filter(t => !classificationFor(t));
    expect(
      missing,
      `Live table(s) with no entry in dataClassification.js: ${missing.join(', ')}. `
      + `State what the table is, whether it is customer data, and what DSAR owes it.`,
    ).toEqual([]);
  });

  it('the two registers are in exact 1:1 correspondence — neither can grow a table the other lacks', () => {
    // This is what stops dataClassification.js becoming a competing inventory.
    const deletion = [...new Set(allClassifiedTables())].sort();
    const classification = Object.keys(TABLE_CLASSIFICATION).sort();
    expect(classification).toEqual(deletion);
  });

  it('classifies nothing the schema does not actually have', () => {
    const declared = new Set(declaredPublicTables(corpus()));
    const ghosts = Object.keys(TABLE_CLASSIFICATION).filter(t => !declared.has(t));
    expect(ghosts, `Classified but not declared: ${ghosts.join(', ')}`).toEqual([]);
  });

  it('every entry uses the controlled vocabulary, not free text', () => {
    const classes = Object.values(DATA_CLASS);
    const dispositions = Object.values(DSAR_DISPOSITION);
    for (const [table, meta] of Object.entries(TABLE_CLASSIFICATION)) {
      expect(classes, `${table}.dataClass`).toContain(meta.dataClass);
      expect(dispositions, `${table}.dsar`).toContain(meta.dsar);
      expect(typeof meta.purpose === 'string' && meta.purpose.trim().length > 10, `${table}.purpose`).toBe(true);
      for (const flag of ['orgScoped', 'personRelated', 'caseRelated']) {
        expect(typeof meta[flag], `${table}.${flag}`).toBe('boolean');
      }
    }
  });
});

// ── C. an exclusion must be explicit AND carry a documented reason ──
describe('NEW-44 — no table is excluded by silence', () => {
  const EXCLUDED_CATEGORIES = ['intentionally_excluded', 'platform_scoped', 'infrastructure', 'parent_excluded', 'unused_legacy'];

  it('every table "Delete all data" does not erase states WHY, in code', () => {
    const offenders = [];
    for (const [table, meta] of Object.entries(TABLE_CLASSIFICATION)) {
      if (!EXCLUDED_CATEGORIES.includes(classifyTable(table))) continue;
      if (!meta.exclusionReason || !meta.exclusionReason.trim()) offenders.push(table);
    }
    expect(
      offenders,
      `Excluded from erasure with no exclusionReason: ${offenders.join(', ')}. `
      + `"unknown -> silently ignored" is the failure NEW-44 exists to prevent.`,
    ).toEqual([]);
  });

  it('a table that IS erased does not carry an exclusion reason — that would be contradictory', () => {
    for (const [table, meta] of Object.entries(TABLE_CLASSIFICATION)) {
      if (classifyTable(table) === 'deleted') {
        expect(meta.exclusionReason, `${table} is deleted but claims an exclusion reason`).toBeUndefined();
      }
    }
  });
});

// ── D + G. customer data must have an explicit deletion AND DSAR answer ──
describe('NEW-44 — customer data cannot dodge either question', () => {
  it('every customer-data table has an explicit deletion classification', () => {
    for (const table of tablesWithDataClass(DATA_CLASS.CUSTOMER)) {
      expect(classifyTable(table), `${table} has no deletion category`).not.toBeNull();
    }
  });

  it('every customer-data table is erased, cascade-covered, or excluded WITH a reason', () => {
    const unerased = [];
    for (const table of tablesWithDataClass(DATA_CLASS.CUSTOMER)) {
      const category = classifyTable(table);
      const covered = category === 'deleted' || category === 'cascade_covered' || category === 'separately_handled';
      if (!covered && !classificationFor(table).exclusionReason) unerased.push(table);
    }
    expect(unerased, `Customer data neither erased nor explicitly spared: ${unerased.join(', ')}`).toEqual([]);
  });

  it('every customer-data table has a DSAR disposition that is not a placeholder', () => {
    for (const table of tablesWithDataClass(DATA_CLASS.CUSTOMER)) {
      const meta = classificationFor(table);
      expect(Object.values(DSAR_DISPOSITION), `${table}.dsar`).toContain(meta.dsar);
      // "not applicable" is not an answer for data a customer put there about a person.
      if (meta.personRelated) {
        expect(meta.dsar, `${table} is person-related; NOT_APPLICABLE is not an answer`)
          .not.toBe(DSAR_DISPOSITION.NOT_APPLICABLE);
      }
    }
  });

  it('a withheld or not-personal-data claim on person-related content must be justified', () => {
    for (const [table, meta] of Object.entries(TABLE_CLASSIFICATION)) {
      const quiet = meta.dsar === DSAR_DISPOSITION.INTERNAL_WITHHELD
        || meta.dsar === DSAR_DISPOSITION.NOT_PERSONAL_DATA;
      if (quiet && meta.dataClass === DATA_CLASS.CUSTOMER) {
        expect(meta.dsarNote, `${table} withholds customer data from DSAR without saying why`).toBeTruthy();
      }
    }
  });
});

// ── E. deletion ORDER, checked against the live FK graph ──
describe('NEW-44 — deletion order respects the RESTRICT graph', () => {
  it('has no ordering violation', () => {
    const violations = deletionOrderViolations();
    expect(
      violations.map(v => v.why),
      `Deletion order would fail: ${violations.map(v => `${v.child} after ${v.parent}`).join('; ')}`,
    ).toEqual([]);
  });

  it('CATCHES the real defect this pass found — meetings after employee_records', () => {
    // The exact pre-fix order, so the check is proven to fire on the thing it
    // was written for rather than merely passing on the corrected list.
    const broken = ORG_SCOPED_TABLES.filter(t => t !== 'meetings').concat('meetings');
    const violations = deletionOrderViolations(broken);
    expect(violations).toHaveLength(1);
    expect(violations[0].child).toBe('meetings');
    expect(violations[0].parent).toBe('employee_records');
    expect(violations[0].why).toMatch(/rows would survive the erasure/);
  });

  it('catches a NEW child table appended after its RESTRICT parent', () => {
    // The generic form: the next table someone appends.
    const order = [...ORG_SCOPED_TABLES, 'case_decisions'];
    const fks = [...RESTRICTING_FOREIGN_KEYS,
      { child: 'case_decisions', parent: 'employee_records', column: 'employee_id', rule: 'RESTRICT' }];
    expect(deletionOrderViolations(order, fks)).toHaveLength(1);
    // …and placing it correctly passes.
    const fixed = ['case_decisions', ...ORG_SCOPED_TABLES];
    expect(deletionOrderViolations(fixed, fks)).toEqual([]);
  });

  it('does not constrain order against a parent that is never deleted', () => {
    // locations is RESTRICT-referenced by four tables but intentionally
    // excluded, so there is no sequence to get wrong. Asserted so nobody
    // "fixes" a non-problem by reordering around it.
    expect(classifyTable('locations')).toBe('intentionally_excluded');
    expect(ORG_SCOPED_TABLES).not.toContain('locations');
    const edges = RESTRICTING_FOREIGN_KEYS.filter(fk => fk.parent === 'locations');
    expect(edges.length).toBeGreaterThan(0);
    expect(deletionOrderViolations(ORG_SCOPED_TABLES, edges)).toEqual([]);
  });

  it('every RESTRICT edge names a real table in one register or the other', () => {
    const known = new Set(Object.keys(TABLE_CLASSIFICATION));
    for (const fk of RESTRICTING_FOREIGN_KEYS) {
      expect(known.has(fk.child), `FK child ${fk.child} is not classified`).toBe(true);
      expect(known.has(fk.parent), `FK parent ${fk.parent} is not classified`).toBe(true);
    }
  });
});

// ── F. the tables the two NEW-44 passes were raised for ──
describe('NEW-44 — the previously missing tables stay classified', () => {
  const previouslyMissing = ['customer_contracts', 'team_invites', 'organisations', 'profiles',
    'platform_admins', 'api_rate_limits', 'calendar_synced_events', 'meetings_legacy_unused'];

  it('all eight carry a full classification', () => {
    for (const table of previouslyMissing) {
      const meta = classificationFor(table);
      expect(meta, `${table} lost its classification`).toBeTruthy();
      expect(meta.exclusionReason, `${table} must say why it is spared`).toBeTruthy();
    }
  });

  it('meetings is deleted BEFORE employee_records', () => {
    expect(ORG_SCOPED_TABLES.indexOf('meetings'))
      .toBeLessThan(ORG_SCOPED_TABLES.indexOf('employee_records'));
  });

  it('the deletion set is unchanged by this pass — only the order moved', () => {
    expect([...ORG_SCOPED_TABLES].sort()).toEqual([
      'case_tasks', 'case_views', 'cases', 'concern_referrals', 'dsar_requests',
      'employee_activities', 'employee_activity_records', 'employee_employment_events',
      'employee_portal_accounts', 'employee_portal_invites', 'employee_records',
      'er_executive_briefs', 'hr_review_requests', 'improvement_initiatives',
      'integration_events', 'leaver_instances', 'manager_capability_insights', 'meetings',
      'org_events', 'organisation_themes', 'redundancy_cases', 'signing_requests',
      'starter_instances', 'wellbeing_notes',
    ]);
    expect(ORG_SCOPED_TABLES).toHaveLength(24);
  });
});

// ── H. the future table, demonstrated without creating it ──
describe('NEW-44 — a future durable table cannot ship unclassified', () => {
  it('case_decisions ARRIVED in D4.2 and is fully classified — the gate did its job', () => {
    // This test used to assert case_decisions would FAIL the gate because it did
    // not exist. D4.2 created it, and the gate is why it could not land without
    // a classification. Kept as the positive half of that proof.
    expect(declaredPublicTables(corpus())).toContain('case_decisions');
    const meta = classificationFor('case_decisions');
    expect(meta).toBeTruthy();
    expect(meta.dataClass).toBe(DATA_CLASS.CUSTOMER);
    expect(classifyTable('case_decisions')).toBe('cascade_covered');
    // D4.3 discharged the DSAR obligation by genuinely compiling the table.
    expect(meta.dsar).toBe(DSAR_DISPOSITION.INCLUDED);
    expect(meta.dsarDefect).toBeFalsy();
    expect(meta.retention).toBe(RETENTION.NOT_ENFORCED);
  });

  it('a table that still does not exist WOULD fail the classification gate', () => {
    const future = [{ name: 'decision_notes_2027-01-01.sql', sql: 'create table public.decision_notes (id uuid);' }];
    expect(declaredPublicTables(future).filter(t => !classificationFor(t))).toEqual(['decision_notes']);
    expect(declaredPublicTables(corpus())).not.toContain('decision_notes');
    expect(classificationFor('decision_notes')).toBeNull();
  });

  it('ask_threads would fail the classification gate', () => {
    const future = [{ name: 'ask_threads_2027-01-01.sql', sql: 'create table if not exists ask_threads (id uuid);' }];
    expect(declaredPublicTables(future).filter(t => !classificationFor(t))).toEqual(['ask_threads']);
    expect(classificationFor('ask_threads')).toBeNull();
  });

  it('classifying it for deletion alone is NOT enough to pass', () => {
    // The precise hole this pass closes: the first NEW-44 gate was satisfied by
    // a deletion category. Correspondence means a table must appear in BOTH
    // registers, so a developer cannot answer "is it deleted?" and stay silent
    // on "what is it, and what does DSAR owe it?".
    const deletionOnly = [...new Set([...allClassifiedTables(), 'decision_notes'])].sort();
    const classification = Object.keys(TABLE_CLASSIFICATION).sort();
    expect(classification).not.toEqual(deletionOnly);
  });
});

// ── retention: honest, and provably not overclaimed ──
describe('NEW-44 — retention is recorded as unenforced, not invented', () => {
  it('no entry claims a retention rule, because no sweep exists', () => {
    for (const [table, meta] of Object.entries(TABLE_CLASSIFICATION)) {
      expect(meta.retention, `${table} claims a retention rule`).toBe(RETENTION.NOT_ENFORCED);
    }
    expect(RETENTION_ENFORCEMENT_IMPLEMENTED).toBe(false);
  });

  it('there is still no retention sweep anywhere in the product', () => {
    // If this ever fails, retention got implemented and the vocabulary above
    // needs real values — which is the point of asserting it.
    const sources = ['src/App.jsx', 'src/lib/dataInventory.js', 'src/lib/dataClassification.js']
      .map(p => readFileSync(p, 'utf8')).join('\n');
    expect(sources).not.toMatch(/function\s+\w*retentionSweep|purgeExpiredData|enforceRetention/);
  });

  it('names the unwired DSAR obligations rather than hiding them', () => {
    const unwired = unwiredDsarObligations();
    // D4.3 discharged case_decisions' obligation by wiring it into
    // compileSubjectData, so only NEW-45's remains.
    expect(unwired).toEqual([{ table: 'team_invites', defect: 'NEW-45' }]);
    for (const row of unwired) {
      expect(row.defect, `${row.table} claims an unwired DSAR obligation with no defect reference`).toBeTruthy();
    }
  });
});
