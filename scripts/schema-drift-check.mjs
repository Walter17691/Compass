#!/usr/bin/env node
// NEW-44 §6 — production schema-drift check.
//
// WHAT THIS ADDS OVER CI. src/test/schemaInventoryGate.test.js replays
// supabase/ and fails if a declared table is unclassified. It runs on every
// commit, needs no credentials, and would have caught customer_contracts and
// team_invites the day they landed. It has one blind spot, by construction: it
// sees what the REPOSITORY declares. A table created by hand in the Supabase
// dashboard is invisible to it, and so is a column or cascade changed there.
//
// Closing that needs a SQL-level reading of information_schema, which needs a
// credential the repository does not hold — so this is a deliberate release/
// audit command rather than a CI step, and NOT a serverless function (the
// Vercel function budget is full at 12/12, and a routed endpoint that can
// enumerate the schema would be a new attack surface for no benefit:
// there is no product feature here, only an operator check).
//
// WHEN IT RUNS
//   - before any release that contains a file in supabase/
//   - before any compliance/erasure audit, as the evidence that the inventory
//     matches production rather than matching the repository
//   - after any manual change made in the Supabase dashboard
//
// HOW IT RUNS
//   node --env-file=.env scripts/schema-drift-check.mjs
//       uses SUPABASE_ACCESS_TOKEN (a Supabase personal access token) against
//       the Management API. Read-only: every statement below is a SELECT and
//       the SQL is hardcoded here, never taken from an argument.
//
//   node scripts/schema-drift-check.mjs --live recorded-schema.json
//       compares against a reading an operator already took, for the case
//       where the token lives in a CI secret store rather than on a laptop.
//       --print-sql emits the exact queries to produce that file.
//
// EXIT CODES. 0 no drift, 1 drift found, 2 COULD NOT VERIFY. The third is the
// important one: a missing credential must never look like a clean result, so
// this command refuses to print a pass it did not earn.
//
// ┌─ A SOURCE THAT WAS REJECTED, WITH EVIDENCE ─────────────────────────────┐
// │ PostgREST serves an OpenAPI document at /rest/v1/ listing the tables it │
// │ exposes. It needs only the service key this repo already has, so it is  │
// │ the obvious implementation, and it is wrong. Measured against           │
// │ production on 2026-10-02 it returned 36 of 43 tables; invisible to it   │
// │ were customer_contracts, team_invites, employee_activities,             │
// │ employee_activity_records, employee_employment_events,                   │
// │ meetings_legacy_unused and platform_admins — because it advertises only │
// │ what is granted to the API roles, and an ungranted table is exactly the │
// │ kind nobody classified either. The first two of those seven ARE the     │
// │ tables this check exists to catch. Do not switch to it for convenience. │
// └─────────────────────────────────────────────────────────────────────────┘

import { readdirSync, readFileSync } from 'fs';
import { declaredPublicTables } from '../src/lib/schemaDeclarations.js';
import {
  unclassifiedTables, classifyTable, CASCADE_COVERED_TABLES,
  PARENT_EXCLUDED_TABLES, UNUSED_LEGACY_TABLES, NON_RELEVANT_SCHEMAS,
} from '../src/lib/dataInventory.js';

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'npeegfsoijhdnnvuqjin';

