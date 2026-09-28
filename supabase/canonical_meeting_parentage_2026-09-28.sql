-- ============================================================================
-- Phase E2 — CANONICAL MEETING PARENTAGE — 2026-09-28
-- ============================================================================
-- ADDITIVE. Three columns, four CHECKs, one composite FK, one index, one guard
-- function replaced, three policies replaced. No row is reconciled, no employee
-- is assigned, no case/activity/employment-event row is touched.
--
-- ┌─ WHAT THE AUDIT ESTABLISHED, AND WHY THE SHAPE IS WHAT IT IS ───────────┐
-- │ public.meetings holds ONLY standalone meetings. Its INSERT policy and its │
-- │ parentage guard both reject a meeting born with a case_id, so every       │
-- │ case-linked row got there by being LINKED afterwards.                     │
-- │                                                                          │
-- │ The 890 real formal meetings (Investigation 462, Disciplinary 231,        │
-- │ Informal/1-1 128, Disciplinary Appeal 68, Meeting 1) are jsonb entries    │
-- │ inside cases.meetings across 779 cases. They are NOT rows here, and they  │
-- │ already inherit case RLS because they are columns of the case row.        │
-- │                                                                          │
-- │ All 2,960 cases have employee_id IS NULL. So there is no canonical        │
-- │ employee anywhere to derive a meeting subject from — not on the case, and │
-- │ not in the jsonb (employeeSnapshot never carries an id). No deterministic │
-- │ backfill exists. None is attempted.                                      │
-- └──────────────────────────────────────────────────────────────────────────┘
--
-- ── THE DEFECT THIS CLOSES ─────────────────────────────────────────────────
--
-- meetings.employee_name means TWO different people. HomeMeetingScreen labels
-- the same input "Employee name" normally and "Witness name" when a case is
-- linked, and both land in employee_name. So a witness interview stores the
-- WITNESS as its employee identity.
--
-- That is why this migration does not simply add a nullable employee_id. An
-- employee_id populated from that field would parent every witness interview to
-- the witness's own Employee File — and DSAR, which today links standalone
-- meetings by employee_name precisely because "a standalone meeting has no case
-- to inherit the subject from", would return a witness interview as part of the
-- WITNESS's subject data.
--
-- PARENTAGE IS THEREFORE TYPED, NOT NULLABLE-AND-HOPEFUL:
--
--   subject_kind = 'employee'             -> employee_id REQUIRED. Employee File
--                                            owns this meeting.
--   subject_kind = 'process_witness'      -> employee_id MUST BE NULL. The
--                                            process owns it; witness identity
--                                            lives in `witness` and grants no
--                                            Employee File ownership.
--   subject_kind = 'legacy_unreconciled'  -> employee_id NULL. The two preserved
--                                            NEW-45 UAT rows only. Forbidden to
--                                            new writes by the INSERT policy.
--
-- OWNERSHIP != PARTICIPATION. An internal witness may be referenced by
-- witness->>'employeeId' so Compass knows who was interviewed, and that STILL
-- confers no ownership, because ownership is employee_id and a witness row's
-- employee_id is NULL by CHECK — not by convention, and not by a caller
-- remembering. An external witness needs no employee record at all.
--
-- The column DEFAULT is 'legacy_unreconciled', which the INSERT policy forbids.
-- So an insert that forgets to state its parentage FAILS CLOSED rather than
-- creating a loose meeting.
-- ============================================================================

-- ── 1. COLUMNS ─────────────────────────────────────────────────────────────

alter table public.meetings
  add column if not exists employee_id uuid,
  add column if not exists subject_kind text not null default 'legacy_unreconciled',
  add column if not exists witness jsonb;

comment on column public.meetings.employee_id is
  'Canonical SUBJECT employee — the Employee File that owns this meeting. NULL for process_witness and legacy_unreconciled rows. Never derived from a name.';
comment on column public.meetings.subject_kind is
  'Explicit parentage category: employee | process_witness | legacy_unreconciled. Makes a NULL employee_id legible instead of loose.';
comment on column public.meetings.witness is
  'Bounded witness identity for process_witness rows: {employeeId, name, external}. Participation, never ownership.';
comment on column public.meetings.employee_name is
  'HISTORICAL/DISPLAY SNAPSHOT ONLY. Not identity authority. Held two different meanings before E2 (subject, or witness when a case was linked).';

-- ── 2. SAME-ORG INTEGRITY, DECLARATIVELY ───────────────────────────────────
-- The house pattern from E1.5/E1.7: tenancy travels with identity, so a
-- cross-organisation employee parent is UNSTORABLE rather than merely refused by
-- application code. MATCH SIMPLE lets a NULL employee_id through, which is what
-- process_witness and legacy rows need.

