-- ============================================================================
-- Phase 6.5 — Structural remediation (Prompt 14, Section 7)
-- HR_REVIEW_REQUESTS CASE-SCOPED SELECT — closes independent audit
-- finding 1.2
-- ============================================================================
-- hr_review_requests_select_same_org's own USING clause was
-- `org_id in (select my_org_ids())` — org membership only, no
-- confidentiality or case-access check at all. record_snapshot embeds
-- the full meeting record text (findings/notes) at review-request time,
-- alongside case_employee_name and meeting_type — so ANY org member,
-- including one with no case_access grant on a confidential case, could
-- read that case's full HR review content. This is exactly the same
-- confidentiality boundary allegations/case_signals/case_tasks already
-- enforce via the parent `cases` row; hr_review_requests was simply
-- never brought in line with it.
--
-- Also adds the same auditor-write-block trigger already applied to
-- cases/allegations/case_signals/case_tasks (finding 2.4's RLS half) —
-- hr_review_requests_update_hr_only already gates UPDATE on
-- can_see_all_org_cases(), which includes 'auditor', so an auditor could
-- approve/reject a review request despite being labelled read-only.
--
-- HOW TO APPLY: paste the whole file in one Supabase SQL Editor run. It
-- is idempotent (DROP POLICY/TRIGGER IF EXISTS) and safe to re-run.
--
-- STATUS (Prompt 14, 2026-08-26): LIVE on production (npeegfsoijhdnnvuqjin).
-- Adversarially verified with a real throwaway line_manager (no
-- case_access) against a genuine confidential-case sentinel: SELECT
-- returned empty. Positive control: the real HR-director test account's
-- SELECT still returns the real record_snapshot content. Sentinel data
-- and the throwaway identity were cleaned up immediately after.
-- ============================================================================

drop policy if exists "hr_review_requests_select_same_org" on public.hr_review_requests;
create policy "hr_review_requests_select_case_scoped" on public.hr_review_requests
for select using (
  exists (
    select 1 from public.cases c
    where c.id = hr_review_requests.case_id
      and ((c.org_id in (select my_org_ids()) and public.can_access_case_location(c.org_id, c.location_id))
           or c.id in (select case_access.case_id from public.case_access where case_access.user_id = auth.uid()))
      and (c.confidential = false or c.created_by = auth.uid()
           or exists (select 1 from public.case_access ca where ca.case_id = c.id and ca.user_id = auth.uid())
           or exists (select 1 from public.org_members om where om.org_id = c.org_id and om.user_id = auth.uid() and public.has_confidential_case_oversight(om.role)))
  )
);

drop trigger if exists block_auditor_write_hr_review_requests on public.hr_review_requests;
create trigger block_auditor_write_hr_review_requests
before insert or update or delete on public.hr_review_requests
for each row execute function public.block_auditor_write_org_scoped();
