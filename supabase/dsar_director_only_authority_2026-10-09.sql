-- ============================================================================
-- DSAR ADMINISTRATION IS HR-DIRECTOR ONLY
--
-- Separately deployable. Touches `dsar_requests` and nothing else. Does NOT
-- change ordinary case access, investigation permissions, or the shared
-- is_hr_role() function.
--
-- THE PRODUCT DECISION. Compass is employer-facing. Employees do not log in to
-- submit subject access requests; requests arrive externally and are registered
-- by an authorised internal user. Registering, collecting, reviewing, redacting,
-- generating, approving and completing a DSAR are all reserved to hr_director.
-- No other HR role receives them merely because is_hr_role() is true.
--
-- WHAT WAS THERE BEFORE. One PERMISSIVE policy, FOR ALL, read from production
-- 2026-10-08:
--
--   "hr staff only can manage dsar requests in their org"
--     using / with check:
--       org_id in (select my_org_ids())
--       and exists (select 1 from public.org_members
--                   where org_members.org_id = dsar_requests.org_id
--                     and org_members.user_id = auth.uid()
--                     and public.is_hr_role(org_members.role))
--
-- `is_hr_role()` admits hr_manager AND hr_director, so every HR manager in the
-- organisation could read, create, amend and complete every DSAR.
--
-- ┌─ WHY NOT NARROW is_hr_role() ───────────────────────────────────────────┐
-- │ Because it is load-bearing almost everywhere. Measured on production:   │
-- │ 36 RLS policies across 18 TABLES reference it, and 16 further functions │
-- │ call it. Narrowing the function would silently re-scope wellbeing notes,│
-- │ portal accounts, case decisions, appeals, team administration and more. │
-- │ Only the ONE dsar_requests predicate changes here.                       │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- PRECEDENT, STATED ACCURATELY. There is NO existing hr_director-only RLS
-- policy over application data to copy. Searching production for policies
-- naming hr_director returns three, and two of them
-- (manager_capability_insights, redundancy_cases) merely inline
-- `role = any(array['hr_manager','hr_director'])`, which is is_hr_role by hand.
-- The third, org_members_insert_founding_member, is about founding a tenant.
-- The only genuine hr_director-only enforcement in the product today is
-- server-side JS: api/delete-org-data.js refuses anyone else. This file is
-- therefore the first RLS expression of that boundary, and it is written to
-- match that server rule rather than to invent a new shape.
--
-- RLS IS THE BACKSTOP, NOT THE ONLY GATE. The UI stops offering the workspace
-- and the API route refuses a non-director caller; this policy is what makes
-- those two unbypassable, including for a raw PostgREST request with a valid
-- hr_manager token.
-- ============================================================================


-- ── The replacement policy ─────────────────────────────────────────────────
--
-- Same SHAPE as the policy it replaces — PERMISSIVE, FOR ALL, same tenancy
-- conjunct — with exactly one difference: the role test. Keeping the shape
-- identical means the only behavioural change is the one intended.
--
-- `org_id in (select my_org_ids())` is retained rather than relying on the
-- org_members EXISTS alone: it is the tenancy conjunct the rest of this schema
-- uses, and dropping it would make this policy the odd one out.
drop policy if exists "hr staff only can manage dsar requests in their org" on public.dsar_requests;

create policy "Only an HR Director may administer subject access requests"
on public.dsar_requests
for all
using (
  org_id in (select my_org_ids())
  and exists (
    select 1 from public.org_members
    where org_members.org_id = dsar_requests.org_id
      and org_members.user_id = auth.uid()
      and org_members.role = 'hr_director'
  )
)
with check (
  org_id in (select my_org_ids())
  and exists (
    select 1 from public.org_members
    where org_members.org_id = dsar_requests.org_id
      and org_members.user_id = auth.uid()
      and org_members.role = 'hr_director'
  )
);

comment on policy "Only an HR Director may administer subject access requests" on public.dsar_requests is
  'DSAR administration is reserved to hr_director. Replaces "hr staff only can manage dsar requests in their org", whose is_hr_role() test also admitted hr_manager. Matches the server rule in api/delete-org-data.js and api/portal/_dsar-lookup.js. is_hr_role() itself is deliberately unchanged — 36 policies across 18 tables depend on it.';


-- ── What this does NOT change ──────────────────────────────────────────────
--
-- is_hr_role() — untouched. 36 policies / 18 tables / 16 functions depend on it.
--
-- CASE AND INVESTIGATION ACCESS — untouched. No policy on cases, allegations,
-- case_access, meetings, case_decisions or employee_records is altered here.
-- An hr_manager keeps every case capability they have today; they lose only
-- DSAR administration.
--
-- dsar_requests_employee_parentage_trg — untouched, still the parentage guard.
-- dsar_requests_completion_integrity_trg (dsar_completion_integrity_2026-10-09)
-- is independent of this file and can land before or after it.
--
-- SERVICE ROLE — unaffected. RLS does not apply to service_role, so the
-- deadline-digest cron (api/cron/_digest.js, which reads DSAR due dates through
-- the service key) keeps working. This is the reason the tightening is safe to
-- deploy without touching the cron.
--
-- EXISTING ROWS — untouched. This is a visibility change, not a data change.
--
-- COMPATIBILITY, MEASURED PER ORGANISATION (production, 2026-10-09). Three
-- organisations hold dsar_requests rows, and each retains at least one
-- hr_director, so no organisation loses access to its own requests:
--
--   E2E Test Org    136 rows   1 hr_director   0 hr_manager
--   E2E Test Org      3 rows   1 hr_director   1 hr_manager
--   Compass LTD       1 row    1 hr_director   1 hr_manager
--
-- WHO ACTUALLY LOSES SOMETHING, NAMED PLAINLY: the two hr_manager members (one
-- in an E2E org, one in Compass LTD) can no longer read or administer DSAR
-- requests. That is the intended effect of the decision, not a side effect —
-- but it does mean deploying this slice changes a permission inside Compass
-- LTD, which is unavoidable for a schema-wide RLS policy and should be an
-- explicit approval rather than a surprise. Nothing else about Compass LTD is
-- touched, and no Compass LTD data is read, written or deleted by this file.
--
-- Of the 140 rows, 138 are E2E test artefacts (subject names of the form
-- 'E2E DSAR 1785…'); the 2 non-E2E rows are 'Francesco Totti' and
-- 'Manual Debug Test'. There is no genuine subject whose request becomes
-- unreachable.