alter table public.meetings
  drop constraint if exists meetings_employee_same_org_fkey;
alter table public.meetings
  add constraint meetings_employee_same_org_fkey
  foreign key (employee_id, org_id)
  references public.employee_records(id, org_id)
  on delete restrict;

-- ── 3. THE PARENTAGE SHAPE, AS CHECKS ──────────────────────────────────────

alter table public.meetings drop constraint if exists meetings_subject_kind_valid;
alter table public.meetings add constraint meetings_subject_kind_valid
  check (subject_kind in ('employee', 'process_witness', 'legacy_unreconciled'));

-- The invariant that makes "no loose meetings" structural.
alter table public.meetings drop constraint if exists meetings_parentage_shape;
alter table public.meetings add constraint meetings_parentage_shape
  check (
    (subject_kind = 'employee'            and employee_id is not null)
    or (subject_kind = 'process_witness'     and employee_id is null)
    or (subject_kind = 'legacy_unreconciled' and employee_id is null)
  );

-- A witness meeting must actually say who was interviewed, otherwise
-- 'process_witness' becomes a way to write an anonymous parentless meeting.
alter table public.meetings drop constraint if exists meetings_witness_identified;
alter table public.meetings add constraint meetings_witness_identified
  check (
    subject_kind <> 'process_witness'
    or (witness is not null and coalesce(btrim(witness->>'name'), '') <> '')
  );

-- Witness identity belongs ONLY on a witness meeting. This stops an
-- employee-owned meeting quietly carrying a second person's identity.
alter table public.meetings drop constraint if exists meetings_witness_only_on_witness_meeting;
alter table public.meetings add constraint meetings_witness_only_on_witness_meeting
  check (subject_kind = 'process_witness' or witness is null);

create index if not exists meetings_org_employee_canonical_idx
  on public.meetings (org_id, employee_id) where employee_id is not null;

-- ── 4. PARENTAGE GUARD ─────────────────────────────────────────────────────
-- Replaces the E4C function, preserving every existing rule verbatim and adding
-- canonical employee parentage. Re-stated in full because a partial replacement
-- of a guard is how a guard silently loses a clause.

create or replace function public.meetings_parentage_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  target_org uuid;
  case_employee uuid;
begin
  if tg_op = 'INSERT' then
    if new.case_id is not null then
      raise exception 'A meeting cannot be created already linked to a case (id %). Meetings born in a case belong in cases.meetings.', new.id
        using errcode = 'check_violation';
    end if;
    new.linked_at := null;
    new.linked_by := null;
    return new;
  end if;

  if new.id <> old.id then
    raise exception 'A meeting id cannot be changed (% -> %).', old.id, new.id using errcode = 'check_violation';
  end if;
  if new.org_id <> old.org_id then
    raise exception 'A meeting cannot move between organisations (meeting %).', old.id using errcode = 'check_violation';
  end if;
  if new.created_by <> old.created_by or new.created_at <> old.created_at then
    raise exception 'created_by/created_at are immutable (meeting %).', old.id using errcode = 'check_violation';
  end if;

  -- ── E2: canonical parentage immutability ────────────────────────────────
  --
  -- subject_kind is a CATEGORY, not a value: an employee-owned meeting can
  -- never become a witness meeting, because that would silently strip an
  -- Employee File of its history (or graft one on).
  if new.subject_kind is distinct from old.subject_kind then
    raise exception 'A meeting cannot change what kind of parentage it has (meeting %, % -> %).',
      old.id, old.subject_kind, new.subject_kind using errcode = 'check_violation';
  end if;

  -- The employee may only be corrected while the meeting has not yet begun.
  -- Once it is in progress, in review or finished, reparenting it would rewrite
  -- whose employment history a real conversation belongs to.
  if new.employee_id is distinct from old.employee_id
     and old.status <> 'scheduled' then
    raise exception 'This meeting has already begun and cannot be reparented to another employee (meeting %, status %).',
      old.id, old.status using errcode = 'check_violation';
  end if;

  if old.case_id is null and new.case_id is not null then
    select c.org_id, c.employee_id into target_org, case_employee
      from public.cases c where c.id = new.case_id;
    if target_org is null then
      raise exception 'Cannot link meeting % to a case that does not exist.', old.id using errcode = 'foreign_key_violation';
    end if;
    if target_org <> new.org_id then
      raise exception 'Cannot link meeting % (org %) to a case in a different organisation (org %).', old.id, new.org_id, target_org
        using errcode = 'check_violation';
    end if;
    -- ── E2: a SUBJECT meeting and its case must concern the same person.
    -- Dormant until cases carry canonical employees (all 2,960 are NULL today),
    -- correct the moment any one of them does. Deliberately NOT applied to
    -- process_witness, whose employee_id is NULL by CHECK — that is the witness
    -- exception, stated once, here, rather than left as a loophole.
    if new.subject_kind = 'employee'
       and new.employee_id is not null
       and case_employee is not null
       and case_employee <> new.employee_id then
      raise exception 'Cannot link meeting % about one employee to a case about a different employee.', old.id
        using errcode = 'check_violation';
    end if;
    new.linked_at := coalesce(new.linked_at, now());
    new.linked_by := coalesce(new.linked_by, auth.uid());

  elsif old.case_id is not null and new.case_id is null then
    raise exception 'A case-linked meeting cannot be returned to standalone (meeting %).', old.id using errcode = 'check_violation';

  elsif old.case_id is not null and new.case_id <> old.case_id then
    raise exception 'A meeting cannot be moved between cases (meeting %, case % -> %).', old.id, old.case_id, new.case_id
      using errcode = 'check_violation';

  elsif old.case_id is not null then
    if new.linked_at is distinct from old.linked_at or new.linked_by is distinct from old.linked_by then
      raise exception 'Link provenance is immutable once set (meeting %).', old.id using errcode = 'check_violation';
    end if;
  end if;

  new.updated_at := now();
  return new;
