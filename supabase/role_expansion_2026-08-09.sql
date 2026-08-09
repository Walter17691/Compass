-- ============================================================================
-- Role vocabulary expansion — 2026-08-09
-- ============================================================================
-- org_members.role has always been a free-text column (no CHECK
-- constraint) — today only hr_manager/hr_director/location_manager are
-- ever written to it. This expands the vocabulary to 7 roles:
--   hr_manager, hr_director, location_manager   (existing, unchanged)
--   investigator, line_manager                  (new — no org-wide
--                                                  oversight; the
--                                                  per-case access an
--                                                  investigator actually
--                                                  needs already exists
--                                                  via case_access, so
--                                                  this is vocabulary
--                                                  only, no new RLS)
--   legal_reviewer, auditor                      (new — join hr_director
--                                                  in the confidential-
--                                                  case oversight bucket
--                                                  below; auditor's write
--                                                  access is unchanged
--                                                  from any org member's
--                                                  today — true read-only
--                                                  enforcement would mean
--                                                  splitting every
--                                                  existing FOR ALL
--                                                  policy by command,
--                                                  which is a bigger,
--                                                  separate change and
--                                                  explicitly not what
--                                                  this migration does)
--
-- Two capability functions replace the inline `role = 'hr_director'` /
-- `role in ('hr_manager','hr_director')` checks that were starting to
-- get copy-pasted across policies (confidential_cases_2026-07-26.sql,
-- wellbeing_notes_2026-08-09.sql, case_structure_2026-08-09.sql) — a
-- role added to one bucket now updates every policy that checks it,
-- instead of needing a matching edit hunted down in each one.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

CREATE OR REPLACE FUNCTION public.is_hr_role(p_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT p_role IN ('hr_manager', 'hr_director')
$function$;

-- Roles that can see a confidential case org-wide even without an
-- explicit case_access grant or being its creator.
CREATE OR REPLACE FUNCTION public.has_confidential_case_oversight(p_role text)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SET search_path TO 'public'
AS $function$
  SELECT p_role IN ('hr_director', 'legal_reviewer', 'auditor')
$function$;

-- ── wellbeing_notes: was role in ('hr_manager','hr_director') ──────────────
ALTER POLICY "HR staff only can manage wellbeing notes in their org"
ON public.wellbeing_notes
USING (
  EXISTS (
    SELECT 1 FROM public.org_members
    WHERE org_members.org_id = wellbeing_notes.org_id
      AND org_members.user_id = auth.uid()
      AND public.is_hr_role(org_members.role)
  )
);

-- ── cases: was role = 'hr_director' ─────────────────────────────────────────
ALTER POLICY "Confidential cases restricted to authorised staff"
ON public.cases
USING (
  confidential = false
  OR created_by = auth.uid()
  OR EXISTS (
    SELECT 1 FROM public.case_access ca
    WHERE ca.case_id = cases.id AND ca.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.org_members om
    WHERE om.org_id = cases.org_id AND om.user_id = auth.uid() AND public.has_confidential_case_oversight(om.role)
  )
);

-- ── allegations: was role = 'hr_director' ───────────────────────────────────
ALTER POLICY "Users can manage allegations for cases they can access"
ON public.allegations
USING (
  EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = allegations.case_id
      AND (
        (c.org_id IN (SELECT my_org_ids()) AND public.can_access_case_location(c.org_id, c.location_id))
        OR c.id IN (SELECT case_access.case_id FROM public.case_access WHERE case_access.user_id = auth.uid())
      )
      AND (
        c.confidential = false
        OR c.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.case_access ca WHERE ca.case_id = c.id AND ca.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = c.org_id AND om.user_id = auth.uid() AND public.has_confidential_case_oversight(om.role))
      )
  )
);

-- ── case_tasks: was role = 'hr_director' ────────────────────────────────────
ALTER POLICY "Users can manage tasks for cases they can access"
ON public.case_tasks
USING (
  EXISTS (
    SELECT 1 FROM public.cases c
    WHERE c.id = case_tasks.case_id
      AND (
        (c.org_id IN (SELECT my_org_ids()) AND public.can_access_case_location(c.org_id, c.location_id))
        OR c.id IN (SELECT case_access.case_id FROM public.case_access WHERE case_access.user_id = auth.uid())
      )
      AND (
        c.confidential = false
        OR c.created_by = auth.uid()
        OR EXISTS (SELECT 1 FROM public.case_access ca WHERE ca.case_id = c.id AND ca.user_id = auth.uid())
        OR EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = c.org_id AND om.user_id = auth.uid() AND public.has_confidential_case_oversight(om.role))
      )
  )
);
