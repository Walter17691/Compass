#!/usr/bin/env node
// Phase 8B — Scenario 5's investigation-complete starting case, seeded
// via direct data rather than the real Compass UI. Document J §7
// originally called for manual UI seeding specifically to avoid rows
// that don't match every computed/derived field the Case Workspace
// expects; that plan assumed a facilitator could log in and build it
// by hand. This session hit a hard boundary instead: Claude does not
// handle account credentials, including this UAT sandbox's own
// self-generated ones, so an automated UI walkthrough wasn't available
// either. This script is the responsible middle ground — it only
// populates plain scalar columns (employee_name, case_type,
// description, investigation_report) whose shape is unambiguous
// (verified against baseline_schema_2026-08-06.sql and
// src/lib/caseMapping.js).
//
// stage is set EXPLICITLY to 'inv_report', not left unset — the first
// version of this script left it unset assuming getCaseStage()'s own
// heuristic (src/lib/caseStage.js) would derive "inv_report" from
// investigationReport being present, the same way a heuristic-only case
// would. Running it for real and checking the result through the app's
// actual getCaseStage/getNextStep (not just reading the source) caught
// that this was wrong: the `stage` column has a DB-level DEFAULT of
// 'open', so an unset stage becomes the literal string 'open' on
// insert, not null/undefined — and getCaseStage's very first line
// (`if (cs.stage) return cs.stage;`) returns an explicit stage
// immediately, before the heuristic branch is ever reached. The
// heuristic only exists for legacy meeting-only data with no tracked
// stage at all (per that function's own comment) — every case created
// through the guided flow always has an explicit stage from creation
// onward. 'inv_report' is confirmed as a real, correctly-handled stage
// value independently of the heuristic (see its labelled entry in
// HomeScreen.jsx's own statusMap: "Awaiting action"). It deliberately
// does NOT populate meetings/evidence jsonb (their exact internal
// shape wasn't verified against every consumer) — see the script's own
// final log message for what that means for the pilot.
//
// Usage: node --env-file=.env scripts/uat/seed-scenario-5.js

import { requireNonProductionSupabase, supabaseRest } from './_guard.js';

const UAT_ORG_NAME = 'Meridian Fulfilment Ltd (UAT)';
const EMPLOYEE_NAME = 'Grace Oduya';

const INVESTIGATION_REPORT = `Allegation: On 4th, Grace Oduya (Warehouse Supervisor, Swindon DC2) was found to have wedged open and disabled the safety interlock on Conveyor Line 3's guard gate, allowing the line to keep running with the guard open, in order to clear a jam faster during a backlog. Ten minutes later, an operative (Kian Doyle) reached into the guarded area to clear a second jam, believing the line was stopped as per normal procedure when the guard is open, and narrowly avoided a hand injury when the belt engaged.

Evidence gathered during investigation:
- CCTV confirms Grace wedging the guard gate mechanism at approximately 14:12, and confirms Kian's near-miss at approximately 14:22.
- Grace's investigation interview (12th): she accepts she disabled the interlock, says the line was "massively backed up," she'd done the same thing "once or twice before with no issue," and that she "didn't think it through" regarding anyone else being near the line. She says she didn't warn Kian or anyone else that the guard was disabled.
- Kian's witness statement: confirms the near-miss, confirms no one had told him the guard was disabled, says "if I'd been half a second later I'd have lost fingers."
- Site safety records confirm Conveyor Line 3's guard interlock is a Category 3 safety-critical control per the site's own risk assessment, not a minor procedural step.
- No evidence found that Grace had disabled the interlock on any other occasion beyond her own account of "once or twice before" — this could not be independently corroborated either way.`;

async function main() {
  requireNonProductionSupabase();

  const orgRes = await supabaseRest(`organisations?name=eq.${encodeURIComponent(UAT_ORG_NAME)}&select=id`);
  if (!orgRes.ok) throw new Error(`Org lookup failed: ${orgRes.status} ${await orgRes.text()}`);
  const [org] = await orgRes.json();
  if (!org) throw new Error(`"${UAT_ORG_NAME}" not found — run seed-uat-org.js first.`);

  const existingRes = await supabaseRest(`cases?org_id=eq.${org.id}&employee_name=eq.${encodeURIComponent(EMPLOYEE_NAME)}&select=id`);
  if (!existingRes.ok) throw new Error(`Existing-case lookup failed: ${existingRes.status} ${await existingRes.text()}`);
  const existing = await existingRes.json();
  if (existing.length) {
    console.log(`A case for "${EMPLOYEE_NAME}" already exists (${existing[0].id}) — run reset-uat-case.js --scenario 5 first if you want a fresh one.`);
    return;
  }

  const insertRes = await supabaseRest('cases', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({
      org_id: org.id,
      employee_name: EMPLOYEE_NAME,
      case_type: 'misconduct',
      stage: 'inv_report',
      description: 'Alleged deliberate disabling of a safety-critical guard interlock on Conveyor Line 3, leading to a near-miss injury to a colleague. Investigation complete; case now needs to progress to disciplinary.',
      investigation_report: INVESTIGATION_REPORT,
      investigation_report_date: new Date().toISOString().slice(0, 10),
    }),
  });
  if (!insertRes.ok) throw new Error(`Failed to create Scenario 5 case: ${insertRes.status} ${await insertRes.text()}`);
  const [created] = await insertRes.json();
  console.log(`Created Scenario 5 case for "${EMPLOYEE_NAME}" (${created.id}), case_type=misconduct.`);
  console.log('\nDeliberately NOT populated (unverified jsonb shape, left for the facilitator to add live if useful): meetings (Grace\'s interview, Kian\'s witness statement as structured records), evidence (CCTV/safety-record entries). The investigation_report field above already contains this content as narrative text, so the case is genuinely readable and usable for the pilot, but the Meetings/Evidence tabs will be empty rather than populated with those same facts as separate structured entries.');
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
