-- ============================================================================
-- case_themes + case_signals — require authoritative parent-case access
-- (Insights Phase 4 audit finding, remediated 2026-09-05)
-- ============================================================================
-- ROOT CAUSE (identical class to hr_review_requests_authoritative_case_access_
-- 2026-09-05.sql and allegations_case_tasks_authoritative_case_access_
-- 2026-09-05.sql): both tables' access policies duplicate the pre-2026-08-13
-- `cases` predicate — (org+location OR case_access) AND (confidentiality) —
-- and never picked up the ownership narrowing manager_enablement_case_
-- access_2026-08-13.sql added to `cases` itself (RESTRICTIVE, requiring
-- can_see_all_org_cases(role) OR created_by OR owner_id OR case_access for
-- any role outside hr_manager/hr_director/legal_reviewer/auditor).
--
-- CONFIRMED LIVE (production pg_policies, read prior to this migration):
--   case_signals: "Users can manage signals for cases they can access", FOR ALL,
--     PERMISSIVE, with_check = null (defaults to the USING clause for
--     INSERT/UPDATE too). Created by case_signals_2026-08-10.sql.
--   case_themes: "Users can manage themes for cases they can access", FOR ALL,
--     PERMISSIVE, with_check = null. Created by organisation_themes_2026-08-19.sql,
--     whose own header states it copied case_signals' policy "verbatim, not
--     re-derived" — nine days AFTER manager_enablement_case_access_2026-08-13.sql
--     had already added the ownership-narrowing restrictive policy to `cases`,
--     meaning it copied an already-stale pattern. Both policies' qual text is
--     byte-identical (confirmed via live pg_policies query), differing only in
--     which column they compare case_id against.
--   Neither table has ever had a second policy added since; no later migration
--     supersedes either (privilege_tenant_ownership_invariant_2026-08-25.sql's
--     own "PART 9" only adds an org_id-sync TRIGGER to case_themes for tenant-
--     isolation, unrelated to this access-scoping gap).
--
-- BROADER THAN hr_review_requests: both policies are FOR ALL (SELECT, INSERT,
-- UPDATE, DELETE share one predicate, defaulting WITH CHECK to USING). The gap
-- is therefore not read-only: a same-org bystander with no relationship to a
-- non-confidential case can currently also INSERT/UPDATE/DELETE its theme tags
-- and signals, not just read them. App.jsx's loadCaseThemes/loadCaseSignals
-- both fetch directly (`select('*').eq('org_id', org.id)`), NOT joined through
-- `cases`, so the client-side caseThemes/caseSignals arrays — which feed
-- Insights' "Repeat case themes" panel today, and would feed any future
-- theme-trend UI — are scoped entirely by these tables' own (too-permissive)
-- policies, not by delegation to `cases`.
--
-- SCHEMA CHECK (mandatory before drafting this fix — see audit §4): both
-- tables' case_id column is NOT NULL (confirmed via live information_schema
-- query). Unlike case_tasks (which has a nullable case_id for legitimate
-- org-level insight actions and required a case_id-IS-NULL branch preserved
-- in its own fix), neither case_themes nor case_signals has any legitimate
-- non-case-scoped row mode. A simple, unconditional EXISTS-based policy is
-- therefore complete and safe for both — no branch to preserve.
--
-- FIX: delegate both policies to `cases`' own RLS via
-- EXISTS (SELECT 1 FROM cases c WHERE c.id = <child>.case_id), exactly as
-- hr_review_requests/allegations/case_tasks now do — one authoritative rule,
-- no duplicated predicate to drift. RLS is enforced on any reference to a
-- protected table regardless of where that reference appears (including
-- inside another table's policy predicate) for any role subject to RLS, so
-- this EXISTS can only ever see rows `cases`' own SELECT-combined policy
-- stack (P AND R_conf AND R_own) already permits for the caller — the same
-- reasoning documented in full in hr_review_requests_authoritative_case_
-- access_2026-09-05.sql's own header.
--
-- RECURSION: confirmed none of `cases`' own six policies, nor any helper
-- function they call (my_org_ids, can_access_case_location,
-- can_see_all_org_cases, has_confidential_case_oversight, is_hr_role — all
-- read live via pg_proc before drafting this fix), reference case_themes or
-- case_signals anywhere. One-directional dependency, no cycle.
--
-- POLICY COMPOSITION: confirmed live that each table carries exactly ONE
-- policy today (no restrictive layer, no second permissive policy on either
-- table) — this migration is a straightforward drop+create swap of that same
-- single policy, not an addition alongside something else that could re-open
-- access.
--
-- Both USING and WITH CHECK are made identical and explicit on both tables
-- (per review precedent: "if the current policy relies on implicit WITH
-- CHECK behaviour, make the final behaviour explicit"). For UPDATE, WITH
-- CHECK evaluates the delegated EXISTS against the NEW row's case_id, so it
-- independently blocks reassigning a row to a case the caller cannot access,
-- on top of USING blocking any update to a row under a case they already
-- cannot access.
--
-- SCOPE: this migration does not touch hr_review_requests, allegations, or
-- case_tasks (already fixed and frozen), nor the `cases` policies themselves
-- (the authoritative model, unchanged).
--
-- STATUS: NOT YET DEPLOYED. Pending review.
-- ============================================================================

drop policy if exists "Users can manage themes for cases they can access" on public.case_themes;
create policy "Users can manage themes for cases they can access" on public.case_themes
for all
using (
  exists (
    select 1 from public.cases c
    where c.id = case_themes.case_id
  )
)
with check (
  exists (
    select 1 from public.cases c
    where c.id = case_themes.case_id
  )
);

drop policy if exists "Users can manage signals for cases they can access" on public.case_signals;
create policy "Users can manage signals for cases they can access" on public.case_signals
for all
using (
  exists (
    select 1 from public.cases c
    where c.id = case_signals.case_id
  )
)
with check (
  exists (
    select 1 from public.cases c
    where c.id = case_signals.case_id
  )
);
