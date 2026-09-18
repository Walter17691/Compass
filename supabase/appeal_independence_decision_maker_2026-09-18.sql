-- ============================================================================
-- Appeal Independence P1 — canonical disciplinary decision-maker — 2026-09-18
-- ============================================================================
-- Confirmed defect (real UAT case, production, read-only investigation):
-- appoint_appeal_manager()'s independence check (appeal_officer_workflow_
-- 2026-09-16.sql) relies exclusively on allegations.decided_by, which is
-- only ever populated by the Allegations-tab structured decision workflow
-- (setAllegationStatus, App.jsx). A case decided via the equally-supported
-- meeting/outcome-letter workflow (OutcomeModal.finalizeOutcome) has no
-- allegations rows at all, so a genuine original decision-maker on that
-- path was completely invisible to the check — verified directly: a
-- production case's disciplinary hearing was chaired by, and the decision
-- personally recorded by, the exact person then appointed as that case's
-- appeal officer, with zero independence warning.
--
-- Deliberately NOT solved by parsing meeting transcripts, generated
-- letters, signatures, or "savedBy" display strings at appointment time —
-- those are historical evidence, not an authorization primitive, and are
-- never authoritatively tied to auth.uid() in the first place (savedBy is
-- a free-text name snapshot). The fix instead makes the future outcome
-- workflow explicitly persist the authoritative decision-maker as a real
-- user id, and teaches the independence check to read it.
-- ============================================================================


-- ============================================================================
-- PART 1 — cases.disciplinary_decided_by: the canonical decision-maker for
-- the meeting/outcome-letter pathway
-- ============================================================================
-- Assessed and rejected reusing an existing field:
--   - disciplinary_officer_id is a PROSPECTIVE assignment made at
--     investigation->disciplinary hand-off (HandoffModal.jsx) — it can be
--     null even when a real decision exists (confirmed on the discovery
--     case: disciplinary_officer_id was null throughout), and there is no
--     guarantee the person handed off to is the same person who ultimately
--     chairs the hearing and decides. Different concept, correctly left
--     untouched (constraint: do not break disciplinary_officer semantics).
--   - owner_id/created_by/manager are ownership/administrative fields, not
--     an attestation that this specific person personally decided the
--     outcome — using them would violate the explicit instruction not to
--     infer authorization from ownership or free text.
--   - allegations.decided_by is per-allegation, not per-case, and a case
--     can have zero, one, or several allegations decided by different
--     people at different times — force-merging that into one case-level
--     value would be lossy. It is left exactly as-is; see PART 3.
-- A new, nullable, uuid column is therefore the smallest safe addition —
-- additive, no backfill, no existing row invalidated.
alter table public.cases
  add column if not exists disciplinary_decided_by uuid null references auth.users(id);

comment on column public.cases.disciplinary_decided_by is
  'The authoritative user who personally decided this case''s disciplinary/grievance outcome, set by OutcomeModal.finalizeOutcome() in the same write as cases.outcome. Populated going forward only — null for any case whose outcome was recorded before this column existed, or whose outcome was decided solely via the Allegations-tab workflow (see allegations.decided_by for that pathway instead, which remains independently authoritative and is not superseded by this column). Consumed by appoint_appeal_manager()''s independence check alongside allegations.decided_by. Never inferred from owner_id, created_by, meeting chair/savedBy text, or letter signatures — those are historical evidence, not this column''s source.';

-- Protected identically to cases.outcome/outcome_issued_at/outcome_notes/
-- warning_duration_months/warning_expires_at — it is written in the exact
-- same atomic saveCases() call as those columns by OutcomeModal, so it
-- must share their protection tier exactly (see warning_duration_outcome_
-- metadata_2026-09-09.sql's own header for why these five were combined
-- into one guard rather than four independently-maintained ones — the
-- same reasoning extends to this sixth column). Whoever is already
-- authorized to write cases.outcome (HR, or this case's own
-- disciplinary_officer) is authorized to write who decided it, in the
-- same statement — no new authorization surface is introduced.
create or replace function public.protect_case_hr_only_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if (new.investigation_paused is distinct from old.investigation_paused) then
    if auth.role() <> 'service_role' and not exists (
      select 1 from public.org_members
      where org_id = old.org_id and user_id = auth.uid() and public.can_see_all_org_cases(role)
    ) then
      raise exception 'Only HR can pause or resume an investigation';
    end if;
  end if;

  if (
    new.outcome is distinct from old.outcome
    or new.outcome_issued_at is distinct from old.outcome_issued_at
    or new.outcome_notes is distinct from old.outcome_notes
    or new.warning_duration_months is distinct from old.warning_duration_months
    or new.warning_expires_at is distinct from old.warning_expires_at
    or new.disciplinary_decided_by is distinct from old.disciplinary_decided_by
  ) then
    if auth.role() <> 'service_role' and not (
      exists (
        select 1 from public.org_members
        where org_id = old.org_id and user_id = auth.uid() and public.is_hr_role(role)
      )
      or exists (
        select 1 from public.case_access
        where case_id = old.id and user_id = auth.uid() and role = 'disciplinary_officer'
      )
    ) then
      raise exception 'Only HR or this case''s disciplinary officer can set the case outcome';
    end if;
  end if;

  return new;
