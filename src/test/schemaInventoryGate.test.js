import { describe, it, expect } from 'vitest';
import { readdirSync, readFileSync } from 'fs';
import {
  stripSqlComments, schemaEventsIn, migrationOrder, declaredPublicTables,
} from '../lib/schemaDeclarations.js';
import {
  TABLE_CATEGORIES, allClassifiedTables, classifyTable, unclassifiedTables,
  isRelevantTable, NON_RELEVANT_SCHEMAS,
} from '../lib/dataInventory.js';
import { PENDING_PRODUCTION_SCHEMA } from '../lib/dataClassification.js';

// ─────────────────────────────────────────────────────────────────────────
// NEW-44 — the live-schema CI check that src/test/dataInventory.test.js
// asked for in its own header and could not be.
//
// That file compares a hand-typed snapshot against hand-typed arrays. It
// said so, and said what would happen: "This snapshot can go stale the same
// way the old hand-maintained list did — the durable fix is a live-schema CI
// check, not a hardcoded array." It then went stale, missing
// customer_contracts and team_invites.
//
// This file does not type a table name on either side of the comparison.
// The left side is produced by replaying every file in supabase/; the right
// side is dataInventory.js's categories. A migration that adds a table and
// does not classify it fails here, with the table named in the message.
// ─────────────────────────────────────────────────────────────────────────

const corpus = () => readdirSync('supabase')
  .filter(f => f.endsWith('.sql'))
  .map(name => ({ name, sql: readFileSync(`supabase/${name}`, 'utf8') }));

describe('NEW-44 — the gate', () => {
  it('every table the migration corpus declares is classified', () => {
    const declared = declaredPublicTables(corpus());
    const missing = unclassifiedTables(declared);
    expect(
      missing,
      `Unclassified table(s) in the live schema: ${missing.join(', ')}. `
      + `Decide what "Delete all data" owes each one and add it to exactly one `
      + `category in src/lib/dataInventory.js. Do NOT resolve this by editing a `
      + `snapshot — that converts an erasure gap into a green tick.`,
    ).toEqual([]);
  });

  it('classifies NOTHING it has not actually seen declared', () => {
    // The opposite failure: a category naming a table that no longer exists
    // would make the inventory look more complete than the schema is.
    const declared = new Set(declaredPublicTables(corpus()));
    const ghosts = allClassifiedTables().filter(t => !declared.has(t));
    expect(ghosts, `Classified but not declared anywhere: ${ghosts.join(', ')}`).toEqual([]);
  });

  it('puts no table in two categories — an ambiguous classification is itself a bug', () => {
    const seen = new Map();
    for (const [category, tables] of Object.entries(TABLE_CATEGORIES)) {
      for (const table of tables) {
        expect(
          seen.has(table),
          `"${table}" is in both ${seen.get(table)} and ${category}`,
        ).toBe(false);
        seen.set(table, category);
      }
    }
  });

  // The two tables NEW-44 was raised for. Asserted by category rather than by
  // mere presence, because "classified" was never the goal — "classified as
  // the thing we actually intend" was.
  it('customer_contracts and team_invites are classified, deliberately, not absorbed', () => {
    expect(classifyTable('customer_contracts')).toBe('intentionally_excluded');
    expect(classifyTable('team_invites')).toBe('intentionally_excluded');
    expect(TABLE_CATEGORIES.deleted).not.toContain('customer_contracts');
    expect(TABLE_CATEGORIES.deleted).not.toContain('team_invites');
  });

  it('classifies the tables an org_id sweep could never reach', () => {
    // These are the ones the previous snapshot was structurally blind to.
    expect(classifyTable('organisations')).toBe('platform_scoped');
    expect(classifyTable('profiles')).toBe('platform_scoped');
    expect(classifyTable('platform_admins')).toBe('platform_scoped');
    expect(classifyTable('api_rate_limits')).toBe('infrastructure');
    expect(classifyTable('calendar_synced_events')).toBe('parent_excluded');
    expect(classifyTable('meetings_legacy_unused')).toBe('unused_legacy');
  });
});

