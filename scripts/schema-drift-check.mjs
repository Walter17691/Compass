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
  ORG_SCOPED_TABLES, deletionOrderViolations,
} from '../src/lib/dataInventory.js';
import {
  classificationFor, DATA_CLASS, SECURITY_POSTURE, postureFor, serviceRoleReasonFor,
} from '../src/lib/dataClassification.js';
import { computeInventoryFingerprint, VERIFIED_INVENTORY_FINGERPRINT } from '../src/lib/inventoryFingerprint.js';
import { tenancyViolations } from '../src/lib/schemaGovernance.js';

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

  // NEW-44D — the live column shape. The CI gate derives columns by replaying
  // the migration corpus, which is blind to a table created in the dashboard.
  // This is the only reading that is not.
  columns: `select c.relname as table_name, a.attname as column_name
from pg_class c
join pg_namespace n on n.oid = c.relnamespace
join pg_attribute a on a.attrelid = c.oid
where n.nspname = 'public' and c.relkind = 'r' and a.attnum > 0 and not a.attisdropped
order by c.relname, a.attname;`,

  // Constraint-LEVEL foreign keys, so a composite (employee_id, org_id) arrives
  // as one row with both columns rather than two rows the tenancy rule could
  // not recognise as composite.
  fkColumns: `select rel.relname as table_name, con.conname as constraint_name,
       parent.relname as parent_table,
       array_agg(att.attname order by att.attname) as columns
from pg_constraint con
join pg_class rel on rel.oid = con.conrelid
join pg_class parent on parent.oid = con.confrelid
join pg_namespace n on n.oid = rel.relnamespace
join unnest(con.conkey) as k(attnum) on true
join pg_attribute att on att.attrelid = rel.oid and att.attnum = k.attnum
where n.nspname = 'public' and con.contype = 'f'
group by rel.relname, con.conname, parent.relname
order by rel.relname, con.conname;`,

  // NEW-44 governance closure — the live security posture. The CI test checks
  // the DECLARATION against a recorded reading; this is the half that notices
  // RLS being switched off, or a policy appearing on a table declared
  // service-role-only, or disappearing from one that relies on policies.
  rls: `select c.relname as table_name,
       c.relrowsecurity as rls_enabled,
       (select count(*) from pg_policies p where p.schemaname = 'public' and p.tablename = c.relname) as policies
from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relkind = 'r'
order by c.relname;`,
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
    columns: await run(QUERIES.columns),
    fkColumns: await run(QUERIES.fkColumns),
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
    // NEW-44 (second pass) — deletion ORDER, checked against the LIVE restrict
    // graph rather than the recorded one. The CI test checks the order against
    // RESTRICTING_FOREIGN_KEYS, which is itself a recording; this is the half
    // that notices a rule changing to RESTRICT underneath that list, which
    // would make a previously-safe order unsafe without any code changing.
    const liveRestricting = live.foreignKeys
      .filter(f => f.delete_rule === 'RESTRICT' || f.delete_rule === 'NO ACTION')
      .map(f => ({ child: f.child, parent: f.parent, column: f.column_name, rule: f.delete_rule }));
    for (const v of deletionOrderViolations(ORG_SCOPED_TABLES, liveRestricting)) {
      findings.push(`DELETION ORDER: ${v.why}`);
    }
  } else {
    unverified.push('foreign keys / cascade rules (no foreignKeys in this reading)');
    unverified.push('deletion ORDER against the live RESTRICT graph');
  }

  // Both registers must agree, live. A table present in production and in the
  // deletion inventory but missing a classification would still pass the
  // deletion gate alone.
  const unclassifiedMeta = relevant.filter(t => !classificationFor(t));
  if (unclassifiedMeta.length) {
    findings.push(`Live with no entry in dataClassification.js: ${unclassifiedMeta.join(', ')} — say what each table is and what DSAR owes it.`);
  }

  // NEW-44 governance closure — live security posture vs the declaration.
  if (Array.isArray(live.rls)) {
    for (const row of live.rls) {
      const meta = classificationFor(row.table_name);
      if (!meta) continue;                       // already reported as unclassified
      const policies = Number(row.policies);
      const enabled = row.rls_enabled === true || row.rls_enabled === 't';
      if (!enabled && meta.dataClass === DATA_CLASS.CUSTOMER) {
        findings.push(`RLS is DISABLED on ${row.table_name}, which holds customer data.`);
      }
      const declared = postureFor(row.table_name);
      if (enabled && policies === 0 && declared !== SECURITY_POSTURE.SERVICE_ROLE_ONLY) {
        findings.push(`${row.table_name} has RLS enabled with ZERO policies but does not declare service-role-only intent — declare it in SERVICE_ROLE_ONLY_TABLES with a reason (do not add a client policy to silence this).`);
      }
      if (declared === SECURITY_POSTURE.SERVICE_ROLE_ONLY && policies > 0) {
        findings.push(`${row.table_name} is declared service-role-only but now has ${policies} polic${policies === 1 ? 'y' : 'ies'} — client access was broadened; re-check the reason: "${(serviceRoleReasonFor(row.table_name) || '').slice(0, 80)}…"`);
      }
    }
  } else {
    unverified.push('live RLS state and security posture');
  }

  // NEW-44D — structural tenancy against the LIVE schema. The CI gate derives
  // this from the migration corpus; this is the half that sees a table created
  // outside it, and the half that notices a composite FK being dropped in
  // production without any repository change.
  if (Array.isArray(live.columns) && Array.isArray(live.fkColumns)) {
    const byTable = new Map();
    for (const row of live.columns) {
      if (!byTable.has(row.table_name)) byTable.set(row.table_name, []);
      byTable.get(row.table_name).push(String(row.column_name).toLowerCase());
    }
    const liveTenancyTables = [...byTable.entries()]
      .filter(([, cols]) => cols.includes('org_id'))
      .map(([name, columns]) => ({ name, columns }));
    const liveTenancyFks = live.fkColumns.map(f => ({
      table: f.table_name,
      parent: f.parent_table,
      columns: (Array.isArray(f.columns) ? f.columns : String(f.columns || '').replace(/[{}]/g, '').split(','))
        .map(c => String(c).trim().toLowerCase()).filter(Boolean),
    }));
    for (const v of tenancyViolations(liveTenancyTables, liveTenancyFks)) {
      findings.push(`STRUCTURAL TENANCY: ${v.why}`);
    }
  } else {
    unverified.push('structural tenancy against the live column/FK shape');
  }

  // The attestation the destructive path depends on.
  if (computeInventoryFingerprint() !== VERIFIED_INVENTORY_FINGERPRINT) {
    findings.push('The inventory fingerprint does not match the committed attestation — "Delete all data" will refuse to run from this build. Run the suite, then `node scripts/inventory-fingerprint.mjs --write`.');
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