// Read-only by construction: hardcoded SELECTs, no interpolation of anything
// from the command line or the environment into the SQL.
const QUERIES = {
  // Relevance decided by schema and relkind, matching isRelevantTable():
  // ordinary/partitioned tables in public that no extension owns.
  tables: `select c.relname as table_name,
       case c.relkind when 'r' then 'BASE TABLE' when 'p' then 'BASE TABLE'
                      when 'v' then 'VIEW' when 'm' then 'MATERIALIZED VIEW' else 'OTHER' end as kind,
       (select e.extname from pg_depend d join pg_extension e on e.oid = d.refobjid
         where d.classid = 'pg_class'::regclass and d.objid = c.oid and d.deptype = 'e') as extension
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind in ('r','p','v','m','f')
order by c.relname;`,

  // §12 — the cascades the inventory's correctness depends on. A cascade that
  // silently becomes nullable, or is dropped, turns a cascade_covered table
  // into data that survives "Delete all data" with nothing to notice it.
  foreignKeys: `select tc.table_name as child, kcu.column_name as column_name,
       ccu.table_name as parent, rc.delete_rule,
       (select c.is_nullable from information_schema.columns c
         where c.table_schema = 'public' and c.table_name = tc.table_name
           and c.column_name = kcu.column_name) as is_nullable
from information_schema.table_constraints tc
join information_schema.key_column_usage kcu
  on kcu.constraint_name = tc.constraint_name and kcu.table_schema = 'public'
join information_schema.constraint_column_usage ccu
  on ccu.constraint_name = tc.constraint_name
join information_schema.referential_constraints rc
  on rc.constraint_name = tc.constraint_name
where tc.table_schema = 'public' and tc.constraint_type = 'FOREIGN KEY'
order by child, column_name;`,

  // The fossil invariant. meetings_legacy_unused carries transcript,
  // prep_pack, structured_record and outcome_letter columns, has no org_id,
  // and its case_id -> cases cascade is NULLABLE — so if it ever holds rows,
  // they cannot be erased per-organisation at all. Emptiness is the only thing
  // making its classification safe, so emptiness is measured, not assumed.
  legacyRowCounts: `select 'meetings_legacy_unused' as table_name, count(*) as row_count
from public.meetings_legacy_unused;`,
};