// ── §11 core acceptance: the gate must be capable of failing ──
//
// A gate that has never been observed to fail is not known to be a gate. Both
// directions are driven through a synthetic corpus, so neither needs a real
// migration or a real table.
describe('NEW-44 — the gate fails when it should', () => {
  const classified = [{ name: 'x_2026-01-01.sql', sql: 'create table public.cases (id uuid);' }];
  const unclassified = [{ name: 'x_2026-01-01.sql', sql: 'create table public.not_classified_anywhere (id uuid);' }];

  it('FAILS for a relevant table nobody classified', () => {
    const missing = unclassifiedTables(declaredPublicTables(unclassified));
    expect(missing).toEqual(['not_classified_anywhere']);
  });

  it('PASSES for a table that is classified', () => {
    expect(unclassifiedTables(declaredPublicTables(classified))).toEqual([]);
  });

  // §16/§17 — the two tables the roadmap will add next. Demonstrated WITHOUT
  // creating either one: the corpus is a string in this test, no file is
  // written to supabase/, and no migration is applied. If someone adds
  // public.case_decisions for the D4 appeal model, or public.ask_threads for
  // durable Ask Compass, and classifies neither, the first test in this file
  // fails with that table's name in the message.
  it('case_decisions ARRIVED in D4.2 and could not land unclassified', () => {
    // This test previously asserted case_decisions would FAIL the gate because
    // it did not exist. D4.2 created it, and the gate is precisely why it could
    // not be merged without a deletion classification. Kept as the positive
    // half of the same proof.
    expect(declaredPublicTables(corpus())).toContain('case_decisions');
    expect(classifyTable('case_decisions')).toBe('cascade_covered');
    expect(unclassifiedTables(declaredPublicTables(corpus()))).toEqual([]);
  });

  it('WOULD still fail for a table that does not exist', () => {
    const future = [{ name: 'decision_notes_2027-01-01.sql', sql: 'create table public.decision_notes (id uuid, case_id uuid);' }];
    expect(unclassifiedTables(declaredPublicTables(future))).toEqual(['decision_notes']);
    expect(declaredPublicTables(corpus())).not.toContain('decision_notes');
    expect(classifyTable('decision_notes')).toBeNull();
  });

  it('WOULD fail for public.ask_threads before it exists', () => {
    const future = [{ name: 'ask_threads_2027-01-01.sql', sql: 'create table if not exists ask_threads (id uuid);' }];
    expect(unclassifiedTables(declaredPublicTables(future))).toEqual(['ask_threads']);
    expect(declaredPublicTables(corpus())).not.toContain('ask_threads');
    expect(classifyTable('ask_threads')).toBeNull();
  });
});

