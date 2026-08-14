-- ============================================================================
-- Manager Enablement (Phase 4) — security hardening — 2026-08-14
-- ============================================================================
-- Closes gaps found in a post-phase code + security review of MP1-MP21
-- (Manager Enablement & Delegation). Five independent problems, all in the
-- same family: MP1 (manager_enablement_case_access_2026-08-13.sql) added a
-- real restrictive SELECT policy on `cases`, but several of the paths that
-- feed into or sit alongside that policy were never narrowed to match, so
-- the restriction it was meant to enforce can be bypassed entirely.
--
-- 1. CRITICAL — `case_access` had NO real authorization check on INSERT:
--    any org member could self-grant a case_access row on ANY case_id
--    (including one belonging to a different org's case, since case_id had
--    no foreign key), which satisfies MP1's restrictive SELECT policy on
--    `cases` and the pre-existing "or id IN case_access" permissive one —
--    i.e. any member could grant themselves full read+write on any case,
--    org-wide restriction or not. Same problem on DELETE (revoke).
--
-- 2. HIGH — MP1's restrictive policy is FOR SELECT only. UPDATE/DELETE on
--    `cases` still hit only the old permissive FOR ALL policy, org-wide.
--    An unfiltered update()/delete() (no WHERE clause read back) bypasses
--    MP1's restriction entirely, and even a targeted one lets a member set
--    owner_id to themselves as a read-bypass.
--
-- 3. HIGH — `hr_review_requests` is still FOR ALL, org-wide, from before
--    this phase. MP11's "HR Review Gate" is a real, newly-shipped sign-off
--    control this phase, but its status column was never protected at the
--    DB layer — any org member, including the investigator who submitted
--    the report under review, could update its own status to "approved".
--
-- 4. HIGH — MP19's HR Intervention actions (pause/resume an investigation,
--    HR guidance/question/witness-request notes) are UI-only gates
--    (isHR-conditional buttons) with no database enforcement: any case
--    participant can toggle cases.investigation_paused directly, or insert
--    a case_task with an HR-only source value, forging a note that reads
--    as if HR sent it.
--
-- Reuses can_see_all_org_cases() (defined in MP1's own migration) as the
-- one "is this an HR/oversight role" check throughout, rather than
-- inventing another divergent definition alongside it and
-- has_confidential_case_oversight().
--
-- Verification after applying: as a non-HR test user, confirm (a) you can
-- no longer grant yourself case_access on a case you can't already see,
-- (b) you can no longer flip investigation_paused or write an hr_guidance
-- task on a case you ARE assigned to, and (c) an HR test user's existing
-- workflows (assign investigator, HR Intervention, HR Review Gate) are
-- all still completely unaffected.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

-- ── 1. case_access: real authorization on INSERT/DELETE, plus a real FK ──

-- Clears any pre-existing orphaned rows (a case_id with no matching case)
-- before the FK constraint below, so this migration can't fail partway
-- through on data that predates case_access having any real integrity
-- check.
DELETE FROM public.case_access WHERE case_id NOT IN (SELECT id FROM public.cases);

ALTER TABLE public.case_access
  ADD CONSTRAINT case_access_case_id_fkey FOREIGN KEY (case_id) REFERENCES public.cases(id) ON DELETE CASCADE;

-- can_grant_case_access is SECURITY DEFINER for the exact reason
-- my_org_ids() is (see fix_org_members_recursion_2026-07-23.sql): a
-- case_access policy that queries cases, whose own policies query
-- case_access right back, is a direct RLS recursion cycle (Postgres
-- 42P17) — caught live while verifying this migration, not theoretical.
-- Wrapping the whole check in a SECURITY DEFINER function means its
-- internal queries run with the function owner's privileges and never
-- re-enter any of these three tables' RLS, breaking the cycle.
CREATE OR REPLACE FUNCTION public.can_grant_case_access(p_case_id uuid, p_org_id uuid)
 RETURNS boolean
 LANGUAGE sql
 STABLE
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT
    EXISTS (SELECT 1 FROM public.cases c WHERE c.id = p_case_id AND c.org_id = p_org_id)
    AND (
      EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = p_org_id AND om.user_id = auth.uid() AND public.can_see_all_org_cases(om.role))
      OR EXISTS (SELECT 1 FROM public.cases c WHERE c.id = p_case_id AND (c.created_by = auth.uid() OR c.owner_id = auth.uid()))
      OR EXISTS (SELECT 1 FROM public.case_access ca WHERE ca.case_id = p_case_id AND ca.user_id = auth.uid())
    )
$function$;

