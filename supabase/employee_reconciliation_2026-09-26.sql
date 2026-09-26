-- ============================================================================
-- Phase E0.5B — employee identity reconciliation write contract — 2026-09-26
-- ============================================================================
-- APPLIED 2026-09-26 as migration `employee_reconciliation_2026_09_26`.
--
-- WHAT THIS ADDS: exactly one privileged function, plus one reserved-action
-- entry. NO new column, NO new table, NO RLS change, NO data change.
--
-- ┌─ WHAT THIS MIGRATION DELIBERATELY DOES NOT DO ─────────────────────────┐
-- │ NO BACKFILL. Not one historical case is reconciled by this migration.    │
-- │   Applying it leaves all 2,960 cases at employee_id NULL.                │
-- │ NO employee records created. The 649 unmatched subjects stay unmatched.   │
-- │ NOT dropping UNIQUE(org_id, name).                                       │
-- │ NOT touching meetings, embedded meetings, public.meetings, the two        │
-- │   preserved UAT rows, RLS, recipes, case types or any workflow column.    │
-- │ NO correction/undo operation — see the CORRECTION section below, which is  │
-- │   a documented design and an explicit GATE, not an implementation.        │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- WHY AN RPC AND NOT A CLIENT WRITE. Reconciliation decides whose HR history a
-- record belongs to. The five preconditions below must hold for every single
-- write, and a client cannot be the thing that guarantees them:
--
--   1. the actor is authenticated
--   2. the actor is HR (hr_manager | hr_director) in THIS case's organisation
--   3. the actor has access to THIS case
--   4. the target employee exists and is in the SAME organisation
--   5. the case is currently UNRECONCILED (employee_id IS NULL)
--
-- This follows the established Compass pattern for a privileged write —
-- delete_case, appoint_appeal_manager, revoke_appeal_manager — rather than
-- inventing a new one: plpgsql + security definer + set search_path, auth.uid()
-- checked first, org_id derived FROM THE ROW and never from a parameter, and the
-- audit row written in the same transaction as the mutation.
--
-- It is also why this is an RPC rather than an API route: Vercel functions are
-- at their cap, and a Postgres function costs none.
-- ============================================================================