// ── the derivation itself ──
//
// The gate is only as good as the set it is handed, so the parser is tested
// against production rather than against its own output.
describe('NEW-44 — the derived schema matches production', () => {
  // An independent reading of the live schema, taken on 2026-10-02 by querying
  // pg_class/pg_namespace directly against project npeegfsoijhdnnvuqjin
  // (relkind in r,p,v,m,f — all 43 came back relkind 'r', none owned by an
  // extension).
  //
  // This fixture validates the PARSER, and is not the coverage mechanism — the
  // test above derives its own list and would catch a table added tomorrow
  // without this fixture being touched. That separation is the whole fix: the
  // thing that must stay fresh is now computed, and the hand-typed thing has
  // no power to make a gap look green.
  // ┌─ TWO LISTS, AND THE DIFFERENCE BETWEEN THEM IS THE POINT ──────────────┐
  // │ VERIFIED_LIVE_* is a MEASUREMENT: every name was read back out of      │
  // │ pg_class after being applied. PENDING_MIGRATION_* is a CLAIM: the       │
  // │ corpus declares it and production does not have it yet.                 │
  // │                                                                         │
  // │ They were one list until IR-REPORT-01b/B2, when merging the two would   │
  // │ have meant asserting a table existed in production when it did not.     │
  // │ Keeping them apart means the pending state is structural — a name       │
  // │ cannot drift from "proposed" to "verified" because someone edited a     │
  // │ comment.                                                                │
  // └─────────────────────────────────────────────────────────────────────────┘

  // MEASURED. 44 tables, read from pg_class on 2026-10-02 (+ case_decisions
  // re-read 2026-10-03 after Wave D4.2 was applied: 44 base tables, 44 with
  // RLS, 0 views). NOTHING may be added here without a fresh reading taken
  // AFTER the migration has been applied to production.
  //
  // investigation_finding_revisions added 2026-10-09 under exactly that rule:
  // IR-REPORT-01b/B2 was applied to production that day and pg_class was
  // re-read afterwards — 45 base tables, the table present, RLS enabled, two
  // policies. It moved out of PENDING_PRODUCTION_SCHEMA at the same time,
  // which is the only legitimate way a name arrives in this list.
  //
  // investigation_report_versions added the same day under the same rule:
  // B3.1 was applied to production on 2026-10-09 and pg_class/pg_policies were
  // re-read afterwards — 46 base tables, the table present, RLS enabled,
  // exactly two policies, matching the recorded posture. It emptied
  // PENDING_PRODUCTION_SCHEMA on the way through.
  const VERIFIED_LIVE_PUBLIC_TABLES_2026_10_02 = [
    'investigation_finding_revisions',
    'investigation_report_versions',
    'allegations', 'api_rate_limits', 'audit_log', 'calendar_connections',
    'calendar_synced_events', 'case_access', 'case_signals', 'case_tasks', 'case_themes',
    'case_decisions',
    'case_views', 'cases', 'concern_referrals', 'customer_contracts', 'dsar_requests',
    'employee_activities', 'employee_activity_records', 'employee_employment_events',
    'employee_portal_accounts', 'employee_portal_invites', 'employee_records',
    'er_executive_briefs', 'graph_mail_connections', 'hr_review_requests',
    'improvement_initiatives', 'integration_events', 'leaver_instances', 'locations',
    'manager_capability_insights', 'meetings', 'meetings_legacy_unused', 'org_events',
    'org_members', 'org_roles', 'organisation_themes', 'organisations', 'platform_admins',
    'process_templates', 'profiles', 'redundancy_cases', 'signing_requests',
    'starter_instances', 'team_invites', 'wellbeing_notes',
  ];

  // NOT MEASURED. Declared by the migration corpus, NOT applied to production.
  // Each entry is a pending deployment. On deployment: re-read pg_class, move
  // the name into VERIFIED_LIVE_* above with the new date and counts, and empty
  // this list. If the slice is abandoned, delete the name here AND its
  // migration file.
  // Imported, not restated: PENDING_PRODUCTION_SCHEMA in
  // src/lib/dataClassification.js is the one place a slice is marked
  // "proposed, not deployed", so this gate and the RLS/classification gates
  // cannot disagree about which tables are live.
  const PENDING_MIGRATION_TABLES = [...PENDING_PRODUCTION_SCHEMA];

  const EXPECTED_POST_MIGRATION_TABLES =
    [...VERIFIED_LIVE_PUBLIC_TABLES_2026_10_02, ...PENDING_MIGRATION_TABLES].sort();

  it('replaying supabase/ reproduces the EXPECTED POST-MIGRATION schema', () => {
    // The corpus describes the schema as it will be once every pending
    // migration is applied — which is what a repository can honestly know.
    const declared = declaredPublicTables(corpus());
    expect(declared).toEqual(EXPECTED_POST_MIGRATION_TABLES);
  });

  it('keeps the VERIFIED live reading free of anything merely proposed', () => {
    // The guard against the easy mistake: adding a pending table to the
    // measured list, which would assert it exists in production when it does
    // not. These two sets must stay disjoint.
    const leaked = PENDING_MIGRATION_TABLES.filter(t => VERIFIED_LIVE_PUBLIC_TABLES_2026_10_02.includes(t));
    expect(
      leaked,
      `Proposed table(s) have been added to the VERIFIED live reading: ${leaked.join(', ')}. `
      + 'A name belongs there only after it has been applied to production and read back '
      + 'out of pg_class.',
    ).toEqual([]);
    expect(VERIFIED_LIVE_PUBLIC_TABLES_2026_10_02).toHaveLength(46);
  });

  it('proves no live table was created outside the migration corpus', () => {
    // The equality above implies this, but it is the property that matters and
    // it deserves to fail by its own name: if someone creates a table in the
    // Supabase dashboard, the repository-derived gate cannot see it, and this
    // is where that shows up. Asserted against the VERIFIED list only —
    // a pending table is absent from production by definition, not undeclared.
    const undeclared = VERIFIED_LIVE_PUBLIC_TABLES_2026_10_02.filter(t => !declaredPublicTables(corpus()).includes(t));
    expect(undeclared, `Live but declared by no migration: ${undeclared.join(', ')}`).toEqual([]);
  });
});

