-- Manager Enablement & Delegation (Phase 4, MP1) — the foundation every
-- later manager-facing phase in this build depends on.
--
-- Today, ANY org member (subject only to location_manager's own location
-- scoping via can_access_case_location(), and the opt-in `confidential`
-- flag) can SELECT every case in their org. That's the exact anti-pattern
-- the spec's own §20 names: "being a manager should NOT automatically
-- provide access to all employee ER history... access should depend on
-- their role in that specific case." This includes location_manager's
-- existing "see every case at my site" behaviour, which is real, working,
-- and the default role for anyone who joins via invite code — narrowing
-- it is a deliberate, confirmed behaviour change, not an oversight.
--
-- Only oversight/HR roles are exempt (hr_manager, hr_director, plus
-- legal_reviewer/auditor — already modelled by has_confidential_case_
-- oversight() as roles that should see MORE than a regular member, not
-- less). Everyone else (location_manager, line_manager, and any other
-- role) is narrowed to: cases they created, cases they own (owner_id),
-- or cases they hold a case_access row on. HR's own access is completely
-- untouched — this is an additional RESTRICTIVE policy, so it can only
-- narrow the non-exempt path; it cannot widen anything.
--
-- allegations/case_tasks already key their own RLS off "can the caller
-- access the parent case" (role_expansion_2026-08-09.sql), and
-- meetings/evidence are jsonb columns ON the cases row itself, not
-- separate tables — so narrowing cases' own SELECT visibility narrows
-- all of that transparently, with no further migrations needed.

CREATE OR REPLACE FUNCTION public.can_see_all_org_cases(p_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $$
  SELECT p_role IN ('hr_manager', 'hr_director', 'legal_reviewer', 'auditor')
$$;

REVOKE ALL ON FUNCTION public.can_see_all_org_cases(text) FROM public;
GRANT EXECUTE ON FUNCTION public.can_see_all_org_cases(text) TO authenticated;

CREATE POLICY "Non-oversight members restricted to their own assigned cases" ON public.cases AS RESTRICTIVE FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM org_members om
      WHERE om.org_id = cases.org_id AND om.user_id = auth.uid() AND public.can_see_all_org_cases(om.role)
    )
    OR created_by = auth.uid()
    OR owner_id = auth.uid()
    OR EXISTS (SELECT 1 FROM case_access ca WHERE ca.case_id = cases.id AND ca.user_id = auth.uid())
  );