async function fetchLiveSchema(token) {
  const run = async sql => {
    const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/database/query`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: sql, read_only: true }),
    });
    if (!res.ok) throw new Error(`Management API ${res.status}: ${(await res.text()).slice(0, 300)}`);
    return res.json();
  };
  return {
    source: `Supabase Management API, project ${PROJECT_REF}`,
    readAt: new Date().toISOString(),
    tables: await run(QUERIES.tables),
    foreignKeys: await run(QUERIES.foreignKeys),
    legacyRowCounts: await run(QUERIES.legacyRowCounts),
  };
}

function loadRecordedSchema(path) {
  let parsed;
  try {
    parsed = JSON.parse(readFileSync(path, 'utf8'));
  } catch (error) {
    throw new Error(`Could not read recorded schema at ${path}: ${error.message}`);
  }
  if (!Array.isArray(parsed.tables)) {
    throw new Error(`${path} has no "tables" array — run with --print-sql for the queries that produce one.`);
  }
  return { ...parsed, source: `recorded reading from ${path}`, readAt: parsed.readAt || 'unknown' };
}

// ── the comparisons ──

function compare(live) {
  const findings = [];
  const unverified = [];

  const relevant = (live.tables || [])
    .filter(t => t.kind === 'BASE TABLE' && !t.extension)
    .map(t => t.table_name);
  const declared = declaredPublicTables(
    readdirSync('supabase').filter(f => f.endsWith('.sql'))
      .map(name => ({ name, sql: readFileSync(`supabase/${name}`, 'utf8') })),
  );

  // The finding this whole command exists for: a table in production that no
  // committed migration declares, which the CI gate cannot see.
  const undeclared = relevant.filter(t => !declared.includes(t));
  if (undeclared.length) {
    findings.push(`Live but declared by NO migration (invisible to the CI gate — created outside supabase/?): ${undeclared.join(', ')}`);
  }

  const vanished = declared.filter(t => !relevant.includes(t));
  if (vanished.length) {
    findings.push(`Declared by a migration but not present live: ${vanished.join(', ')} — the inventory describes a schema production does not have.`);
  }

  // The same question the CI gate asks, asked of production itself.
  const unclassified = unclassifiedTables(relevant);
  if (unclassified.length) {
    findings.push(`Live and classified NOWHERE in src/lib/dataInventory.js: ${unclassified.join(', ')} — decide what "Delete all data" owes each one.`);
  }

  // §12 — cascades.
  if (Array.isArray(live.foreignKeys)) {
    for (const table of CASCADE_COVERED_TABLES) {
      const fk = live.foreignKeys.find(f => f.child === table && f.parent === 'cases');
      if (!fk) findings.push(`${table} is classified cascade_covered but has NO foreign key to cases live — it would survive "Delete all data" entirely.`);
      else if (fk.delete_rule !== 'CASCADE') findings.push(`${table}.${fk.column_name} -> cases is ${fk.delete_rule}, not CASCADE — ${table} is not actually erased.`);
      else if (fk.is_nullable !== 'NO') findings.push(`${table}.${fk.column_name} is NULLABLE, so the cases cascade reaches only linked rows — the defect shape that made standalone meetings need explicit deletion.`);
    }
    for (const table of PARENT_EXCLUDED_TABLES) {
      const fk = live.foreignKeys.find(f => f.child === table);
      if (!fk) findings.push(`${table} is classified parent_excluded but has no foreign key live — its lifecycle is no longer tied to any parent.`);
      else if (classifyTable(fk.parent) !== 'intentionally_excluded') {
        findings.push(`${table} depends on ${fk.parent}, which is classified ${classifyTable(fk.parent)} rather than intentionally_excluded — reclassify ${table}.`);
      }
    }
  } else {
    unverified.push('foreign keys / cascade rules (no foreignKeys in this reading)');
  }

  // The fossil invariant.
  if (Array.isArray(live.legacyRowCounts)) {
    for (const table of UNUSED_LEGACY_TABLES) {
      const row = live.legacyRowCounts.find(r => r.table_name === table);
      if (!row) unverified.push(`row count for ${table}`);
      else if (Number(row.row_count) !== 0) {
        findings.push(`${table} holds ${row.row_count} row(s) and must be empty — it has case-content columns, no org_id and a NULLABLE cascade, so those rows cannot be erased per-organisation at all.`);
      }
    }
  } else {
    unverified.push(`row counts for ${UNUSED_LEGACY_TABLES.join(', ')}`);
  }

  return { findings, unverified, relevant, declared };
}

// ── entry point ──

async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--print-sql')) {
    console.log('-- NEW-44 schema-drift check. Run each against the project and save as');
    console.log('-- { "readAt": "<iso>", "tables": [...], "foreignKeys": [...], "legacyRowCounts": [...] }');
    for (const [name, sql] of Object.entries(QUERIES)) console.log(`\n-- ${name}\n${sql}`);
    return 0;
  }

  const recordedAt = args.indexOf('--live');
  const token = process.env.SUPABASE_ACCESS_TOKEN;

  let live;
  if (recordedAt !== -1) {
    live = loadRecordedSchema(args[recordedAt + 1]);
  } else if (token) {
    live = await fetchLiveSchema(token);
  } else {
    // The honesty requirement. Exiting 0 here would report a clean schema on
    // the strength of having never looked at one.
    console.error('SCHEMA DRIFT NOT VERIFIED — no live reading available.');
    console.error('');
    console.error('  Set SUPABASE_ACCESS_TOKEN (a Supabase personal access token) and re-run:');
    console.error('    node --env-file=.env scripts/schema-drift-check.mjs');
    console.error('  or supply a reading an operator already took:');
    console.error('    node scripts/schema-drift-check.mjs --live recorded-schema.json');
    console.error('    (node scripts/schema-drift-check.mjs --print-sql  for the exact queries)');
    console.error('');
    console.error('This is NOT a pass. The CI gate (src/test/schemaInventoryGate.test.js) checks');
    console.error('the schema the repository declares; only this command can see a table created');
    console.error('outside supabase/, and it has not seen one either way.');
    return 2;
  }

  const { findings, unverified, relevant, declared } = compare(live);

  console.log(`Source:   ${live.source}`);
  console.log(`Read at:  ${live.readAt}`);
  console.log(`Relevant live tables: ${relevant.length} (public, base tables, not extension-owned)`);
  console.log(`Declared by supabase/: ${declared.length}`);
  console.log(`Non-relevant schemas excluded by rule: ${NON_RELEVANT_SCHEMAS.length} enumerated, plus any schema not named 'public'.`);
  console.log('');

  for (const f of findings) console.log(`DRIFT:      ${f}`);
  for (const u of unverified) console.log(`UNVERIFIED: ${u}`);

  if (findings.length) {
    console.log(`\n${findings.length} drift finding(s). Classify in src/lib/dataInventory.js — never by editing a test fixture.`);
    return 1;
  }
  if (unverified.length) {
    console.log(`\nNo drift in what was checked, but ${unverified.length} invariant(s) were NOT verified. Not a clean result.`);
    return 2;
  }
  console.log('No drift. Every relevant live table is declared and classified; cascades and the fossil invariant hold.');
  return 0;
}

main().then(code => process.exit(code)).catch(error => {
  console.error(`SCHEMA DRIFT NOT VERIFIED — ${error.message}`);
  process.exit(2);
});
