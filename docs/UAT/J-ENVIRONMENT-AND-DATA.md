# Document J — UAT Environment, Version Freeze, Dataset & Tester Accounts

## 1. Environment decision

**Recommendation: OPTION A — use the existing `compass-e2e-test` Supabase project, inside a brand-new, dedicated organisation ("Meridian Fulfilment Ltd (UAT)"), not the existing `E2E Test Org`.**

### Why not production
Production holds real external customer HR data. Nothing about UAT requires that, and Section 2 of this brief rules it out outright. Not considered further.

### Why not the existing `E2E Test Org` inside `compass-e2e-test`
That org already has 223+ accumulated cases from years of unattended automated E2E runs (confirmed live during Phase 7.5B/C verification). Two independent problems, either one disqualifying on its own:
- **Realism**: Home's Active Cases list, the 5-second Case Workspace test, and Needs Attention would all be swamped by hundreds of synthetic-but-irrelevant `E2E SignSync…`/`E2E Guardrail…` cases a human tester has never heard of — directly undermining the "what needs my attention, where do I start" observations this UAT programme exists to make (Document A/E).
- **Collision risk**: automated E2E specs actively create/mutate/delete data in that org on every CI run and every local `npm run test:e2e`. A live human UAT session sharing that org risks a background test run altering state mid-session, or a tester's UAT case being swept up by an E2E assertion scoped too broadly. Not a security risk (nothing crosses org boundaries), but a real risk to session validity.

### Why a new org, in the same project, is the right level of isolation
- **No new infrastructure, no new cost.** `compass-e2e-test` (`zdbbvljbndmujywtkwfy`) already exists, is already schema-verified against production (RLS/triggers/functions confirmed matching during its original provisioning), and creating one more organisation inside it is a handful of new rows, not a new Supabase project. Confirmed via `.env`'s `VITE_SUPABASE_URL` that this project — not production (`npeegfsoijhdnnvuqjin`) — is what the local app and E2E tooling already point at.
- **Real tenant isolation, not a convention.** Compass's own RLS is what actually separates the new UAT org from `E2E Test Org` and every other org in that project — the same multi-tenant boundary already relied on throughout this entire engagement, not something this plan is trusting for the first time.
- **Real permissions, real workflow behaviour.** Because it's the same schema, same RLS, same app build, every guardrail, quality check, and permission boundary a tester encounters is the genuine article — not a mock.
- **Scheduling mitigation, not a blocker.** CI's `e2e` job and local `npm run test:e2e` runs still touch the same physical Supabase project (different org, RLS-isolated data, but shared compute/connection pool on what is likely a small-tier project). **Avoid deliberately triggering a large local E2E run during a live UAT session** — don't push to `main` (which fires CI's `e2e` job) and don't run `npm run test:e2e` locally while a tester is mid-session. This costs nothing and removes the only real interference vector.

**If this project's automated E2E activity ever becomes a genuine problem in practice** (a session visibly slows down, or a scheduled run coincides with a booked slot), the fallback is a **second, UAT-only Supabase project**, following the exact same provisioning recipe already used to create `compass-e2e-test` itself. That is real new infrastructure (a new free-tier Supabase project — free-tier is the reasonable default, but confirm with me before creating it, per this task's own instruction not to add paid infrastructure without asking) and should only be done if Option A is observed to actually cause a problem, not pre-emptively.

## 2. Version freeze

| | |
|---|---|
| **Frozen commit** | `159943f` (Phase 7.5C — Home simplification, notification popover fix, Onboarding/Offboarding removal) or later, per whatever is on `main` at the moment UAT is declared ready. Record the exact commit here once fixed: `______` |
| **Production/UAT deployment** | The `compass-e2e-test`-pointed local/preview build testers actually use — **not** the public production Vercel deployment (`compass-lemon-iota.vercel.app`), which points at the production Supabase project. See §3 below for exactly how a tester reaches the UAT-pointed build. |
| **Database/schema version** | Whatever migration state `compass-e2e-test` is currently at — record via `supabase/` migration file list at freeze time, same discipline as every other phase in this engagement. |
| **Date UAT started** | Fill in when the pilot (Document K) actually runs. |

