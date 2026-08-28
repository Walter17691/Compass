#!/usr/bin/env node
// Phase 8A — deletes whatever case(s) exist for one UAT scenario's named
// employee, inside the Meridian Fulfilment Ltd (UAT) organisation only,
// so the next tester gets a clean starting point. Relies on the schema's
// own ON DELETE CASCADE (verified against supabase/*.sql for allegations,
// case_tasks, case_signals, case_themes, case_access, hr_review_requests
// — all cascade on case_id) rather than manually deleting from every
// child table by hand, which would silently drift out of date the next
// time a new case-scoped table is added. meetings/evidence/vault_docs/
// next_steps are jsonb columns directly on the cases row itself (see
// baseline_schema_2026-08-06.sql's own comment marking the separate
// `meetings` table dead) so they're removed for free with the row.
//
// Does NOT touch employee_records (the stable roster, Document J §4) —
// only cases and their cascaded children. Does NOT attempt to rebuild
// Scenario 5's pre-seeded investigation content; see Document J §7 for
// why that's a manual step, not scripted.
//
// Usage: node --env-file=.env scripts/uat/reset-uat-case.js --scenario 3
//        node --env-file=.env scripts/uat/reset-uat-case.js --scenario 3 --dry-run

import { requireNonProductionSupabase, supabaseRest } from './_guard.js';

const UAT_ORG_NAME = 'Meridian Fulfilment Ltd (UAT)';

// Document J §6 — one designated employee name per scenario, matching
// Document C exactly. Scenario 5 is intentionally excluded: its case is
// manually re-seeded (not scripted), so an accidental
// `--scenario 5` here still deletes it (useful for tearing down after
// the session) but this script has no corresponding *seed* logic for it.
const SCENARIO_EMPLOYEE = {
  1: 'Dean Ashworth',
  2: 'Ellen Marsh',
  3: 'Aisha Rahman',
  4: 'Martin Kowalski',
  5: 'Grace Oduya',
  6: 'Simon Boateng',
};

function parseArgs(argv) {
  const args = { dryRun: false };
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--scenario') args.scenario = Number(argv[++i]);
    else if (argv[i] === '--dry-run') args.dryRun = true;
  }
  return args;
}

async function main() {
  const { scenario, dryRun } = parseArgs(process.argv.slice(2));
  if (!scenario || !SCENARIO_EMPLOYEE[scenario]) {
    console.error(`Usage: --scenario <1-6> [--dry-run]. Got: ${scenario}`);
    process.exit(1);
  }

  requireNonProductionSupabase(); // throws (and exits the process) if this isn't safe to run

  const employeeName = SCENARIO_EMPLOYEE[scenario];

  const orgRes = await supabaseRest(`organisations?name=eq.${encodeURIComponent(UAT_ORG_NAME)}&select=id,name`);
  const orgs = await orgRes.json();
  if (!orgs.length) {
    console.log(`No organisation named "${UAT_ORG_NAME}" found — nothing to reset. Has scripts/uat/seed-uat-org.js been run yet?`);
    return;
  }
  const orgId = orgs[0].id;

  const casesRes = await supabaseRest(
    `cases?org_id=eq.${orgId}&employee_name=eq.${encodeURIComponent(employeeName)}&select=id,employee_name,case_type,stage,created_at`
  );
  const cases = await casesRes.json();

  if (!cases.length) {
    console.log(`Scenario ${scenario}: no existing case for "${employeeName}" in ${UAT_ORG_NAME} — already clean.`);
    return;
  }

  console.log(`Scenario ${scenario}: found ${cases.length} case(s) for "${employeeName}":`);
  for (const c of cases) console.log(`  - ${c.id} (${c.case_type || 'no type'}, stage: ${c.stage}, created ${c.created_at})`);

  if (dryRun) {
    console.log('\n--dry-run: not deleting. Re-run without --dry-run to actually reset.');
    return;
  }

  for (const c of cases) {
    const delRes = await supabaseRest(`cases?id=eq.${c.id}`, { method: 'DELETE' });
    if (!delRes.ok) {
      const body = await delRes.text();
      console.error(`Failed to delete case ${c.id}: ${delRes.status} ${body}`);
      process.exitCode = 1;
      continue;
    }
    console.log(`Deleted case ${c.id} and its cascaded children.`);
  }

  console.log(`\nScenario ${scenario} reset complete. Employee record for "${employeeName}" left intact.`);
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
