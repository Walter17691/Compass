-- ============================================================================
-- Confidentiality-scoped case visibility
-- ============================================================================
-- Today, RLS on "cases" is org-wide: any hr_manager/hr_director in the org
-- can see every case, including one HR manager's own disciplinary case
-- brought by another manager. This adds an opt-in "confidential" flag that
-- narrows visibility to the case's creator, anyone explicitly granted
-- access via case_access (the same table used for the existing disciplinary
-- officer handoff and case reassignment features), and hr_directors (who
-- need org-wide oversight regardless).
--
-- Safe-by-construction: this uses a RESTRICTIVE policy, not a change to the
-- existing permissive "Users can access cases in their org or assigned to
-- them" policy. Postgres ANDs restrictive policies with permissive ones, so
-- this can only ever NARROW access, never widen it — and since every
-- existing case defaults to confidential = false, this policy evaluates to
-- TRUE unconditionally for all of them. Nothing changes for any case until
-- someone explicitly marks it confidential. The existing permissive policy
-- is never touched or dropped.
--
-- To apply:
--   1. Run this whole file in the Supabase SQL editor.
--   2. Sanity check: as a non-hr_director user, mark a case confidential in
--      the app, then confirm a DIFFERENT hr_manager (not the creator, no
--      case_access grant) can no longer see it in their case list, while
--      the creator and any hr_director still can.
-- ============================================================================

alter table public.cases
  add column if not exists confidential boolean not null default false;

create policy "Confidential cases restricted to authorised staff"
on public.cases
as restrictive
for select
using (
  confidential = false
  or created_by = auth.uid()
  or exists (
    select 1 from public.case_access ca
    where ca.case_id = cases.id and ca.user_id = auth.uid()
  )
  or exists (
    select 1 from public.org_members om
    where om.org_id = cases.org_id and om.user_id = auth.uid() and om.role = 'hr_director'
  )
);