**Per brief §15**: this build stays frozen for the entire initial UAT round unless a UAT-P0 (Document G) forces an interim fix. If that happens, record in Document G exactly which testers ran against the pre-fix commit and which ran post-fix — do not silently let the "version under test" drift mid-round.

## 3. How a tester actually reaches the UAT environment

Compass's Supabase target is controlled by `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` at build time (`src/supabase.js`) — there is no in-app environment switcher. The public production URL (`compass-lemon-iota.vercel.app`) is wired to production and must not be used for UAT. Two practical options, in order of preference:

1. **A local dev server** (`npm run dev`, using the repo's own `.env`, which already points at `compass-e2e-test`) shared to the tester via screen share, or run **on the facilitator's machine with the tester sitting alongside** — simplest, zero deployment risk, matches how this whole engagement's own E2E verification has worked throughout.
2. **A separate Vercel preview deployment**, built from the same frozen commit with `VITE_SUPABASE_URL`/`VITE_SUPABASE_ANON_KEY` overridden to the `compass-e2e-test` project's values (Vercel supports per-deployment env var overrides without touching the production project's own env config). Use this only if remote/asynchronous tester sessions are genuinely needed — it is one extra thing that can drift from what's actually being tested, so prefer option 1 unless there's a real logistical reason not to.

**Either way: confirm before every session that the tab/window in front of the tester is genuinely pointed at `compass-e2e-test`, not production** — a quick, cheap check (e.g. the Settings → Organisation name reads "Meridian Fulfilment Ltd (UAT)", not a real org) belongs in Document K's pre-session checklist.

## 4. The Meridian Fulfilment Ltd (UAT) dataset