end;
$function$;

-- ── 5. ACCESS: EMPLOYEE-OWNED MEETINGS FOLLOW THE EMPLOYEE FILE ────────────
--
-- Before E2, a non-case meeting was visible to HR, its creator, or its chair,
-- and the employee was never consulted. So the creator kept access forever
-- regardless of whether they could still open that employee's file — authorship
-- as a permanent access path, the pattern E1.7A removed for employment events.
--
-- The employee boundary is now a MANDATORY UPPER BOUND (§23: must not exceed
-- Employee File access) and an authorised Location Manager is added to the
-- capability list (§24: follows canonical Employee File access). An Auditor gains
-- nothing it did not already have — widening read access to a new role was not
-- part of this decision.
create or replace function public.can_access_employee_owned_meeting(
  p_org_id uuid, p_created_by uuid, p_chair_user_id uuid, p_employee_id uuid
) returns boolean
language sql stable security definer
set search_path to 'public'
as $function$
  select
    -- Upper bound: never more than Employee File access.
    public.can_access_employee(p_org_id, public.effective_employee_location(p_employee_id))
    and (
      public.is_hr_in_org(p_org_id)
      or auth.uid() = p_created_by
      or auth.uid() = p_chair_user_id
      or public.is_location_manager_for(p_org_id, public.effective_employee_location(p_employee_id))
    );
$function$;

grant execute on function public.can_access_employee_owned_meeting(uuid, uuid, uuid, uuid) to authenticated;

-- ── 6. POLICIES ────────────────────────────────────────────────────────────
-- The two case-linked policies are DELIBERATELY UNTOUCHED: a case-linked meeting
-- already follows case access through an RLS-filtered EXISTS on cases, which is
-- the correct parent boundary and the one §23 asks for. Formal process
-- confidentiality is not weakened, because it is not touched.

drop policy if exists "Only standalone meetings may be created, by their own creator" on public.meetings;
create policy "Only standalone meetings may be created, by their own creator"
  on public.meetings for insert to authenticated
  with check (
    case_id is null
    and linked_at is null
    and linked_by is null
    and created_by = auth.uid()
    and org_id in (select public.my_org_ids())
    and meeting_type_id = any (array['informal', 'return', 'investigation'])
    -- ── E2: canonical parentage is required of every NEW meeting.
    -- 'legacy_unreconciled' is absent on purpose, and it is the column DEFAULT,
    -- so an insert that says nothing about parentage is REFUSED rather than
    -- becoming a loose meeting.
    and subject_kind in ('employee', 'process_witness')
    and (
      -- An employee-owned meeting must name a real employee the caller may
      -- actually open. Not a name, not a snapshot, not a title.
      (
        subject_kind = 'employee'
        and employee_id is not null
        and exists (
          select 1 from public.employee_records er
          where er.id = meetings.employee_id
        )
      )
      -- A witness interview owns no Employee File, so it carries no employee_id
      -- at all. Its subject is the process it will be linked to.
      or (subject_kind = 'process_witness' and employee_id is null)
    )
  );

