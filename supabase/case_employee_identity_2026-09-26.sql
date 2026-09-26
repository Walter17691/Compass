-- ============================================================================
-- Phase E0.5A — new-write employee identity on cases — 2026-09-26
-- ============================================================================
-- APPLIED 2026-09-26.
--
-- WHY THIS COMES BEFORE RECONCILIATION. Phase E0 established that
-- employee_records.id is the canonical employee identity, but Compass was still
-- MANUFACTURING identity debt on every new case: both creation paths take the
-- employee name as free text, their autocomplete is sourced from existing cases
-- rather than the employee roster, one path upserts an employee record by
-- (org_id, name) and the other creates none at all. Reconciling 650 historical
-- name-only subjects while that continues would be bailing with the tap running.
--
-- So: cases gain a canonical employee reference, and NEW cases must carry it.
--
-- ┌─ WHAT THIS MIGRATION DELIBERATELY DOES NOT DO ─────────────────────────┐
-- │ NOT NULL — historical rows stay NULL. 2,960 existing cases are untouched. │
-- │ NO BACKFILL — nothing is mapped, least of all by name. A name match is    │
-- │   not migration evidence, and for 650 of 2,939 subjects there is not even │
-- │   a name to match against.                                                │
-- │ NOT dropping UNIQUE(org_id, name) on employee_records — 34 name-equality  │
-- │   identity decisions and 4 live analytics functions still depend on it.    │
-- │ NOT touching meetings, embedded meetings, RLS, recipes or case types.      │
-- └─────────────────────────────────────────────────────────────────────────┘
-- ============================================================================

-- ── 1. The canonical reference ──────────────────────────────────────────────
-- ON DELETE RESTRICT, deliberately. Deleting an employee must never silently
-- erase the HR cases concerning them; erasure is an explicit, audited operation,
-- not a referential side effect. (The same reasoning as meetings.employee_id in
-- the Employee File design.)
alter table public.cases
  add column if not exists employee_id uuid
  references public.employee_records(id) on delete restrict;

-- Employee-centric case lookup — the query the Employee File will live on, and
-- the one `cases.employee_name` has never had an index for.
create index if not exists cases_org_employee_idx
  on public.cases (org_id, employee_id)
  where employee_id is not null;

comment on column public.cases.employee_id is
  'Canonical employee identity for this case (Phase E0.5A). NULL = a legacy, name-only case awaiting reconciliation (E0.5B) — NEVER interpret NULL as a new or unknown employee, and never resolve it by name. When present it is authoritative and employee_name is only a point-in-time display snapshot.';

-- ── 2. Tenancy + fill-once parentage, enforced at the database ─────────────
--
-- A trigger rather than a check constraint, because the rule spans two tables
-- (the employee must be in the SAME organisation as the case), and a trigger
-- rather than RLS alone because RLS is not evaluated for the table owner or the
-- service role — and a case pointing at another tenant's employee would be a
-- tenancy breach, not merely a bad reference.
--
-- FILL-ONCE, not plain immutability. public.cases already has
-- protect_cases_identity_trigger (protect_immutable_columns on org_id,
-- created_by), but that helper blocks EVERY change including NULL -> value, and
-- that is the one transition reconciliation needs. The semantics here are the
-- same ones meetings.case_id already uses:
--
--   NULL  -> value   PERMITTED (the reconciliation fill; same-org verified)
--   value -> NULL    REJECTED
--   value -> other   REJECTED
--
-- E0.5A's application code only ever sets employee_id at INSERT, so nothing in
-- this phase performs a fill; the transition is permitted so that E0.5B does not
-- have to change this trigger to do its job.
create or replace function public.cases_employee_parentage_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  employee_org uuid;
begin
  -- Tenancy is checked on every write that names an employee, on INSERT and
  -- UPDATE alike, and is never exempted for any role.
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
    if old.employee_id is not null and new.employee_id is null then
      raise exception 'A case''s employee cannot be cleared once set (case %).', old.id
        using errcode = 'check_violation';
    end if;
    if old.employee_id is not null and new.employee_id is distinct from old.employee_id then
      raise exception 'A case cannot be moved between employees (case %, employee % -> %). An identity correction is an explicit, audited operation, not an update.',
        old.id, old.employee_id, new.employee_id using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$$;

drop trigger if exists cases_employee_parentage_guard_trg on public.cases;
create trigger cases_employee_parentage_guard_trg
  before insert or update on public.cases
  for each row execute function public.cases_employee_parentage_guard();

-- ============================================================================
-- ROLLBACK (complete; no existing row, column, policy or trigger is modified)
-- ============================================================================
--   drop trigger if exists cases_employee_parentage_guard_trg on public.cases;
--   drop function if exists public.cases_employee_parentage_guard();
--   drop index if exists public.cases_org_employee_idx;
--   alter table public.cases drop column if exists employee_id;
-- ============================================================================