// ── comment stripping, which is load-bearing, not cosmetic ──
describe('NEW-44 — SQL comments cannot move the schema', () => {
  it('strips -- to end of line and /* blocks */', () => {
    expect(stripSqlComments('create table public.a (id uuid); -- create table public.b (id uuid);'))
      .not.toContain('public.b');
    expect(stripSqlComments('/* create table public.b (id uuid); */ create table public.a (id uuid);'))
      .not.toContain('public.b');
  });

  it('a COMMENTED rollback cannot rename a live table away', () => {
    // This is real: supabase/standalone_meetings_2026-09-25.sql:464 documents
    // its own rollback as `--   alter table public.meetings_legacy_unused
    // rename to meetings;`. Honouring it would drop meetings_legacy_unused —
    // transcript, prep_pack, outcome_letter — out of the inventory entirely.
    const files = [{
      name: 'm_2026-01-01.sql',
      sql: `create table public.meetings_legacy_unused (id uuid);
            -- rollback:
            --   alter table public.meetings_legacy_unused rename to meetings;`,
    }];
    expect(declaredPublicTables(files)).toEqual(['meetings_legacy_unused']);
  });

  it('a COMMENTED drop cannot delete a live table from the derived set', () => {
    const files = [{
      name: 'e_2026-01-01.sql',
      sql: `create table public.employee_activities (id uuid);
            --   drop table if exists public.employee_activities;`,
    }];
    expect(declaredPublicTables(files)).toEqual(['employee_activities']);
  });

  it('the real corpus contains both of those commented lines, so this is not hypothetical', () => {
    const sql = readFileSync('supabase/standalone_meetings_2026-09-25.sql', 'utf8');
    expect(sql).toContain('--   alter table public.meetings_legacy_unused rename to meetings;');
    expect(readFileSync('supabase/employee_activities_2026-09-27.sql', 'utf8'))
      .toContain('--   drop table if exists public.employee_activities;');
    // and the derived set keeps both tables anyway
    const declared = declaredPublicTables(corpus());
    expect(declared).toContain('meetings_legacy_unused');
    expect(declared).toContain('employee_activities');
  });

  it('does not mistake prose about DDL for DDL', () => {
    // A naive grep during this audit reported a table called `comment`, from
    // baseline_schema's line "(see its CREATE TABLE comment above)".
    expect(declaredPublicTables(corpus())).not.toContain('comment');
  });
});