-- ── 1. The reconciliation write ─────────────────────────────────────────────
create or replace function public.reconcile_case_employee(
  p_case_id uuid,
  p_employee_id uuid
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_case record;
  v_employee record;
  v_member record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- org_id is derived from the case row. A caller-supplied org_id would be a
  -- parameter the caller could lie about.
  select * into v_case from public.cases where id = p_case_id;
  if v_case.id is null then
    raise exception 'Case not found';
  end if;

  -- (2) HR only. Self-contained rather than relying on RLS elsewhere: this
  -- function is security definer, so RLS on public.cases does NOT apply to the
  -- update below and this check is the actual boundary.
  --
  -- Location Manager, Line Manager, Investigator, Legal/Compliance Reviewer and
  -- Auditor are excluded deliberately, even though several of them can read
  -- cases. Reconciliation is organisation-level identity administration, not a
  -- case action — being able to see a case is not authority to decide whose life
  -- it describes.
  select * into v_member from public.org_members
    where org_id = v_case.org_id and user_id = auth.uid();
  if v_member.id is null then
    raise exception 'Not a member of this organisation' using errcode = '42501';
  end if;
  if not public.is_hr_role(v_member.role) then
    raise exception 'Only an HR Director or HR Manager can reconcile employee identity'
      using errcode = '42501';
  end if;

  -- (3) Case access, matching log_audit_event's established test: full org
  -- access, or own-cases access on a case they created, or an explicit grant.
  if not (
    exists (select 1 from public.org_members om
             where om.org_id = v_case.org_id and om.user_id = auth.uid() and om.case_access_level = 1)
    or (
      exists (select 1 from public.org_members om
               where om.org_id = v_case.org_id and om.user_id = auth.uid() and om.case_access_level = 2)
      and v_case.created_by = auth.uid()
    )
    or exists (select 1 from public.case_access ca
                where ca.case_id = v_case.id and ca.user_id = auth.uid())
  ) then
    raise exception 'You do not have access to this case' using errcode = '42501';
  end if;

  -- (4) Target employee must exist and be in the same organisation. The
  -- cases_employee_parentage_guard trigger enforces this too; both are kept, so
  -- neither is the single point of failure for a tenancy breach.
  select * into v_employee from public.employee_records where id = p_employee_id;
  if v_employee.id is null then
    raise exception 'Employee record not found';
  end if;
  if v_employee.org_id <> v_case.org_id then
    raise exception 'Cannot reconcile a case to an employee in another organisation'
      using errcode = '42501';
  end if;

  -- (5) OPTIMISTIC CONCURRENCY, done as a conditional UPDATE rather than a
  -- check-then-write. Reading employee_id and then updating would leave a
  -- window in which another administrator reconciles the same case between the
  -- two statements — and the loser would silently overwrite the winner.
  --
  -- `employee_id is null` in the WHERE clause makes the check and the write one
  -- atomic statement. If another administrator got there first, zero rows match
  -- and we raise instead of overwriting. The existing fill-once trigger would
  -- also refuse a UUID→UUID change, but a truthful, specific message to the
  -- second administrator is better than a generic trigger error.
  --
  -- Only employee_id is assigned. No stage, type, outcome, meeting, task,
  -- letter, signature or employee_name is touched: reconciliation changes WHO a
  -- historical case belongs to, never WHAT HAPPENED in it. employee_name in
  -- particular is left exactly as recorded — "John A. Smith" stays "John A.
  -- Smith" even when reconciled to an employee named "John Smith", because the
  -- uuid establishes identity and the stored name is a point-in-time snapshot.
  update public.cases
     set employee_id = p_employee_id
   where id = p_case_id
     and employee_id is null;

  if not found then
    raise exception 'This case has already been reconciled to an employee by someone else. Refresh to see the current identity.'
      using errcode = 'PT409';
  end if;

  -- (6) Provenance, in the same transaction as the write. A successful
  -- reconciliation cannot therefore exist without its audit row.
  --
  -- The detail records the historical name snapshot, the chosen employee's uuid
  -- and their display name at the time of the decision. No case narrative,
  -- allegation, outcome or meeting content — this is an identity decision, and
  -- the audit trail for it needs identity, actor and time, nothing more.
  insert into public.audit_log (org_id, user_id, user_name, action, detail, case_id)
  values (
    v_case.org_id,
    auth.uid(),
    coalesce(v_member.name, 'Unknown'),
    'Employee identity reconciled',
    format('historical name %L -> employee %s (%L); single case',
           coalesce(v_case.employee_name, '(none)'), p_employee_id, coalesce(v_employee.name, '(unnamed)')),
    v_case.id
  );
end;
$$;

grant execute on function public.reconcile_case_employee(uuid, uuid) to authenticated;
revoke all on function public.reconcile_case_employee(uuid, uuid) from anon, public;

comment on function public.reconcile_case_employee(uuid, uuid) is
  'Phase E0.5B. Assigns a canonical employee to ONE unreconciled historical case. HR-only, case-access checked, same-org enforced, fill-once via a conditional UPDATE so a concurrent reconciliation cannot be overwritten. Writes its own audit row. Never alters employee_name or any workflow column.';

-- ── 2. Make the audit action unforgeable ───────────────────────────────────
-- The generic audit RPC must not be able to write this action, exactly as it
-- already refuses 'Case deleted' and the appeal-officer actions: an identity
-- decision must be attributable to the function that actually performed it.
-- Re-created here with the existing reserved list plus the new entry; every
-- other line is byte-identical to the deployed definition.
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
    -- Phase E0.5B
    'Employee identity reconciled'
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
-- CORRECTION / UNDO — DESIGNED HERE, DELIBERATELY NOT IMPLEMENTED
-- ============================================================================
-- The E0.5A parentage contract refuses UUID→UUID and UUID→NULL through normal
-- writes, and this phase does not weaken it for convenience. So a mistaken
-- reconciliation is, today, permanent.
--
-- That is acceptable for UAT fixtures. It is NOT acceptable for customer data:
-- a typo by an HR administrator must not become permanently irreparable.
--
-- ┌─ HARD GATE ─────────────────────────────────────────────────────────────┐
-- │ PRODUCTION RECONCILIATION OF REAL CUSTOMER CASES MUST NOT BEGIN UNTIL A   │
-- │ CORRECTION OPERATION EXISTS. Deploying this migration does not open that   │
-- │ door: nothing here reconciles anything, and the workbench it serves is     │
-- │ for UAT data until that gate is cleared.                                  │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- The intended shape, for the phase that implements it:
--
--   correct_case_employee(p_case_id uuid, p_employee_id uuid, p_reason text)
--     * hr_director ONLY — narrower than reconciliation, because this is the
--       operation that can move a record between two real people
--     * p_reason mandatory, non-empty, and stored
--     * same-org validation on the new employee, as here
--     * an immutable audit row recording OLD uuid, NEW uuid, reason, actor,
--       timestamp — the old value is the part that makes it auditable, and a
--       plain UPDATE would destroy it
--     * implemented as its own security definer function so that the fill-once
--       trigger can continue to refuse UUID→UUID for every other caller; the
--       trigger would need a narrowly-scoped exemption recognising only this
--       function, which is why it must be designed as a unit with the trigger
--       rather than bolted on
--     * 'Employee identity corrected' added to log_audit_event's reserved list
--
-- Deliberately out of scope here: it needs its own trigger change, its own
-- security proof and its own UAT, and folding that into this phase would
-- enlarge the blast radius of the phase that introduces the first write.
-- ============================================================================

-- ============================================================================
-- BATCH RECONCILIATION — DEFERRED ON EVIDENCE
-- ============================================================================
-- Measured in production 2026-09-26: the only genuine customer organisation
-- (Compass LTD) holds 9 unreconciled cases, 0 of which share a subject name —
-- so batch reconciliation would have no production work to do. Across the two
-- test organisations, every repeated subject has exactly 2 cases.
--
-- Atomic multi-row semantics, per-row concurrency handling and per-row audit
-- provenance are materially more surface than the single-case contract above,
-- for a saving of one click on 21 test-data subjects. Single-case first;
-- safety over speed.
-- ============================================================================

-- ============================================================================
-- ROLLBACK (complete)
-- ============================================================================
--   drop function if exists public.reconcile_case_employee(uuid, uuid);
--   -- and re-create log_audit_event without the 'Employee identity reconciled'
--   -- reserved entry (the rest of its body is unchanged by this migration).
-- ============================================================================