**Organisation:** Meridian Fulfilment Ltd (UAT) — plan set to `pro`/`stripe_subscription_status: active` at seed time (bypassing `SubscribeGate`, the same non-billing technique already used for the existing E2E test org, per this engagement's own established recipe). Two sites: **Reading DC1** and **Swindon DC2**.

**Consolidated roster** — every named fictional person across all six scenarios in Document C, in one place so seeding is a single pass rather than six disconnected ones. All fictional; none corresponds to any real Compass production record.

| Name | Role / job title | Site | Appears in |
|---|---|---|---|
| Priya Nathan | Shift Manager | Reading DC1 | Scenario 1, 4 |
| Dean Ashworth | Warehouse Operative | Reading DC1 | Scenario 1 |
| Callum Reeves | Warehouse Operative | Reading DC1 | Scenario 1 |
| Jade Whitfield | Warehouse Operative | Reading DC1 | Scenario 1 |
| Robert Nkemelu | Operations Manager | Swindon DC2 | Scenario 2 |
| Ellen Marsh | Team Leader (Inbound) | Swindon DC2 | Scenario 2 |
| Tomasz Nowak | Warehouse Operative (Inbound) | Swindon DC2 | Scenario 2 |
| Sadia Iqbal | Warehouse Operative (Inbound) | Swindon DC2 | Scenario 2 |
| Gareth Owusu | Warehouse Operative (Inbound) | Swindon DC2 | Scenario 2 |
| Aisha Rahman | Customer Service Advisor | Reading DC1 | Scenario 3 |
| Grant Aldous | Customer Service Team Leader | Reading DC1 | Scenario 3 |
| Leanne Foy | Customer Service Advisor | Reading DC1 | Scenario 3 |
| Marcus Webb | Customer Service Advisor | Reading DC1 | Scenario 3 |
| Martin Kowalski | Delivery Driver | Reading DC1 | Scenario 4 |
| Grace Oduya | Warehouse Supervisor | Swindon DC2 | Scenario 5 |
| Kian Doyle | Warehouse Operative | Swindon DC2 | Scenario 5 |
| Denise Okoro | IT Manager | Reading DC1 | Scenario 6 |
| Simon Boateng | IT Support Assistant | Reading DC1 | Scenario 6 |
| Nadia Cole | Warehouse Operative | Reading DC1 | Scenario 6 |
| Fola Adeyemi | Warehouse Operative | Reading DC1 | Scenario 6 |

**Seeded as `employee_records` rows** (name, job title, site) — genuinely realistic for a real org's Compass to already have its roster loaded before any case exists, and needed so a tester can find/select a real person when opening a case rather than free-typing every name from scratch. **Not pre-seeded as cases, allegations, meetings, or any case-scoped content** — see the Scenario Preparation Matrix (§6) for exactly what is and isn't pre-loaded per scenario.

**No manager-level or line-employee Compass *logins* are created for these 20 people** — none of them are ever the tester in any of the six scenarios (every task sheet casts the tester as the HR recipient, never the reporting manager or employee — see §5's note on role assignment). They exist in the dataset as employee records and as characters in the emails/statements (Document C), not as accounts anyone logs into during this round.

## 5. Tester account matrix

Every task sheet in Document D casts the tester as **"the HR Manager at Meridian Fulfilment Ltd"** — this is deliberate in the scenario design (Document D), so **every** tester genuinely needs HR-level Compass access to complete their assigned task, regardless of the tester's own real-world profile (an Operational Manager tester is still asked to *act as* HR for this round — see Document A's tester-profile table for why that's still a meaningful, distinct signal even though the in-app persona is the same). This is a deliberate consequence of the scenario design, not a shortcut — the brief's "don't simply make everybody HR/admin" caution is answered by *deliberately* varying `hr_manager` vs `hr_director` (a real, meaningful permission difference in this app — `hr_director` additionally carries confidential-case oversight, per `src/lib/roles.js`) rather than defaulting every tester to the single highest-privilege role.

A genuinely non-HR-persona round (testing the "raise a concern" journey as a line manager or employee, rather than as HR) is a real and valuable follow-up, but is out of scope for this round because none of the six approved scenarios' task sheets are written for it — flagging this as a good candidate for a *second* UAT round rather than retrofitting it into this one.

| Tester | Profile (Doc A) | Compass role | Login | Organisation | Scenario(s) assigned | Expected permissions | Deliberately unavailable |
|---|---|---|---|---|---|---|---|
| 1 | Experienced HR/ER | `hr_director` | `uat-hr-1@<domain>` | Meridian Fulfilment Ltd (UAT) | 5 (Disciplinary→Outcome→Appeal) | Full case access, confidential-case oversight, all Settings | Onboarding/Offboarding (removed product-wide, not role-gated) |
| 2 | Experienced HR/ER | `hr_director` | `uat-hr-2@<domain>` | Meridian Fulfilment Ltd (UAT) | 6 (Messy/high-risk) | As above | As above |
| 3 | HR generalist | `hr_manager` | `uat-hr-3@<domain>` | Meridian Fulfilment Ltd (UAT) | 2 (Complex investigation) | Full case access; **no** confidential-case oversight (tests whether that distinction is ever visibly load-bearing in this scenario — it shouldn't be, Scenario 2 has no `confidential` case) | Confidential-only views, if any exist |
| 4 | HR generalist + first-time user | `hr_manager` | `uat-hr-4@<domain>` | Meridian Fulfilment Ltd (UAT) | 1, then 3 | Full case access | Confidential-only views |
| 5 | Operational manager | `hr_manager` | `uat-hr-5@<domain>` | Meridian Fulfilment Ltd (UAT) | 4 (Attendance/OH) | Full case access | Confidential-only views |
| 6 | Operational manager + first-time user | `hr_manager` | `uat-hr-6@<domain>` | Meridian Fulfilment Ltd (UAT) | 3 (Grievance) | Full case access | Confidential-only views |
| 7 | First-time user | `hr_director` | `uat-hr-7@<domain>` | Meridian Fulfilment Ltd (UAT) | 6 (Messy/high-risk) | Full case access, confidential-case oversight | — |

**Login convention:** `uat-hr-<n>@<domain>` — `<domain>` should be a domain you control that can receive mail (needed for the real Supabase auth flow / any transactional email Compass sends), **not** a real employee's personal or work address. A single shared inbox with `+` aliasing (`uat-hr+1@yourdomain.com` through `uat-hr+7@yourdomain.com`) works well if you don't want to provision 7 separate mailboxes. **I need you to supply this domain/address pattern — see Section 19, Manual Action #1.**

**Passwords:** generated by the seed script (`scripts/uat/seed-uat-org.js`, §7) as random per-account strings, written only to a local `.gitignore`d file (`scripts/uat/.uat-credentials.local.json`, never committed) — never placed in this documentation, never in source control, per the brief's explicit instruction.

## 6. Scenario Preparation Matrix

**General pattern (Scenarios 1, 2, 3, 4, 6):** the people involved already exist as `employee_records` (§4) — realistic, since a real org's HR system already has its roster before any specific case starts — but **no case, allegation, evidence, or witness statement exists yet**. The tester's job is to open a case and build it up from the raw material they're handed, exactly as Document C intends. This is the default, and deliberately preserves the thing this UAT round exists to test — do not pre-populate case content "to save time."

**Exception (Scenario 5):** the task sheet explicitly starts *after* the investigation is complete (Document C/D) — so the case, its allegation, and the investigation's evidence/interview content **must** already exist before the tester sits down. This is pre-seeded manually via Compass's own UI (not scripted — see the reasoning in §7), by the facilitator or a helper, logged in as a dedicated seed account, following the exact content in Document C's Scenario 5 pack.

| Scenario | Pre-seeded | Given to tester | Tester must create | Reset method |
|---|---|---|---|---|
| **1** | Employee records: Priya, Dean, Callum, Jade | Priya's email (Doc C) | The case itself; allegation; linking Priya/Callum/Dean as participants; recording Callum's witness statement (handed over by facilitator mid-session on request); flagging CCTV as evidence to obtain (if the tester thinks to) | Delete the case(s) with `employee_name = 'Dean Ashworth'` in the UAT org (`scripts/uat/reset-uat-case.js --scenario 1`) |
| **2** | Employee records: Robert, Ellen, Tomasz, Sadia, Gareth | Robert's email (Doc C) | The case; two allegations (bullying, stock discrepancy); participants; Sadia's and Gareth's statements (facilitator-handed on request); recording the cycle-count data described in Doc C | `--scenario 2` (`employee_name = 'Ellen Marsh'`) |
| **3** | Employee records: Aisha, Grant, Leanne, Marcus | Aisha's email (Doc C) | The case (grievance); issues identified from the bundled complaint; Grant's response (facilitator-handed on request) | `--scenario 3` (`employee_name = 'Aisha Rahman'`) |
| **4** | Employee records: Priya, Martin | Priya's email (Doc C) | The case; attendance pattern recorded; OH referral flow entries if the tester initiates one; return-to-work conversation record | `--scenario 4` (`employee_name = 'Martin Kowalski'`) |
| **5** | **Full case**: Grace Oduya, case type Disciplinary/Investigation, stage set to reflect a completed investigation, allegation recorded (safety interlock), evidence entries for CCTV timestamps/Grace's interview/Kian's statement/site safety record, per Document C's investigation summary verbatim | The appeal email (Doc C), handed over **only after** the tester has recorded an outcome and progressed the letter (Document D's facilitator note) | Reviewing the pre-seeded investigation; progressing to/recording the outcome (OutcomeModal); preparing the outcome letter; handling the appeal, including the Appeal Manager conflict guardrail | **Manual re-seed** via the UI before each session (§7) — not scripted, given the case's realistic-content requirement; delete via `--scenario 5` (`employee_name = 'Grace Oduya'`) after |
| **6** | Employee records: Denise, Simon, Nadia, Fola | Denise's email (Doc C) | The case; requesting (or not requesting) the IT ticket queue and Fola's account, both facilitator-handed only on request per Doc C; deciding how/whether to progress | `--scenario 6` (`employee_name = 'Simon Boateng'`) |

**Reset script guard:** `scripts/uat/reset-uat-case.js` (§7) refuses to run unless it resolves the configured Supabase URL to the known `compass-e2e-test` project ref and the target org's name matches `Meridian Fulfilment Ltd (UAT)` exactly — it will not run against production or against the existing `E2E Test Org`, even if pointed at them by mistake.

## 7. Fixture/reset tooling

Two scripts, both under `scripts/uat/`, both read connection details from `.env` (never hardcoded, never printed), both refuse to run against anything but the confirmed non-production `compass-e2e-test` project:

- **`scripts/uat/seed-uat-org.js`** — one-time setup. Creates the `Meridian Fulfilment Ltd (UAT)` organisation, the 7 `uat-hr-*` accounts (via Admin API, mirroring the exact recipe already used and documented for this project's own E2E test account — see the script's own header comment for the citation), sets `plan`/`stripe_subscription_status` to bypass `SubscribeGate`, and inserts all 20 `employee_records` rows from §4. Run once, before the pilot. Safe to re-run — it's idempotent per-name (won't create duplicate employee records; will skip org/account creation if they already exist).
- **`scripts/uat/reset-uat-case.js --scenario <1-6>`** — deletes whatever case(s) exist for that scenario's employee name in the UAT org, relying on the schema's own `ON DELETE CASCADE` (confirmed against `supabase/*.sql` for `allegations`, `case_tasks`, `case_signals`, `case_themes`, `case_access`, `hr_review_requests` — all cascade on `case_id`; `meetings`/`evidence`/`vault_docs`/`next_steps` are embedded `jsonb` columns directly on the `cases` row itself, per `baseline_schema_2026-08-06.sql`, so they're removed for free with the row) to leave the scenario's employee record intact but every case/allegation/evidence/signal/access-grant gone, ready for the next tester. Run between every session for Scenarios 1–4 and 6. **Does not attempt to reconstruct Scenario 5's pre-seeded investigation content** — that's rebuilt manually (see below) — it only deletes.

**Update (Phase 8B) — Scenario 5's pre-seed is now scripted (`scripts/uat/seed-scenario-5.js`), not manual.** The original plan below was to build this once, by hand, through Compass's own real UI, logged in as a seed account. That turned out not to be available: Claude does not handle account credentials, including this UAT sandbox's own self-generated ones, so an automated UI walkthrough was never an option either, and the facilitator hadn't yet logged in themselves at the point this needed to exist. `seed-scenario-5.js` is the responsible middle ground actually used instead — it only writes plain scalar columns whose shape is unambiguous (`employee_name`, `case_type`, `description`, `investigation_report`, and, critically, an **explicit** `stage: 'inv_report'`, not an unset one — see the script's own header comment for a real bug this caught: `stage` has a DB-level default of `'open'`, so leaving it unset does not let `getCaseStage()`'s heuristic run the way a first attempt assumed; it was verified correct by importing and running the app's own real `getCaseStage`/`getNextStep` against the seeded row, not by inspecting the source and assuming). It deliberately does not populate `meetings`/`evidence` jsonb, whose exact shape wasn't verified against every consumer — the investigation content is fully present as narrative text in `investigation_report` and `description`, so the case is genuinely usable for the pilot, but the Meetings/Evidence tabs will be empty rather than holding the same facts as separate structured entries. The original reasoning below (why *not* to guess at DB rows) stands as the *general* principle — it's why this script stays deliberately narrow (scalars only, verified against real app logic) rather than attempting a full structured recreation.

**Original reasoning (for why this needed this much care in the first place):** Scenarios 1–4/6 only need an *empty* starting point (delete-and-done). Scenario 5 needs a *specific, realistic, internally-consistent* case state — the right allegation text, the right evidence entries, the right stage — for the tester's very first "what happened here" read to be genuine. Writing that via direct database inserts risks producing rows that don't match every computed/derived field the real Case Workspace screens expect (stage-derivation logic, `getNextStep`, guardrail inputs), which could hand a tester a subtly broken case and produce a false UAT finding that's actually a seeding bug, not a Compass bug — which is exactly what the first version of `seed-scenario-5.js` did, before being caught and fixed.
