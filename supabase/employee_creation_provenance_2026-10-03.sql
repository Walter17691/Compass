-- ============================================================================
-- EMPLOYEE CREATION PROVENANCE AND AUDIT — 2026-10-03
-- ============================================================================
-- HOW TO APPLY: paste into the Supabase SQL Editor and run, as ONE unit.
--
-- No table, no column, no data change. Two triggers added, one function
-- redefined. Existing employee rows are not read, written or repaired.
--
-- ┌─ THE GAP ───────────────────────────────────────────────────────────────┐
-- │ employee_records carried exactly two triggers and BOTH are UPDATE-only:  │
-- │   employee_records_correction_audit   AFTER UPDATE                       │
-- │   employee_records_protect_location   BEFORE UPDATE                      │
-- │                                                                          │
-- │ So CREATING an employee produced no audit event at all, and `created_by` │
-- │ — a column that already exists — was never populated by any path. A      │
-- │ person could enter the roster with no recorded creator and no trail.     │
-- │ That was tolerable while manual creation was effectively unreachable; it │
-- │ is not tolerable now that New Case, Intake and People all offer it.      │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- PRE-MIGRATION BASELINE (production, read-only, immediately before applying):
--   employee_records 2,685 · created_by populated 0 · audit_log 16,923 ·
--   audit rows with action 'Employee created' 0 · triggers on
--   employee_records 2 (both UPDATE-only) · policies on employee_records 4 ·
--   cases 2,960 · case_decisions 137 · tables 44
--   employee digest  md5(string_agg(id::text||':'||name, ',' order by id))
--                    = (recorded in the wave report)
-- ============================================================================


-- ── 1. created_by is assigned by the database, never by the client ─────────
--
-- Same principle as record_case_decision's decided_by: a client-supplied actor
-- is a forgeable actor. This overwrites whatever arrived, so there is no way for
-- a caller to attribute a creation to somebody else — and the canonical client
-- write (lib/employeeWrites.js) deliberately does not send the column at all.
--
-- auth.uid() is NULL for a service-role call or a SQL-editor migration. The
-- column is nullable and stays NULL in that case. That is the truthful answer:
-- no authenticated human created the row, and inventing one would be worse than
-- recording nothing.
create or replace function public.set_employee_created_by()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  new.created_by := auth.uid();
  return new;
end;
$$;

comment on function public.set_employee_created_by() is
  'Employee creation provenance. Assigns employee_records.created_by from auth.uid() on INSERT, overwriting any client-supplied value. NULL when there is no authenticated actor (service role or migration), which is recorded as unknown rather than invented.';

create trigger employee_records_set_created_by
  before insert on public.employee_records
  for each row execute function public.set_employee_created_by();


-- ── 2. An employee creation is an audited event ────────────────────────────
--
-- Mirrors log_employee_detail_correction (the AFTER UPDATE audit) in shape,
-- actor derivation and detail format, so the two read as one family.
--
-- ┌─ WHY A SERVICE/MIGRATION INSERT IS NOT AUDITED, STATED PLAINLY ─────────┐
-- │ audit_log.user_id and audit_log.user_name are both NOT NULL. When        │
-- │ auth.uid() is NULL there is no actor to record, and the only ways to      │
-- │ write a row anyway would be to invent a user id or to make a core         │
-- │ audit column nullable — the first is a lie, the second is a materially    │
-- │ broader change to a table every other audit row depends on.              │
-- │                                                                          │
-- │ So this writes an audit row when an authenticated actor exists and writes │
-- │ NOTHING when one does not. The provenance of such a row is still          │
-- │ recorded: created_by is NULL by section 1, which says "not created by an  │
-- │ authenticated user of this application" without claiming who did.        │
-- │                                                                          │
-- │ THE PRACTICAL CASE IS COVERED. CSV import runs as the ordinary            │
-- │ authenticated HR user, not as the service role, so a bulk import DOES     │
-- │ produce one audit row per created employee. That is intended; it is also  │
-- │ why the detail line is short.                                            │
-- └─────────────────────────────────────────────────────────────────────────┘
create or replace function public.log_employee_created()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member record;
begin
  -- No authenticated actor: record nothing rather than fabricate one.
  if auth.uid() is null then
    return null;
  end if;

  select * into v_member from public.org_members
    where org_id = new.org_id and user_id = auth.uid();

  insert into public.audit_log (org_id, user_id, user_name, action, detail, employee_id)
  values (new.org_id, auth.uid(), coalesce(v_member.name, 'Unknown'),
          'Employee created',
          format('employee %s (%L)%s', new.id, coalesce(new.name, '(unnamed)'),
                 case when new.location_id is null then '; no location yet'
                      else '; location ' || new.location_id::text end),
          new.id);
  return null;