drop policy if exists "Standalone meetings visible to HR, creator or chair" on public.meetings;
create policy "Non-case meetings visible through their own parentage"
  on public.meetings for select to authenticated
  using (
    case_id is null
    and (
      case subject_kind
        -- Employee-owned: bounded by Employee File access.
        when 'employee' then
          public.can_access_employee_owned_meeting(org_id, created_by, chair_user_id, employee_id)
        -- A witness interview not yet linked to its case has no parent to
        -- inherit from, so it stays with the person conducting it until it is
        -- linked. It must never fall back to an employee boundary, because the
        -- only employee identity it holds is the witness's.
        when 'process_witness' then
          public.can_access_standalone_meeting(org_id, created_by, chair_user_id)
        -- Preserved legacy rows: unchanged pre-E2 rule, so nothing that could
        -- read them yesterday is broken today, and nothing new can be created
        -- under it.
        else
          public.can_access_standalone_meeting(org_id, created_by, chair_user_id)
      end
    )
  );

drop policy if exists "Standalone meetings writable by HR, creator or chair" on public.meetings;
create policy "Non-case meetings writable through their own parentage"
  on public.meetings for update to authenticated
  using (
    case_id is null
    and (
      case subject_kind
        when 'employee' then public.can_access_employee_owned_meeting(org_id, created_by, chair_user_id, employee_id)
        else public.can_access_standalone_meeting(org_id, created_by, chair_user_id)
      end
    )
  )
  with check (
    (
      case subject_kind
        when 'employee' then public.can_access_employee_owned_meeting(org_id, created_by, chair_user_id, employee_id)
        else public.can_access_standalone_meeting(org_id, created_by, chair_user_id)
      end
    )
    -- Linking to a case remains permitted (this is how "save to case" works),
    -- and the target case must exist and be visible to the caller.
    and (
      case_id is null
      or exists (
        select 1 from public.cases c
        where c.id = meetings.case_id and c.org_id = meetings.org_id
      )
    )
  );

-- ============================================================================
-- WHAT THIS MIGRATION DOES NOT DO
-- ============================================================================
-- * No employee_id is backfilled. It cannot be: no case carries a canonical
--   employee, and no jsonb meeting or employeeSnapshot carries an id. Both
--   preserved UAT rows have employee_name = 'UAT - Standalone Meeting', which is
--   a placeholder and not a person.
-- * The 890 jsonb meetings inside cases.meetings are not migrated to rows. They
--   already inherit case authority. Canonicalising them REQUIRES cases.employee_id
--   to be reconciled first (E0.5B built that tool; it has never been run), and
--   doing it by name is the one thing this programme exists to stop.
-- * meeting_type_id is NOT extended. "1:1" is already representable as
--   'informal' — the jsonb type label is literally "Informal / 1-1" — so no new
--   type is invented, and no organisation-level meeting type is encoded before
--   those process domains exist (AD-001).
-- * cases, employee_activities, employee_employment_events, leaver_instances and
--   the dirty scheduling UAT state are untouched.
--
-- ============================================================================
-- ROLLBACK (complete) — restores the pre-E2 policies, guard and shape.
-- ============================================================================
--   drop policy if exists "Non-case meetings visible through their own parentage" on public.meetings;
--   create policy "Standalone meetings visible to HR, creator or chair" on public.meetings for select to authenticated
--     using ((case_id is null) and can_access_standalone_meeting(org_id, created_by, chair_user_id));
--   drop policy if exists "Non-case meetings writable through their own parentage" on public.meetings;
--   create policy "Standalone meetings writable by HR, creator or chair" on public.meetings for update to authenticated
--     using ((case_id is null) and can_access_standalone_meeting(org_id, created_by, chair_user_id))
--     with check (can_access_standalone_meeting(org_id, created_by, chair_user_id)
--       and ((case_id is null) or exists (select 1 from public.cases c where c.id = meetings.case_id and c.org_id = meetings.org_id)));
--   drop policy if exists "Only standalone meetings may be created, by their own creator" on public.meetings;
--   create policy "Only standalone meetings may be created, by their own creator" on public.meetings for insert to authenticated
--     with check ((case_id is null) and (linked_at is null) and (linked_by is null) and (created_by = auth.uid())
--       and (org_id in (select my_org_ids())) and (meeting_type_id = any (array['informal','return','investigation'])));
--   drop function if exists public.can_access_employee_owned_meeting(uuid, uuid, uuid, uuid);
--   alter table public.meetings
--     drop constraint if exists meetings_employee_same_org_fkey,
--     drop constraint if exists meetings_subject_kind_valid,
--     drop constraint if exists meetings_parentage_shape,
--     drop constraint if exists meetings_witness_identified,
--     drop constraint if exists meetings_witness_only_on_witness_meeting;
--   drop index if exists public.meetings_org_employee_canonical_idx;
--   alter table public.meetings drop column if exists employee_id,
--     drop column if exists subject_kind, drop column if exists witness;
--   -- and restore the E4C meetings_parentage_guard() body (see
--   -- supabase/ history for the pre-E2 definition).
-- ============================================================================