REVOKE ALL ON FUNCTION public.can_grant_case_access(uuid, uuid) FROM anon, public;
GRANT EXECUTE ON FUNCTION public.can_grant_case_access(uuid, uuid) TO authenticated;

DROP POLICY IF EXISTS "Users can grant case access in their org" ON public.case_access;
CREATE POLICY "Only HR or an existing case participant can grant case access"
ON public.case_access FOR INSERT
WITH CHECK (
  org_id IN (SELECT my_org_ids())
  AND public.can_grant_case_access(case_id, org_id)
);

DROP POLICY IF EXISTS "Users can revoke case access in their org" ON public.case_access;
CREATE POLICY "Only HR or an existing case participant can revoke case access"
ON public.case_access FOR DELETE
USING (
  org_id IN (SELECT my_org_ids())
  AND public.can_grant_case_access(case_id, org_id)
);

-- ── 2. cases: mirror MP1's restrictive SELECT policy onto UPDATE/DELETE ──

DROP POLICY IF EXISTS "Non-oversight members restricted to their own assigned cases (write)" ON public.cases;
CREATE POLICY "Non-oversight members restricted to their own assigned cases (write)"
ON public.cases AS RESTRICTIVE FOR UPDATE
USING (
  EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = cases.org_id AND om.user_id = auth.uid() AND public.can_see_all_org_cases(om.role))
  OR created_by = auth.uid()
  OR owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM case_access ca WHERE ca.case_id = cases.id AND ca.user_id = auth.uid())
)
WITH CHECK (
  EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = cases.org_id AND om.user_id = auth.uid() AND public.can_see_all_org_cases(om.role))
  OR created_by = auth.uid()
  OR owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM case_access ca WHERE ca.case_id = cases.id AND ca.user_id = auth.uid())
);

DROP POLICY IF EXISTS "Non-oversight members restricted to their own assigned cases (delete)" ON public.cases;
CREATE POLICY "Non-oversight members restricted to their own assigned cases (delete)"
ON public.cases AS RESTRICTIVE FOR DELETE
USING (
  EXISTS (SELECT 1 FROM org_members om WHERE om.org_id = cases.org_id AND om.user_id = auth.uid() AND public.can_see_all_org_cases(om.role))
  OR created_by = auth.uid()
  OR owner_id = auth.uid()
  OR EXISTS (SELECT 1 FROM case_access ca WHERE ca.case_id = cases.id AND ca.user_id = auth.uid())
);

-- ── 3. hr_review_requests: split FOR ALL into real per-operation policies ──

DROP POLICY IF EXISTS hr_review_requests_same_org ON public.hr_review_requests;

CREATE POLICY hr_review_requests_select_same_org ON public.hr_review_requests FOR SELECT
  USING (org_id IN (SELECT my_org_ids()));

CREATE POLICY hr_review_requests_insert_self ON public.hr_review_requests FOR INSERT
  WITH CHECK (org_id IN (SELECT my_org_ids()) AND requested_by = auth.uid());

-- respondToReview (App.jsx) is the only writer of status/comments/reviewed_*
-- — reachable in the UI only via isApprover, which is always set to isHR
-- (CaseViewScreen.jsx passes isApprover={isHR}), never a broader
-- "approver" concept despite the prop's name. This policy just makes that
-- already-true restriction real at the database layer.
CREATE POLICY hr_review_requests_update_hr_only ON public.hr_review_requests FOR UPDATE
  USING (
    org_id IN (SELECT my_org_ids())
    AND EXISTS (SELECT 1 FROM public.org_members om WHERE om.org_id = hr_review_requests.org_id AND om.user_id = auth.uid() AND public.can_see_all_org_cases(om.role))
  );

-- ── 4. MP19 HR-only actions: enforce at the database layer, not just the UI ──
-- (cases.investigation_paused itself already exists — added by
-- hr_intervention_2026-08-14.sql, applied earlier in this phase.)

CREATE OR REPLACE FUNCTION public.protect_case_hr_only_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if (new.investigation_paused is distinct from old.investigation_paused) then
    if auth.role() <> 'service_role' and not exists (
      select 1 from public.org_members
      where org_id = old.org_id and user_id = auth.uid() and public.can_see_all_org_cases(role)
    ) then
      raise exception 'Only HR can pause or resume an investigation';
    end if;
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.protect_case_hr_only_columns() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS protect_case_hr_only_columns_trigger ON public.cases;
CREATE TRIGGER protect_case_hr_only_columns_trigger BEFORE UPDATE ON public.cases
  FOR EACH ROW EXECUTE FUNCTION public.protect_case_hr_only_columns();