end;
$$;


-- ============================================================================
-- PART 2 — appoint_appeal_manager(): independence check now reads BOTH
-- pathways' canonical field, plus an explicit, distinctly-audited "unknown"
-- state for legacy cases with no attribution at all
-- ============================================================================
-- Three distinguishable outcomes, in priority order:
--   1. CONFLICT — the proposed appointee matches a known decision-maker
--      (either field). Blocked without a mandatory override reason, exactly
--      as before. Audited as "...despite independence conflict".
--   2. UNKNOWN — neither field has ANY decision-maker recorded for this
--      case at all (not "recorded as someone else" — genuinely absent). A
--      case reaching this RPC always has an outcome (appeal is only
--      reachable after one), so absence of both fields means the decision-
--      maker is unrecorded, not nonexistent — exactly the discovery case's
--      own state. Per instruction, this must NOT be silently treated as
--      "independent": it is blocked without an explicit HR confirmation,
--      using a distinct error prefix (INDEPENDENCE_UNKNOWN) and a distinct,
--      separately-identifiable audit action, so it is never conflated with
--      a genuine, verified conflict in the historical record.
--   3. CLEAR — a decision-maker is known and it is not the proposed
--      appointee. Proceeds exactly as before, no reason required.
create or replace function public.appoint_appeal_manager(
  p_case_id uuid,
  p_user_id uuid,
  p_override_reason text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_case record;
  v_hr_member record;
  v_appointee record;
  v_previous record;
  v_has_conflict boolean;
  v_has_known_attribution boolean;
  v_action text;
  v_detail text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_case from public.cases where id = p_case_id;
  if v_case.id is null then
    raise exception 'Case not found';
  end if;

  select * into v_hr_member from public.org_members where org_id = v_case.org_id and user_id = auth.uid();
  if v_hr_member.id is null or not public.is_hr_role(v_hr_member.role) then
    raise exception 'Only an HR Director or HR Manager can appoint, replace, or revoke an appeal officer' using errcode = '42501';
  end if;

  select * into v_appointee from public.org_members where org_id = v_case.org_id and user_id = p_user_id;
  if v_appointee.id is null then
    raise exception 'The selected person is not a member of this organisation';
  end if;

  select
    exists (select 1 from public.allegations a where a.case_id = p_case_id and a.decided_by = p_user_id)
    or (v_case.disciplinary_decided_by is not null and v_case.disciplinary_decided_by = p_user_id)
  into v_has_conflict;

  select
    (v_case.disciplinary_decided_by is not null)
    or exists (select 1 from public.allegations a where a.case_id = p_case_id and a.decided_by is not null)
  into v_has_known_attribution;

  if v_has_conflict and coalesce(trim(p_override_reason), '') = '' then
    raise exception 'INDEPENDENCE_CONFLICT: % was involved in the original decision on this case. ACAS guidance expects an appeal to be heard by someone who was not — choose someone else, or provide a reason to proceed exceptionally.' , coalesce(v_appointee.name, 'This person')
      using errcode = '42501';
  end if;

  if not v_has_conflict and not v_has_known_attribution and coalesce(trim(p_override_reason), '') = '' then
    raise exception 'INDEPENDENCE_UNKNOWN: This case has no recorded original decision-maker to check % against — it predates structured decision tracking. Confirm you have verified % was not involved in the original decision, or choose someone else.', coalesce(v_appointee.name, 'this person'), coalesce(v_appointee.name, 'this person')
      using errcode = '42501';
  end if;

  select * into v_previous from public.case_access where case_id = p_case_id and role = 'appeal_manager';

  -- case_access has a unique (case_id, user_id) constraint — ONE role per
  -- person per case, everywhere in the app. Unchanged from the original
  -- migration; see that file's own comment for why delete matches on
  -- (role = 'appeal_manager' OR user_id = p_user_id).
  delete from public.case_access where case_id = p_case_id and (role = 'appeal_manager' or user_id = p_user_id);

  insert into public.case_access (case_id, org_id, user_id, role, granted_by)
  values (p_case_id, v_case.org_id, p_user_id, 'appeal_manager', auth.uid());

  if v_has_conflict then
    v_action := 'Appeal officer appointed despite independence conflict';
    v_detail := coalesce(v_appointee.name, 'Unknown') || ' — previously decided the original outcome on this case. Reason for proceeding: ' || p_override_reason;
  elsif not v_has_known_attribution then
    v_action := 'Appeal officer appointed without verified independence (legacy case)';
    v_detail := coalesce(v_appointee.name, 'Unknown') || ' — this case has no recorded original decision-maker to verify independence against. HR confirmation: ' || p_override_reason;
  elsif v_previous.id is not null then
    v_action := 'Appeal officer replaced';
    select coalesce(om.name, v_previous.user_id::text) into v_detail
    from public.org_members om where om.org_id = v_case.org_id and om.user_id = v_previous.user_id;
    v_detail := coalesce(v_detail, 'Unknown') || ' replaced by ' || coalesce(v_appointee.name, 'Unknown');
  else
    v_action := 'Appeal officer appointed';
    v_detail := coalesce(v_appointee.name, 'Unknown');
  end if;

  insert into public.audit_log (org_id, user_id, user_name, action, detail, case_id)
  values (v_case.org_id, auth.uid(), coalesce(v_hr_member.name, 'Unknown'), v_action, v_detail, p_case_id);
end;
$$;

grant execute on function public.appoint_appeal_manager(uuid, uuid, text) to authenticated;


-- ============================================================================
-- PART 3 — reserve the new audit action to appoint_appeal_manager() itself,
-- same pattern as the other appeal-officer actions
-- ============================================================================
create or replace function public.log_audit_event(
  p_org_id uuid,
  p_action text,
  p_detail text default '',
  p_case_id uuid default null,
  p_ai_prepared boolean default false,
  p_approved_by text default null,
  p_data_used text default null
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_user_name text;
  v_member record;
  v_case record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_action in (
    'Case deleted',
    'Appeal officer appointed',
    'Appeal officer replaced',
    'Appeal officer revoked',
    'Appeal officer appointed despite independence conflict',
    'Appeal officer appointed without verified independence (legacy case)'
  ) then
    raise exception 'This action can only be logged by its own authoritative function, not the generic audit RPC';
  end if;

  select * into v_member from public.org_members where org_id = p_org_id and user_id = auth.uid();
  if v_member.id is null then
    raise exception 'Not a member of this organisation';
  end if;
  v_user_name := v_member.name;

  if p_case_id is not null then
    select * into v_case from public.cases where id = p_case_id and org_id = p_org_id;
    if v_case.id is null then
      raise exception 'You do not have access to log an event against this case' using errcode = '42501';
    end if;
    if not (
      exists (select 1 from public.org_members om where om.org_id = v_case.org_id and om.user_id = auth.uid() and om.case_access_level = 1)
      or (
        exists (select 1 from public.org_members om where om.org_id = v_case.org_id and om.user_id = auth.uid() and om.case_access_level = 2)
        and v_case.created_by = auth.uid()
      )
      or exists (select 1 from public.case_access ca where ca.case_id = v_case.id and ca.user_id = auth.uid())
    ) then
      raise exception 'You do not have access to log an event against this case';
    end if;

    if p_action = 'Outcome issued' and v_case.outcome is null then
      raise exception 'Cannot log an outcome-issued event — this case has no outcome recorded';
    end if;
  end if;

  if p_action = 'Case access level changed' and not (public.is_hr_role(v_member.role) or v_member.case_access_level = 1) then
    raise exception 'You do not have authority to log a case access level change';
  end if;

  insert into public.audit_log (org_id, user_id, user_name, action, detail, case_id, ai_prepared, approved_by, data_used)
  values (p_org_id, auth.uid(), coalesce(v_user_name, 'Unknown'), p_action, p_detail, p_case_id, p_ai_prepared, p_approved_by, p_data_used);
end;
$$;
