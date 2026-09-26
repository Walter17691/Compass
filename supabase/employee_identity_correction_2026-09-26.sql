-- ============================================================================
-- Phase E0.6 Part A — reconciliation CORRECTION — 2026-09-26
-- ============================================================================
-- APPLIED 2026-09-26 as migration `employee_identity_correction_2026_09_26`.
--
-- E0.5B shipped reconciliation (NULL -> UUID) and recorded correction as a HARD
-- GATE: production reconciliation of real customer cases must not begin until a
-- mistaken decision can be put right, because a typo by an administrator must
-- not become permanently irreparable. This closes that gate.
--
-- ┌─ WHAT CHANGES, AND WHAT EMPHATICALLY DOES NOT ──────────────────────────┐
-- │ ADDS   correct_case_employee(case, new_employee, reason) — hr_director     │
-- │        ONLY, and one narrowly-scoped exemption in the fill-once trigger.   │
-- │                                                                          │
-- │ NORMAL WRITES ARE UNCHANGED. A plain UPDATE still cannot do UUID -> UUID   │
-- │ and still cannot do UUID -> NULL. The invariant is not weakened globally;  │
-- │ it gains one door that only this function can open, for one row at a time. │
-- │                                                                          │
-- │ NO "unlink". UUID -> NULL stays blocked for EVERY caller including this    │
-- │ one. If a future requirement genuinely needs it, that is a separate        │
-- │ privileged operation with its own justification — not a flag on this one.  │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- WHY HR DIRECTOR ONLY, when reconciliation is HR Director *or* HR Manager:
-- reconciliation answers "who is this unattributed record about?" from nothing.
-- Correction OVERRULES a colleague's recorded decision and moves a case between
-- two real people's Employee Files. That is materially more sensitive, so it
-- sits one rung higher.
-- ============================================================================

-- ── 1. The exemption mechanism ──────────────────────────────────────────────
--
-- A transaction-local GUC, set only by correct_case_employee and read only by
-- the fill-once trigger. It carries the CASE ID rather than a boolean, so the
-- door it opens admits exactly one row.
--
-- Why this is the narrowest mechanism available here, rather than a broad
-- escape hatch:
--
--   * `set_config(..., is_local => true)` is rolled back with the transaction,
--     so it cannot leak into a later statement, request or session.
--   * The value must EQUAL the row being updated. A stale or wrong value does
--     not unlock anything.
--   * correct_case_employee resets it immediately after its UPDATE, so even
--     within its own transaction the door does not stay open for a second row.
--   * A client cannot set it. `set_config` lives in `pg_catalog`, which
--     PostgREST does not expose for RPC, and NO function in `public` wraps it
--     (verified against the live database, not assumed). The only writer is the
--     definer function below, which authorises the caller first.
--   * The exemption covers the FILL-ONCE rule only. Cross-organisation
--     parentage is checked in the block ABOVE it and is never exempted, so the
--     door cannot be used to move a case to another tenant's employee.
--
-- Alternatives rejected: `alter table ... disable trigger` (table-wide, affects
-- concurrent writers, needs ownership); delete-and-reinsert (destroys the row
-- and its history); a boolean flag (would unlock every row in the transaction).
create or replace function public.cases_employee_parentage_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  employee_org uuid;
  correcting text;
begin
  -- TENANCY. Unchanged, and deliberately OUTSIDE the correction exemption: a
  -- correction may move a case between employees, never between organisations.
  if new.employee_id is not null
     and (tg_op = 'INSERT' or new.employee_id is distinct from old.employee_id) then
    select er.org_id into employee_org
      from public.employee_records er where er.id = new.employee_id;
    if employee_org is null then
      raise exception 'Cannot attach case % to an employee that does not exist.', new.id
        using errcode = 'foreign_key_violation';
    end if;
    if employee_org <> new.org_id then
      raise exception 'Cannot attach a case in org % to an employee in org % (case %).',
        new.org_id, employee_org, new.id using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'UPDATE' then
    -- UUID -> NULL. Blocked for everyone, including the correction operation.
    if old.employee_id is not null and new.employee_id is null then
      raise exception 'A case''s employee cannot be cleared once set (case %).', old.id
        using errcode = 'check_violation';
    end if;

    -- UUID -> different UUID. Blocked unless THIS row is the one the
    -- authoritative correction operation is currently working on.
    if old.employee_id is not null and new.employee_id is distinct from old.employee_id then
      correcting := nullif(current_setting('compass.correcting_case_employee', true), '');
      if correcting is null or correcting <> old.id::text then
        raise exception 'A case cannot be moved between employees (case %, employee % -> %). An identity correction is an explicit, audited operation, not an update.',
          old.id, old.employee_id, new.employee_id using errcode = 'check_violation';
      end if;
    end if;
  end if;

  return new;
end;
$$;

