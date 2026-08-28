# Document L — Pre-UAT Go/No-Go & Manual Actions

## Pre-UAT readiness checklist

- [ ] **Environment**: `Meridian Fulfilment Ltd (UAT)` organisation exists in `compass-e2e-test`, isolated from production (Document J §1) — confirmed by running `scripts/uat/seed-uat-org.js` successfully.
- [ ] **Synthetic data**: all 20 roster people exist as `employee_records` (Document J §4); zero real employee data present in the UAT org.
- [ ] **Accounts**: all 7 `uat-hr-*` accounts created, correct role each (Document J §5), credentials generated and stored only in the gitignored local file.
- [ ] **Scenario fixtures**: Scenarios 1–4/6 confirmed to start clean (no pre-existing case) via `scripts/uat/reset-uat-case.js --scenario <N> --dry-run`; Scenario 5's investigation case manually seeded and checked against Document C's content field-by-field.
- [ ] **Reset**: `reset-uat-case.js` run at least once for real (not just dry-run) and confirmed to actually clear a case correctly (done automatically as part of running the pilot's post-session reset).
- [ ] **UAT documentation compatible with current product**: Section 1 review complete — see findings below.
- [ ] **Recording process**: screen+audio recording tested once, confirmed it actually captures both channels, confirmed a consent script is in place (Document K).
- [ ] **Findings register**: Document G's live spreadsheet created (not just the markdown seed) and shared with anyone else involved in triage.
- [ ] **Version**: frozen commit recorded in Document J §2.
- [ ] **Core application healthy**: confirm `compass-e2e-test`-pointed build loads Home/Cases/Settings without error before the first real session (a 2-minute manual smoke check, not a substitute for the checklist above).

Do not substitute the existing automated test suite (Vitest/Playwright) for this checklist — those verify the *application*, not that *this specific UAT programme* is ready to run (brief §18's explicit instruction).

## Section 1 review findings (docs/UAT/ vs. current deployed product)

Reviewed every file in `docs/UAT/` against the current codebase (the real 12-tab Case Workspace, the real guardrail/quality-check titles, the real OH referral flow, the real case-type list at case creation, current Settings structure, current sidebar nav) and the live production deployment.

**Result: no corrections required.** Specifically checked and confirmed:
- Case Workspace tabs referenced anywhere in Document C/E (Overview, Allegations, Evidence, Outcome, etc.) match `src/screens/CaseViewScreen.jsx`'s real 12-tab list exactly.
- The guardrail check named in Scenario 5 ("the Appeal Manager made the original decision") exists verbatim in `src/lib/guardrails.js`.
- The Occupational Health referral flow named in Scenario 4 (referral → HR review → adjustments considered → review date) matches `src/components/OccupationalHealthPanel.jsx`'s real step sequence.
- The case-type options a tester would actually see at case creation (Misconduct, Grievance, Absence, Attendance/sickness, Disciplinary, etc.) cover every scenario's real case type without any scenario needing to reference a type that doesn't exist.
- No scenario, task sheet, or facilitator instruction references Onboarding or Offboarding (removed product-wide, Phase 7.5C) — confirmed by design, not by after-the-fact grep, since Document C was written after that removal.
- No task sheet (Document D) names a Compass screen, tab, or button — confirmed by re-reading all six against the "do not over-instruct" rule (brief §7) before this task began.
- Settings' current grouped structure (post-7.5C) doesn't conflict with anything in the pack — no scenario instructs a tester toward a specific Settings section, so the grouping change has no bearing on any task.

## Manual actions — required before pilot

1. **Supply the tester email domain.** `scripts/uat/seed-uat-org.js` needs `UAT_TESTER_DOMAIN` set (e.g. a domain you control, or a single mailbox with `+` aliasing — `uat-hr+1@yourdomain.com` through `uat-hr+7@yourdomain.com` both work). This cannot be guessed or defaulted safely.
2. **Run the seed script**: `UAT_TESTER_DOMAIN=<your domain> node --env-file=.env scripts/uat/seed-uat-org.js`. Confirm it completes without error and creates the org + 7 accounts + 20 employee records.
3. **Manually seed Scenario 5's investigation case** through the real Compass UI, logged in as `uat-hr-1@…`, following Document C's Scenario 5 investigation summary field-for-field (Document J §7 explains why this one is manual, not scripted).
4. **Confirm reset tooling works**: run `node --env-file=.env scripts/uat/reset-uat-case.js --scenario 1 --dry-run` and confirm it reports cleanly (it will, since nothing exists yet — this just confirms connectivity/auth work before you need them mid-session).
5. **Set up screen+audio recording** on the machine the pilot will run on; do one short test recording and play it back to confirm both channels are actually captured.
6. **Create the live Document G spreadsheet** (Google Sheet/Excel) from the markdown seed table, share it with anyone else who'll see findings.
7. **Schedule the pilot session** with Tester #1 (Experienced HR/ER, Document J §5) — Scenario 5.
8. **Print or otherwise prepare Document C's Scenario 5 raw material** (investigation summary; the appeal email held back for the mid-session hand-off) and Document D's Scenario 5 task sheet.

## Manual actions — required before main UAT (after a successful pilot)

9. **Incorporate any pilot-driven adjustments** to Document C/D/E/F timing or clarity (brief §16) — update the markdown files in `docs/UAT/`, re-commit.
10. **Schedule the remaining 6 sessions** per Document K's main session order, spaced across multiple days (not back-to-back).
11. **Confirm each tester's real identity/contact details privately** (not in any UAT documentation) so you know who's using which `uat-hr-<n>@…` login — this mapping should live somewhere private (your own notes), not in `docs/UAT/` or Document G, to keep the committed documentation itself free of real personal information about the testers.
12. **Reset the environment between every session** (Document K's "After" checklist) — don't let this slip once real sessions are running back-to-back over a week.
13. **Re-run the pre-UAT readiness checklist above** once more, specifically the "core application healthy" smoke check, on the day the main round begins (not just once at pilot time) — confirms nothing drifted between the pilot and the main round starting.

## GO / NO-GO

**READY FOR PILOT UAT AFTER MANUAL ACTIONS**

The programme itself (Documents A–I), the environment decision and its reasoning (Document J), the fixture/reset tooling (verified working end-to-end against the real, confirmed non-production `compass-e2e-test` project — guard tested to correctly accept the right project and reject production, missing config, and unrecognised projects), and the execution checklist (Document K) are all complete and internally consistent with the current deployed product (Section 1 review above found no corrections needed).

What's not yet done, and can't be done without you: the seed script has never actually been run for real, because it genuinely cannot run without a tester email domain only you can supply (Manual Action #1) — nothing here was left undone by oversight, it's the one input this preparation task structurally cannot manufacture on its own. Once that's supplied and the eight "before pilot" actions above are complete, the pilot can run immediately; nothing else stands between here and a real session.

This is deliberately not "READY TO BEGIN HUMAN UAT" outright — brief §16 requires a pilot before the main round regardless of how ready the preparation looks on paper, and that instruction is followed here rather than skipped.