describe('NEW-44 — DDL events are applied in the order they execute', () => {
  it('an UNcommented rename moves the table', () => {
    const files = [{ name: 'a_2026-01-01.sql', sql: 'create table public.meetings (id uuid); alter table public.meetings rename to meetings_legacy_unused;' }];
    expect(declaredPublicTables(files)).toEqual(['meetings_legacy_unused']);
  });

  it('a rename followed by a new table of the same name yields BOTH', () => {
    // Exactly what standalone_meetings_2026-09-25.sql does, and what
    // production has.
    const files = [{
      name: 'a_2026-01-01.sql',
      sql: `create table public.meetings (id uuid);
            alter table public.meetings rename to meetings_legacy_unused;
            create table public.meetings (id uuid, org_id uuid);`,
    }];
    expect(declaredPublicTables(files)).toEqual(['meetings', 'meetings_legacy_unused']);
  });

  it('a drop and recreate within one file leaves the table present', () => {
    // audit_log_cloud_sync_2026-07-25.sql drops public.audit_log at line 27 and
    // recreates it at line 29. Collecting creates and drops separately would
    // conclude audit_log does not exist — and audit_log is the one table whose
    // absence from the inventory would be invisible, since it is handled
    // outside the main loop.
    const files = [{ name: 'a_2026-01-01.sql', sql: 'create table public.audit_log (id uuid); drop table if exists public.audit_log cascade; create table public.audit_log (id uuid, org_id uuid);' }];
    expect(declaredPublicTables(files)).toEqual(['audit_log']);
    expect(declaredPublicTables(corpus())).toContain('audit_log');
  });

  it('orders files by their embedded date, not alphabetically', () => {
    const files = [
      { name: 'zzz_topic_2026-01-01.sql', sql: 'create table public.early (id uuid);' },
      { name: 'aaa_topic_2026-06-01.sql', sql: 'drop table public.early;' },
    ];
    expect(migrationOrder(files).map(f => f.name)).toEqual(['zzz_topic_2026-01-01.sql', 'aaa_topic_2026-06-01.sql']);
    expect(declaredPublicTables(files)).toEqual([]);
  });

  it('never reads alter policy ... rename to as a table rename', () => {
    const files = [{
      name: 'a_2026-01-01.sql',
      sql: `create table public.meetings_legacy_unused (id uuid);
            alter policy "Own meetings" on public.meetings_legacy_unused rename to "Own meetings (legacy unused table)";`,
    }];
    expect(declaredPublicTables(files)).toEqual(['meetings_legacy_unused']);
  });

  it('reads an unqualified create table, because the SQL editor runs in public', () => {
    expect(schemaEventsIn('create table starter_instances (id uuid);'))
      .toEqual([{ at: 0, kind: 'create', table: 'starter_instances' }]);
  });
});

// ── §3 the relevance rule ──
describe('NEW-44 — the relevance rule', () => {
  it('a public base table is relevant', () => {
    expect(isRelevantTable({ schema: 'public', kind: 'BASE TABLE' })).toBe(true);
    expect(isRelevantTable()).toBe(true);   // the defaults describe the relevant case
  });

  it('excludes Postgres and Supabase infrastructure by SCHEMA, not by name', () => {
    for (const schema of NON_RELEVANT_SCHEMAS) {
      expect(isRelevantTable({ schema, kind: 'BASE TABLE' }), schema).toBe(false);
    }
    // and an unlisted schema invented tomorrow is excluded by the same rule
    expect(isRelevantTable({ schema: 'some_future_supabase_schema', kind: 'BASE TABLE' })).toBe(false);
  });

  it('a table named like infrastructure is STILL relevant if it is in public', () => {
    // The dangerous shortcut would be a name pattern. api_rate_limits looks
    // like plumbing and is in public, so it is relevant and had to be
    // classified explicitly — which is how its user-id-bearing rate_key got
    // noticed at all.
    expect(isRelevantTable({ schema: 'public', kind: 'BASE TABLE' })).toBe(true);
    expect(classifyTable('api_rate_limits')).not.toBeNull();
  });

  it('excludes views, materialised views and extension-owned tables', () => {
    expect(isRelevantTable({ schema: 'public', kind: 'VIEW' })).toBe(false);
    expect(isRelevantTable({ schema: 'public', kind: 'MATERIALIZED VIEW' })).toBe(false);
    expect(isRelevantTable({ schema: 'public', kind: 'BASE TABLE', extension: 'postgis' })).toBe(false);
  });
});