-- case_tasks.source has never had a CHECK constraint (any string was
-- valid) — this both closes that off to the known vocabulary and, via the
-- trigger below, stops a non-HR case participant from writing a task with
-- one of the three HR-note sources so it renders as if HR sent it.
ALTER TABLE public.case_tasks DROP CONSTRAINT IF EXISTS case_tasks_source_check;
ALTER TABLE public.case_tasks
  ADD CONSTRAINT case_tasks_source_check CHECK (source IS NULL OR source IN ('investigation_plan', 'hr_guidance', 'hr_question', 'hr_witness_request'));

-- Fires on INSERT and on any UPDATE that touches source — an
-- INSERT-only trigger leaves a real forgery path open: insert a task
-- with an ordinary source (passes the check), then UPDATE its source to
-- an HR-only value afterward, which an INSERT-only trigger never sees.
-- tg_op='INSERT' short-circuits before OLD is referenced, since OLD
-- doesn't exist yet on an insert.
CREATE OR REPLACE FUNCTION public.protect_hr_note_task_source()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if new.source in ('hr_guidance', 'hr_question', 'hr_witness_request')
     and (tg_op = 'INSERT' or new.source is distinct from old.source) then
    if auth.role() <> 'service_role' and not exists (
      select 1 from public.org_members
      where org_id = new.org_id and user_id = auth.uid() and public.can_see_all_org_cases(role)
    ) then
      raise exception 'Only HR can create a guidance, question, or witness-request note';
    end if;
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.protect_hr_note_task_source() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS protect_hr_note_task_source_trigger ON public.case_tasks;
CREATE TRIGGER protect_hr_note_task_source_trigger
  BEFORE INSERT OR UPDATE OF source ON public.case_tasks
  FOR EACH ROW EXECUTE FUNCTION public.protect_hr_note_task_source();

-- ── 5. concern_referrals: let generateConcernTriageSummary's own write
--    succeed for a non-HR submitter ──
-- concern_referrals_2026-08-12.sql's UPDATE policy is HR-only, but
-- generateConcernTriageSummary (App.jsx) always writes its ai_* fields
-- right after ANY org member's own submission — supabase.upsert() falls
-- through to an UPDATE once the row from the initial INSERT already
-- exists, which the HR-only policy silently rejects for a non-HR
-- submitter. Confirmed during final review: this is real, not
-- theoretical — it just isn't caught by the existing E2E suite, whose
-- one fixed login is HR (an HR submitter's own upsert already satisfies
-- the HR-only policy either way). Grants submitters UPDATE on their own
-- referral, then a trigger narrows what they can actually change on it to
-- exactly what Compass's own automated write touches — not their
-- original submission content, and not HR's triage disposition.
CREATE POLICY "Submitters can update their own referral"
ON public.concern_referrals FOR UPDATE
USING (submitted_by = auth.uid());

CREATE OR REPLACE FUNCTION public.protect_concern_referral_hr_only_columns()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
begin
  if auth.role() <> 'service_role' and not exists (
    select 1 from public.org_members
    where org_members.org_id = old.org_id and org_members.user_id = auth.uid() and public.is_hr_role(org_members.role)
  ) then
    if (new.status is distinct from old.status)
      or (new.hr_notes is distinct from old.hr_notes)
      or (new.linked_case_id is distinct from old.linked_case_id)
      or (new.employee_name is distinct from old.employee_name)
      or (new.description is distinct from old.description)
      or (new.concern_type is distinct from old.concern_type)
      or (new.witnesses is distinct from old.witnesses)
      or (new.discussed_with_employee is distinct from old.discussed_with_employee)
      or (new.involves_safety_or_welfare is distinct from old.involves_safety_or_welfare)
      or (new.immediate_safety_concern is distinct from old.immediate_safety_concern)
      or (new.may_need_formal_process is distinct from old.may_need_formal_process)
      or (new.evidence_description is distinct from old.evidence_description)
      or (new.evidence_files is distinct from old.evidence_files)
    then
      raise exception 'Only HR can change a concern referral''s triage disposition or original submission content';
    end if;
  end if;
  return new;
end;
$function$;

REVOKE ALL ON FUNCTION public.protect_concern_referral_hr_only_columns() FROM anon, authenticated, public;

DROP TRIGGER IF EXISTS protect_concern_referral_hr_only_columns_trigger ON public.concern_referrals;
CREATE TRIGGER protect_concern_referral_hr_only_columns_trigger BEFORE UPDATE ON public.concern_referrals
  FOR EACH ROW EXECUTE FUNCTION public.protect_concern_referral_hr_only_columns();
