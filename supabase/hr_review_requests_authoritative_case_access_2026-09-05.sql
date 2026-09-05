-- ============================================================================
-- hr_review_requests SELECT — require authoritative parent-case access
-- (Insights Phase 1 audit finding, remediated 2026-09-05)
-- ============================================================================
-- ROOT CAUSE: hr_review_requests_select_case_scoped_2026-08-26.sql correctly
-- mirrored `cases`' CONFIDENTIALITY boundary (confidential_cases_2026-07-26.sql
-- / role_expansion_2026-08-09.sql's has_confidential_case_oversight), but
-- never picked up `cases`' own OWNERSHIP narrowing added five days earlier by
-- manager_enablement_case_access_2026-08-13.sql (the RESTRICTIVE "Non-
-- oversight members restricted to their own assigned cases" policy, requiring
-- can_see_all_org_cases(role) OR created_by OR owner_id OR case_access for
-- any role outside hr_manager/hr_director/legal_reviewer/auditor).
--
-- Effect: for a NON-confidential case, the 2026-08-26 policy's base branch —
-- `(c.org_id in my_org_ids() AND can_access_case_location(...)) OR case_access`
-- — is satisfied by any ordinary org member (can_access_case_location is a
-- no-op for every role except a location-restricted location_manager), with
-- no requirement that the caller created, owns, or holds case_access on that
-- case. record_snapshot (full meeting findings/notes text at review-request
-- time) is a plain column on the row — once the row is visible, so is it.
--
-- PROVEN BY POLICY ALGEBRA (live sentinel reproduction was attempted on the
-- isolated compass-e2e-test project but blocked by this environment's own
-- safety controls before a `cases` row could be inserted; the two projects'
-- live `pg_policies` definitions were confirmed byte-identical to these
-- migrations, so the algebra below describes actual deployed behaviour, not
-- a hypothetical). Let, for case C and caller U in org O:
--   P = (C.org_id in my_org_ids() AND can_access_case_location(C.org_id, C.location_id))
--       OR case_access exists for U on C
--   R_conf = C.confidential=false OR C.created_by=U OR case_access exists
--            OR has_confidential_case_oversight(U's role)
--   R_own  = can_see_all_org_cases(U's role) OR C.created_by=U OR C.owner_id=U
--            OR case_access exists for U on C
-- `cases`' own effective SELECT visibility = P AND R_conf AND R_own (all
-- three policies combine — one permissive, two RESTRICTIVE — see
-- baseline_schema_2026-08-06.sql / manager_enablement_case_access_2026-08-13.sql).
-- The vulnerable hr_review_requests policy's predicate = P AND R_conf —
-- R_own is simply absent. For a non-confidential case, R_conf is trivially
-- true, so the vulnerable predicate reduces to just P, which nearly every
-- org member satisfies regardless of any relationship to the case — exactly
-- the class of access `cases` itself was deliberately narrowed to prevent in
-- 2026-08-13 ("being a manager should NOT automatically provide access to
-- all employee ER history").
--
-- FIX: rather than re-deriving P/R_conf/R_own inline a third time (the
-- pattern that let this drift in the first place — allegations/case_tasks'
-- own policies, updated the same day as the original hr_review_requests
-- policy's ancestor, show the same copy-paste risk), delegate directly to
-- `cases`' own RLS: `EXISTS (SELECT 1 FROM cases c WHERE c.id = ...)`. RLS is
-- enforced on any reference to a protected table regardless of where that
-- reference appears — including inside another table's policy predicate —
-- for any role subject to RLS (the app's `authenticated` role is; only
-- `service_role`/table-owner connections bypass it, unaffected by this
-- change). This means the *only* rows this EXISTS can see are exactly the
-- rows `cases`' own combined policy stack already permits for the caller —
-- P AND R_conf AND R_own, automatically, with zero duplicated predicate text
-- and zero future drift: any later change to `cases`' own access rules
-- propagates here for free instead of needing a matching edit hunted down
-- in a second file.
--
-- SCOPE: SELECT only. hr_review_requests_update_hr_only (UPDATE) already
-- gates on can_see_all_org_cases(role), a strictly narrower and unaffected
-- condition; INSERT policy is unrelated (gates on same-org membership at
-- creation time, not historical read access). Investigated and found no
-- equivalent gap in this migration's remit — the allegations/case_tasks
-- policies (role_expansion_2026-08-09.sql) were found during this same
-- audit to embed the identical pre-2026-08-13 predicate shape and may carry
-- the same class of gap, but that is a separate table/policy outside this
-- migration's scope and is reported, not fixed, here (see the accompanying
-- security report).
--
-- STATUS: NOT YET DEPLOYED. Pending review — see security report.
-- ============================================================================

drop policy if exists "hr_review_requests_select_case_scoped" on public.hr_review_requests;
create policy "hr_review_requests_select_case_scoped" on public.hr_review_requests
for select using (
  exists (
    select 1 from public.cases c
    where c.id = hr_review_requests.case_id
  )
);