end;
$$;

comment on function public.log_employee_created() is
  'Writes the Employee created audit event on employee_records INSERT, with the actor derived server-side from auth.uid(). Writes nothing when there is no authenticated actor, because audit_log.user_id is NOT NULL and an invented actor would be untrue; created_by is NULL in that case, which records the fact without claiming an identity. Covers every INSERT path including CSV import, which runs as the authenticated user.';

create trigger employee_records_created_audit
  after insert on public.employee_records
  for each row execute function public.log_employee_created();


-- ── 3. 'Employee created' becomes unforgeable ──────────────────────────────
--
-- Added to log_audit_event's reserved list, exactly as 'Employee details
-- corrected', 'Employee identity reconciled' and 'Outcome issued' already are,
-- so a client cannot write this action through the generic audit RPC and claim
-- an employee was created when none was.
--
-- EVERY OTHER LINE IS THE DEPLOYED DEFINITION, AND IT WAS NOT RETYPED. This
-- body was produced by reading pg_get_functiondef from production and inserting
-- one element into the reserved list programmatically. In D4.3 this same section
-- was transcribed by hand, a column name was mistyped, `create or replace
-- function` reported success anyway (plpgsql bodies are not name-resolved until
-- first execution), and the generic audit RPC was briefly broken in production.
-- Generating the text removes that class of mistake entirely.
CREATE OR REPLACE FUNCTION public.log_audit_event(p_org_id uuid, p_action text, p_detail text DEFAULT ''::text, p_case_id uuid DEFAULT NULL::uuid, p_ai_prepared boolean DEFAULT false, p_approved_by text DEFAULT NULL::text, p_data_used text DEFAULT NULL::text)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
    'Employee identity reconciled',
    'Employee identity corrected',
    'Employee details corrected',
    'Outcome issued',
    'Employee created'
  ) then
    raise exception 'This action can only be logged by its own authoritative function, not the generic audit RPC';
  end if;

  select * into v_member from public.org_members
    where org_id = p_org_id and user_id = auth.uid();
  if v_member.id is null then
    raise exception 'Not a member of this organisation';
  end if;
  v_user_name := coalesce(v_member.name, 'Unknown');

  if p_case_id is not null then
    select * into v_case from public.cases where id = p_case_id;
    if v_case.id is null or v_case.org_id <> p_org_id then
      raise exception 'You do not have access to log an event against this case' using errcode = '42501';
    end if;
    if not (
      exists (select 1 from public.org_members om
               where om.org_id = p_org_id and om.user_id = auth.uid() and om.case_access_level = 1)
      or (exists (select 1 from public.org_members om
                   where om.org_id = p_org_id and om.user_id = auth.uid() and om.case_access_level = 2)
          and v_case.created_by = auth.uid())
      or exists (select 1 from public.case_access ca
                  where ca.case_id = v_case.id and ca.user_id = auth.uid())
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
  values (p_org_id, auth.uid(), v_user_name, p_action, p_detail, p_case_id, p_ai_prepared, p_approved_by, p_data_used);
end;
$function$;


-- ============================================================================
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ============================================================================
-- * It does not backfill created_by on the 2,685 existing employees. Those rows
--   were created before the column was populated by anything, so their creator
--   is genuinely unknown and no value would be truthful.
-- * It does not write retrospective 'Employee created' audit rows for them, for
--   the same reason.
-- * It does not touch UNIQUE(org_id, name), the identity model, or any
--   reconciliation surface.
--
-- ============================================================================
-- ROLLBACK (complete; no data to restore)
-- ============================================================================
--   drop trigger if exists employee_records_created_audit on public.employee_records;
--   drop trigger if exists employee_records_set_created_by on public.employee_records;
--   drop function if exists public.log_employee_created();
--   drop function if exists public.set_employee_created_by();
--   -- and remove 'Employee created' from log_audit_event's reserved list.
--
-- Rolling back restores the unaudited-creation gap. created_by values already
-- assigned remain correct and are not removed.
-- ============================================================================
