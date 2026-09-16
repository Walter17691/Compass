-- ============================================================================
-- Independent appeal officer workflow — 2026-09-16
-- ============================================================================
-- Resolves APPEAL AUTHORIZATION — PRODUCT DECISION REQUIRED, the one item
-- deliberately left open by both the three-level permission model and the
-- destructive/decision authorization hardening (both FROZEN, untouched by
-- this file). Confirmed by the architecture review: case_access already
-- has a labelled 'appeal_manager' role (22 real rows in the E2E test org,
-- zero in the live production org) that nothing in the app actually reads
-- — this migration makes it the single authoritative relationship it was
-- always meant to be, without inventing a new one.
--
-- Traced first (per instruction): the ONLY current "appeal officer"
-- appointment path is HandoffModal.jsx, which is disciplinary-only
-- machinery reused unconditionally — it grants case_access role=
-- 'disciplinary_officer' (never 'appeal_manager') and unconditionally
-- writes cases.stage='disciplinary', regressing a case out of the
-- 'appeal' stage. That regression is fixed entirely client-side (a new
-- dedicated AppealOfficerModal that never touches stage) — no DB change
-- is needed or made for the stage-regression bug itself.
--
-- Pre-flight (2026-09-16, verified against production before writing
-- this): case_access.role='appeal_manager' has 22 rows, all in org
-- 7980b6a6-... (the E2E test org) — zero in real production data.
-- case_access.role='disciplinary_officer' has 0 rows anywhere. No case
-- currently has more than one appeal_manager row (verified: zero
-- duplicates), so the new partial unique index below applies cleanly.
-- ============================================================================


-- ============================================================================
-- PART 1 — at most one active appeal_manager per case, enforced structurally
-- ============================================================================
-- Defense in depth alongside the RPCs below, which also enforce this by
-- deleting any existing holder before inserting the new one — this index
-- means that invariant holds even if a future direct INSERT bypassed the
-- RPCs (blocked separately by PART 5's restrictive policies).
create unique index if not exists case_access_one_appeal_manager_per_case
on public.case_access (case_id)
where role = 'appeal_manager';


-- ============================================================================
-- PART 2 — appeal-decision authorization: matches the approved rule exactly
-- ============================================================================
-- HR OR this case's own appeal_manager — never disciplinary_officer merely
-- for holding that role, never Level 1 alone, never generic case_access.
-- Mirrors protect_allegations_finding_columns' exact shape (added in the
-- destructive/decision hardening migration) for the sibling finding
-- columns, applied here to the appeal columns instead. Replaces
-- protect_allegations_appeal_columns_trigger, which used the generic
-- HR-only protect_hr_or_immutable_columns — that function has no way to
-- carve out a case-specific case_access role, which is exactly what the
-- approved model requires here.
drop trigger if exists protect_allegations_appeal_columns_trigger on public.allegations;

create or replace function public.protect_allegations_appeal_decision_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if (new.appeal_outcome is distinct from old.appeal_outcome)
     or (new.appeal_reasoning is distinct from old.appeal_reasoning)
     or (new.appeal_decided_by is distinct from old.appeal_decided_by)
     or (new.appeal_decided_at is distinct from old.appeal_decided_at)
  then
    if not (
      exists (
        select 1 from public.org_members om
        where om.org_id = old.org_id and om.user_id = auth.uid() and public.is_hr_role(om.role)
      )
      or exists (
        select 1 from public.case_access ca
        where ca.case_id = old.case_id and ca.user_id = auth.uid() and ca.role = 'appeal_manager'
      )
    ) then
      raise exception 'Only HR or this case''s appointed appeal officer can record an appeal decision' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger protect_allegations_appeal_decision_columns_trigger
before update on public.allegations
for each row execute function public.protect_allegations_appeal_decision_columns();