-- ── 2. The correction operation ─────────────────────────────────────────────
create or replace function public.correct_case_employee(
  p_case_id uuid,
  p_new_employee_id uuid,
  p_reason text
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_case record;
  v_member record;
  v_new record;
  v_old_name text;
  v_reason text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  v_reason := btrim(coalesce(p_reason, ''));
  if length(v_reason) < 10 then
    raise exception 'A correction requires a reason explaining why the original identity was wrong (at least 10 characters).'
      using errcode = 'check_violation';
  end if;

  select * into v_case from public.cases where id = p_case_id;
  if v_case.id is null then
    raise exception 'Case not found';
  end if;

  -- HR DIRECTOR ONLY. is_hr_role() is deliberately NOT used here: it would
  -- admit hr_manager, and this operation overrules a recorded decision.
  select * into v_member from public.org_members
    where org_id = v_case.org_id and user_id = auth.uid();
  if v_member.id is null then
    raise exception 'Not a member of this organisation' using errcode = '42501';
  end if;
  if v_member.role <> 'hr_director' then
    raise exception 'Only an HR Director can correct an established employee identity'
      using errcode = '42501';
  end if;

  if v_case.employee_id is null then
    raise exception 'This case has no employee identity to correct. Reconcile it instead.'
      using errcode = 'check_violation';
  end if;
  if v_case.employee_id = p_new_employee_id then
    raise exception 'This case is already attributed to that employee.'
      using errcode = 'check_violation';
  end if;

  select * into v_new from public.employee_records where id = p_new_employee_id;
  if v_new.id is null then
    raise exception 'Employee record not found';
  end if;
  if v_new.org_id <> v_case.org_id then
    raise exception 'Cannot correct a case to an employee in another organisation'
      using errcode = '42501';
  end if;

  -- The OLD display name is captured BEFORE the write. Without it the audit
  -- trail records a uuid nobody can read, and if that employee is later deleted
  -- the trail would lose the only human-readable trace of the original decision.
  select name into v_old_name from public.employee_records where id = v_case.employee_id;

  -- Open the door for this row only, write, close it immediately.
  perform set_config('compass.correcting_case_employee', p_case_id::text, true);
  update public.cases
     set employee_id = p_new_employee_id
   where id = p_case_id
     and employee_id = v_case.employee_id;   -- optimistic: refuse if it moved under us
  if not found then
    perform set_config('compass.correcting_case_employee', '', true);
    raise exception 'This case''s employee identity changed while you were correcting it. Refresh and try again.'
      using errcode = 'PT409';
  end if;
  perform set_config('compass.correcting_case_employee', '', true);

  -- Immutable provenance, same transaction. Old AND new identity, because a
  -- correction without the value it replaced is not auditable. No case
  -- narrative: this is an identity decision.
  insert into public.audit_log (org_id, user_id, user_name, action, detail, case_id)
  values (
    v_case.org_id,
    auth.uid(),
    coalesce(v_member.name, 'Unknown'),
    'Employee identity corrected',
    format('employee %s (%L) -> %s (%L); historical name %L; reason: %s',
           v_case.employee_id, coalesce(v_old_name, '(unknown)'),
           p_new_employee_id, coalesce(v_new.name, '(unnamed)'),
           coalesce(v_case.employee_name, '(none)'), v_reason),
    v_case.id
  );
end;
$$;

grant execute on function public.correct_case_employee(uuid, uuid, text) to authenticated;
revoke all on function public.correct_case_employee(uuid, uuid, text) from anon, public;

comment on function public.correct_case_employee(uuid, uuid, text) is
  'Phase E0.6. Moves ONE already-reconciled case to a different canonical employee. HR DIRECTOR ONLY (not hr_manager), mandatory stored reason, same-org enforced, old and new identity recorded in an immutable audit row. Uses a transaction-local, case-scoped exemption from the fill-once trigger; normal writes still cannot perform UUID->UUID or UUID->NULL.';

-- ── 3. Make the correction action unforgeable ──────────────────────────────
-- Same treatment as 'Employee identity reconciled': the generic audit RPC must
-- not be able to write it.
create or replace function public.log_audit_event(
  p_org_id uuid,
  p_action text,
  p_detail text default ''::text,
  p_case_id uuid default null::uuid,
  p_ai_prepared boolean default false,
  p_approved_by text default null::text,
  p_data_used text default null::text
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
    'Appeal officer appointed without verified independence (legacy case)',
    'Employee identity reconciled',
    -- Phase E0.6
    'Employee identity corrected'
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

-- ============================================================================
-- ROLLBACK (complete)
-- ============================================================================
--   drop function if exists public.correct_case_employee(uuid, uuid, text);
--   -- then re-create cases_employee_parentage_guard() WITHOUT the `correcting`
--   -- branch (restoring the unconditional UUID->UUID refusal), and re-create
--   -- log_audit_event without the 'Employee identity corrected' reserved entry.
-- ============================================================================
