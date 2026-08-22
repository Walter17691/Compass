-- ============================================================================
-- DSAR requests — restrict access to HR only — 2026-08-22
-- ============================================================================
-- dsar_requests_same_org (baseline_schema_2026-08-06.sql, originally
-- dsar_2026-07-24.sql) has always been org-wide with no role check —
-- any org member can view, log, and manage every subject access
-- request in the org. DSAR requests are arguably the most sensitive
-- data this app touches: DsarScreen.jsx's own compileSubjectData
-- aggregates an employee's full case, meeting, wellbeing, onboarding,
-- and offboarding history for legal disclosure. wellbeing_notes
-- already gets this right (wellbeing_notes_2026-08-09.sql restricts to
-- hr_manager/hr_director) — this migration brings dsar_requests to the
-- same standard, using the is_hr_role() helper that migration predates
-- (role_expansion_2026-08-09.sql) rather than repeating an inline role
-- list.
--
-- DsarScreen.jsx has no reduced non-HR view (unlike ConcernsScreen's
-- own isHR-conditional branching) — every org member currently gets
-- the identical full admin view (log requests, compile subject data,
-- mark complete) regardless of role, so this is a clean full HR-only
-- gate, not a partial one. The "DSAR" nav item in AppSidebar.jsx is
-- hidden from non-HR alongside this migration, matching the Wellbeing
-- nav item's own isHR-conditional pattern — but as with
-- wellbeing_notes_2026-08-09.sql's own note, RLS is the real boundary
-- here; the UI gate is only a courtesy so a non-HR user doesn't see a
-- broken/empty screen.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

drop policy if exists dsar_requests_same_org on public.dsar_requests;

create policy "hr staff only can manage dsar requests in their org"
on public.dsar_requests for all
using (
  org_id in (select my_org_ids())
  and exists (
    select 1 from public.org_members
    where org_members.org_id = dsar_requests.org_id
      and org_members.user_id = auth.uid()
      and public.is_hr_role(org_members.role)
  )
)
with check (
  org_id in (select my_org_ids())
  and exists (
    select 1 from public.org_members
    where org_members.org_id = dsar_requests.org_id
      and org_members.user_id = auth.uid()
      and public.is_hr_role(org_members.role)
  )
);
