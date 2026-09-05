-- ============================================================================
-- allegations + case_tasks — require authoritative parent-case access
-- (Insights Phase 1 audit secondary finding, remediated 2026-09-05)
-- ============================================================================
-- ROOT CAUSE (identical to hr_review_requests_authoritative_case_access_
-- 2026-09-05.sql): both tables' access policies duplicate the pre-2026-08-13
-- `cases` predicate — (org+location OR case_access) AND (confidentiality) —
-- and never picked up the ownership narrowing manager_enablement_case_
-- access_2026-08-13.sql added to `cases` itself (RESTRICTIVE, requiring
-- can_see_all_org_cases(role) OR created_by OR owner_id OR case_access for
-- any role outside hr_manager/hr_director/legal_reviewer/auditor).
--
-- `manager_enablement_case_access_2026-08-13.sql`'s own header assumed this
-- would happen automatically ("allegations/case_tasks already key their own
-- RLS off 'can the caller access the parent case'... so narrowing cases' own
-- SELECT visibility narrows all of that transparently, with no further
-- migrations needed") — an assumption that was wrong, because neither table
-- delegates to `cases`' live policy; each duplicates a frozen copy of it.
-- `org_insight_actions_2026-08-20.sql` (case_tasks) is direct documentary
-- evidence: its own comment says it kept "the exact same case-access logic
-- as before, verbatim" a full week after `cases` had already changed
-- underneath it.
--
-- BROADER THAN hr_review_requests: both policies are FOR ALL (SELECT,
-- INSERT, UPDATE, DELETE share one predicate — allegations has no explicit
-- WITH CHECK, so Postgres uses USING for writes too; case_tasks duplicates
-- USING into WITH CHECK explicitly). The gap is therefore not read-only: a
-- same-org bystander with no relationship to a non-confidential case can
-- currently also INSERT/UPDATE/DELETE its allegations and case-scoped
-- tasks, not just read them. allegations carries the substantive content of
-- an investigation (title, description, people_involved, employee_response,
-- witness_evidence, investigator_finding, decision_reasoning, appeal_
-- reasoning) — materially more sensitive than hr_review_requests'
-- record_snapshot summary.
--
-- FIX: delegate both policies to `cases`' own RLS via
-- EXISTS (SELECT 1 FROM cases c WHERE c.id = <child>.case_id), exactly as
-- hr_review_requests now does — one authoritative rule, no duplicated
-- predicate to drift.
--
-- CORRECTION to an earlier draft of this audit: it initially claimed a case
-- *owner* with no other relationship could see the parent `cases` row but
-- was denied its allegations/tasks, and that this fix would correct that
-- "inconsistency". That claim was wrong and is retracted here. The old
-- child predicate is P AND R_conf; `cases`' own policy is P AND R_conf AND
-- R_own — a strict conjunction with one extra term, which can only narrow
-- access, never widen it. `cases`' allowed-set is therefore always a
-- subset of the old child predicate's allowed-set; it is mathematically
-- impossible for `cases` to allow something the old child policy denied.
-- An owner-only relationship was already allowed under the old predicate
-- for a non-confidential case (same as everyone, via P alone) and remains
-- denied under both old and new predicates for a confidential case (R_conf
-- has no owner_id OR-term — a property of `cases` itself, unrelated to and
-- unaffected by this fix). See src/test/allegationsCaseTasksAccess.test.js
-- for the regression test that caught this error.
--
-- case_tasks keeps its case_id IS NULL / org-level-insight-action branch
-- completely unchanged — there is no parent case to check for those rows,
-- and that branch is not part of this finding.
--
-- Both USING and WITH CHECK are made identical and explicit on both tables
-- (per review: "if the current policy relies on implicit WITH CHECK
-- behaviour, make the final behaviour explicit"). For UPDATE, WITH CHECK
-- evaluates the delegated EXISTS against the NEW row's case_id, so it
-- independently blocks reassigning a row to a case the caller cannot
-- access, on top of USING blocking any update to a row under a case they
-- already cannot access.
--
-- RECURSION: `cases`' own policies never reference allegations or
-- case_tasks (checked across every migration touching `cases`) — one-
-- directional dependency, no cycle.
--
-- SCOPE: this migration does not touch hr_review_requests (already fixed
-- and frozen, commit c55d3226b0bb313991586c2f265a8bf8f4f52825) or the
-- `cases` policies themselves (the authoritative model, unchanged).
--
-- STATUS: NOT YET DEPLOYED. Pending review — see security report.
-- ============================================================================

drop policy if exists "Users can manage allegations for cases they can access" on public.allegations;
create policy "Users can manage allegations for cases they can access" on public.allegations
for all
using (
  exists (
    select 1 from public.cases c
    where c.id = allegations.case_id
  )
)
with check (
  exists (
    select 1 from public.cases c
    where c.id = allegations.case_id
  )
);

drop policy if exists "Users can manage tasks for cases they can access or org-level insight actions" on public.case_tasks;
create policy "Users can manage tasks for cases they can access or org-level insight actions" on public.case_tasks
for all
using (
  (case_id is null and org_id in (select my_org_ids()))
  or
  (case_id is not null and exists (
    select 1 from public.cases c
    where c.id = case_tasks.case_id
  ))
)
with check (
  (case_id is null and org_id in (select my_org_ids()))
  or
  (case_id is not null and exists (
    select 1 from public.cases c
    where c.id = case_tasks.case_id
  ))
);