-- ============================================================================
-- PART 3 — appoint_appeal_manager(): HR-only appointment/replacement, with
-- an independence conflict check and an explicit, audited HR override
-- ============================================================================
-- Deliberately NOT using can_grant_case_access() — the architecture review
-- confirmed it authorizes any existing case_access holder (even a bare
-- notetaker) to grant any role including appeal_manager, which is too
-- broad for "who may appoint the person who decides someone else's
-- appeal." This is a dedicated, narrower, self-contained rule rather than
-- a change to that shared function, which other roles (investigator,
-- notetaker, employee_manager, approver) still correctly rely on.
--
-- Independence: ACAS guidance is "wherever possible" someone not
-- previously involved, not an absolute bar — so this BLOCKS by default
-- when the proposed appeal_manager already appears as decided_by on ANY
-- allegation for this case, but lets HR proceed with a mandatory,
-- non-empty reason. That reason is never a casual dismissible warning:
-- it is only accepted from a caller already proven to be HR (the same
-- check gating the appointment itself), and it is persisted permanently
-- in audit_log (who appointed, who was appointed, that a conflict
-- existed, the reason, and the timestamp) rather than in a new schema
-- column that would need its own protection — the audit architecture
-- hardened earlier this project already exists for exactly this purpose.
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

  -- Independence check — ACAS: "wherever possible" someone not previously
  -- involved. Any allegation on this case decided by the proposed
  -- appointee counts as a conflict; they need not have decided all of them.
  select exists (
    select 1 from public.allegations a
    where a.case_id = p_case_id and a.decided_by = p_user_id
  ) into v_has_conflict;

  if v_has_conflict and coalesce(trim(p_override_reason), '') = '' then
    raise exception 'INDEPENDENCE_CONFLICT: % was involved in the original decision on this case. ACAS guidance expects an appeal to be heard by someone who was not — choose someone else, or provide a reason to proceed exceptionally.' , coalesce(v_appointee.name, 'This person')
      using errcode = '42501';
  end if;

  select * into v_previous from public.case_access where case_id = p_case_id and role = 'appeal_manager';

  -- case_access has a unique (case_id, user_id) constraint — ONE role per
  -- person per case, everywhere in the app (e.g. CaseViewScreen.jsx's
  -- myAccess lookup assumes exactly this). Found empirically, via rolled-
  -- back transactional testing, not by inspection alone: appointing
  -- someone who already holds a DIFFERENT role on this case (most notably
  -- the exceptional-override scenario, where the proposed appeal_manager
  -- is the case's current disciplinary_officer) collided with that
  -- constraint when this only deleted the existing appeal_manager row.
  -- Deleting on `role = 'appeal_manager' OR user_id = p_user_id` clears
  -- both the row being replaced AND any other role the new appointee
  -- already holds, mirroring the exact delete-then-insert pattern
  -- App.jsx's own assignCaseRole already uses elsewhere for the same
  -- structural reason. This is a real, deliberate consequence, not a
  -- bug: a person cannot simultaneously be recorded as both this case's
  -- disciplinary_officer and its appeal_manager under the existing
  -- one-role-per-person-per-case model, so appointing them as
  -- appeal_manager necessarily supersedes whatever role they held before.
  delete from public.case_access where case_id = p_case_id and (role = 'appeal_manager' or user_id = p_user_id);

  insert into public.case_access (case_id, org_id, user_id, role, granted_by)
  values (p_case_id, v_case.org_id, p_user_id, 'appeal_manager', auth.uid());

  if v_has_conflict then
    v_action := 'Appeal officer appointed despite independence conflict';
    v_detail := coalesce(v_appointee.name, 'Unknown') || ' — previously decided an allegation on this case. Reason for proceeding: ' || p_override_reason;
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
-- PART 4 — revoke_appeal_manager(): HR-only, immediate capability loss
-- ============================================================================
create or replace function public.revoke_appeal_manager(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_case record;
  v_hr_member record;
  v_previous record;
  v_previous_name text;
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

  select * into v_previous from public.case_access where case_id = p_case_id and role = 'appeal_manager';
  if v_previous.id is null then
    raise exception 'No appeal officer is currently appointed for this case';
  end if;

  select name into v_previous_name from public.org_members where org_id = v_case.org_id and user_id = v_previous.user_id;

  delete from public.case_access where id = v_previous.id;

  insert into public.audit_log (org_id, user_id, user_name, action, detail, case_id)
  values (v_case.org_id, auth.uid(), coalesce(v_hr_member.name, 'Unknown'), 'Appeal officer revoked', coalesce(v_previous_name, 'Unknown'), p_case_id);
end;
$$;

grant execute on function public.revoke_appeal_manager(uuid) to authenticated;


-- ============================================================================
-- PART 5 — case_access grant/revoke: appeal_manager requires the same
-- HR-only bar as the dedicated RPCs above, closing the direct-INSERT/
-- DELETE bypass (can_grant_case_access alone is too broad for this role —
-- see PART 3's own note)
-- ============================================================================
-- Checked the live trigger before touching anything: protect_case_access_
-- grant_trigger (privilege_tenant_ownership_invariant_2026-08-25.sql) is
-- BEFORE INSERT ONLY — it does not run on DELETE at all. Revocation is
-- governed purely by the "Only HR or an existing case participant can
-- revoke case access" RLS policy, keyed to the same can_grant_case_access()
-- confirmed too broad for this role. Rather than rewrite that trigger
-- (risking the disciplinary_officer/approver logic it already correctly
-- enforces) or fork can_grant_case_access() (used by other, legitimately
-- broader workflows — see the frozen three-level migration's own end
-- note), this adds two small ADDITIVE RESTRICTIVE policies — the same
-- pattern already used for "Only HR can delete a case" in the destructive/
-- decision hardening migration — which AND with the existing permissive
-- INSERT/DELETE policies without touching either.
create policy "Only HR can appoint the appeal officer" on public.case_access
as restrictive for insert
with check (
  role <> 'appeal_manager'
  or exists (
    select 1 from public.org_members om
    where om.org_id = case_access.org_id and om.user_id = auth.uid() and public.is_hr_role(om.role)
  )
);

create policy "Only HR can revoke the appeal officer" on public.case_access
as restrictive for delete
using (
  role <> 'appeal_manager'
  or exists (
    select 1 from public.org_members om
    where om.org_id = case_access.org_id and om.user_id = auth.uid() and public.is_hr_role(om.role)
  )
);


-- ============================================================================
-- PART 6 — reserve the appeal-officer audit actions to the RPCs above, same
-- pattern as 'Case deleted' in the destructive/decision hardening migration
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
    'Appeal officer appointed despite independence conflict'
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
