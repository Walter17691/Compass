-- ============================================================================
-- Phase E1.5 — EMPLOYEE LOCATION FOUNDATION + SCOPED LOCATION MANAGER ACCESS
-- 2026-09-27
-- ============================================================================
-- Establishes the canonical employee -> location relationship and makes
-- employee_records RLS the authoritative enforcement boundary for it.
--
-- ┌─ WHAT THIS CHANGES ─────────────────────────────────────────────────────┐
-- │ ADDS  employee_records.location_id, NULL-able, same-organisation         │
-- │       enforced declaratively by a COMPOSITE foreign key.                 │
-- │ ADDS  can_access_employee() — fail-closed, and deliberately NOT a copy    │
-- │       of can_access_case_location() (see §2 for why that would be a       │
-- │       security regression).                                              │
-- │ ADDS  scoped INSERT/UPDATE for location_manager, which previously could   │
-- │       not write employees at all.                                        │
-- │ ADDS  a column guard so a Location Manager cannot move an employee into   │
-- │       or out of their own permission scope through a generic edit.        │
-- │ ADDS  audit_log.employee_id, so an employee-level change has real         │
-- │       parentage instead of a uuid buried in free text.                    │
-- │ ADDS  set_employee_location() — HR-only, optimistic, audited.             │
-- │                                                                          │
-- │ NARROWS employee_records SELECT for exactly ONE role: location_manager.   │
-- │       Every other role keeps the org-wide scope it has today.             │
-- │                                                                          │
-- │ DOES NOT backfill location_id from the free-text `location` column, drop  │
-- │       that column, touch employee names, or relax UNIQUE(org_id, name).   │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- Expected state immediately after this migration: every one of the 2,685
-- existing employee_records rows has location_id = NULL. That is the correct
-- and approved outcome. 19 of those rows carry free text, and in Compass LTD
-- all 5 of them happen to match a canonical location name exactly — which is
-- precisely the coincidence that must NOT be acted on automatically. A human
-- confirms each canonical UUID. This is reconciliation, not inference.
-- ============================================================================


-- ── 1. Canonical relationship ───────────────────────────────────────────────
--
-- Same-organisation integrity is enforced by a COMPOSITE foreign key rather
-- than a trigger. (location_id, org_id) must reference an existing
-- (locations.id, locations.org_id) pair, so an employee in organisation A
-- cannot be attached to a location in organisation B — the database refuses it
-- without any application code being involved, and without a trigger that a
-- future `alter table ... disable trigger` could switch off.
--
-- This is the smallest robust mechanism available here:
--   * MATCH SIMPLE semantics mean a NULL location_id satisfies the constraint
--     regardless of org_id, so "unassigned" stays legal.
--   * employee_records.org_id is NOT NULL, so whenever location_id IS NOT NULL
--     both columns are present and the check genuinely applies.
--   * locations.org_id is NULL-able. A location with no organisation therefore
--     matches no (id, org_id) pair any employee can present, so it is
--     unreferenceable — fail-safe, and there are none in production today.
--
-- ON DELETE RESTRICT is deliberate. ON DELETE SET NULL would silently
-- reclassify every employee at a deleted location into the HR-only unassigned
-- pool, which is exactly the "customer data silently reclassified" outcome this
-- phase forbids. Blocking the delete is the fail-safe direction.
alter table public.locations
  add constraint locations_id_org_key unique (id, org_id);

alter table public.employee_records
  add column if not exists location_id uuid;

alter table public.employee_records
  add constraint employee_records_location_same_org_fkey
  foreign key (location_id, org_id)
  references public.locations (id, org_id)
  on delete restrict;

-- Supports both the RLS predicate and the "unassigned employees" HR view.
create index if not exists employee_records_org_location_idx
  on public.employee_records (org_id, location_id);

comment on column public.employee_records.location_id is
  'Phase E1.5. Canonical current location. NULL means unassigned, which is HR/organisation-wide scope only — a Location Manager never reaches an unassigned employee. Same-organisation integrity is enforced by the composite FK to locations(id, org_id). The legacy free-text `location` column is NOT authoritative and never determines permission.';


-- ── 2. The authoritative employee-access primitive ──────────────────────────
--
-- can_access_case_location() was audited before writing this and deliberately
-- NOT copied. Its first clause is
--
--     SELECT NOT EXISTS (location_manager with a non-empty location_ids)
--
-- which means a location_manager whose location_ids is empty or NULL sees
-- EVERY location. org_members.location_ids defaults to '{}', so that fail-OPEN
-- case is the default state of a freshly-created row. Reusing that shape for
-- employees would grant organisation-wide employee access to a Location Manager
-- with no locations assigned — the precise outcome locked decision 8 forbids.
--
-- This helper fails closed instead: no location, no access.
--
--   * An organisation-wide role (hr_director, hr_manager, line_manager,
--     investigator, legal_reviewer, auditor) keeps exactly the scope it has
--     today: its own organisation. This phase narrows one role, not seven.
--   * A location_manager reaches an employee only where that employee's
--     canonical location is in their authorised list.
--   * location_id IS NULL is refused for a location_manager explicitly, by
--     testing `is not null` first, rather than relying on `NULL = ANY(...)`
--     evaluating to NULL and being coerced to false somewhere downstream.
--   * Cross-organisation is denied because membership of p_org_id is required.
--   * A platform admin with no org_members row has no membership to find, so is
--     denied structurally — platform_admins is not connected to org_members.
--   * The location is additionally confirmed to belong to p_org_id, so the
--     helper stays correct even if a caller passes a mismatched pair. The
--     composite FK already makes that impossible for a real employee row; this
--     is defence in depth for any future caller.
--
-- There is no free-text fallback and no name fallback anywhere in this function.
create or replace function public.can_access_employee(p_org_id uuid, p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1
    from public.org_members om
    where om.org_id = p_org_id
      and om.user_id = auth.uid()
      and (
        om.role is distinct from 'location_manager'
        or (
          p_location_id is not null
          and om.location_ids is not null
          and p_location_id = any (om.location_ids)
          and exists (
            select 1 from public.locations l
            where l.id = p_location_id and l.org_id = p_org_id
          )
        )
      )
  );
$$;

comment on function public.can_access_employee(uuid, uuid) is
  'Phase E1.5. Authoritative employee-access predicate. Organisation-wide roles: own organisation. location_manager: only employees whose canonical location is in their authorised list, never an unassigned employee. Fails CLOSED where can_access_case_location() fails open for a location_manager with an empty location list. No free-text and no name fallback.';

-- The write-side predicate is separate and names the role explicitly.
--
-- can_access_employee() must NOT be reused for INSERT/UPDATE: it returns true
-- for every organisation-wide role, and line_manager / investigator /
-- legal_reviewer / auditor cannot write employee_records today. Reusing it
-- would hand four roles a brand-new privilege as a side effect of scoping one.
create or replace function public.is_location_manager_for(p_org_id uuid, p_location_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select p_location_id is not null
     and exists (
       select 1
       from public.org_members om
       where om.org_id = p_org_id
         and om.user_id = auth.uid()
         and om.role = 'location_manager'
         and om.location_ids is not null
         and p_location_id = any (om.location_ids)
     )
     and exists (
       select 1 from public.locations l
       where l.id = p_location_id and l.org_id = p_org_id
     );
$$;

comment on function public.is_location_manager_for(uuid, uuid) is
  'Phase E1.5. True only when the caller is a location_manager of p_org_id authorised for p_location_id, and that location belongs to p_org_id. Used for the scoped write policies. Never true for a NULL location, so a Location Manager cannot create an unassigned employee.';

-- Reads the caller's role in one organisation. Extracted so the policies below
-- state "is the caller HR here" once rather than repeating the same correlated
-- subquery the existing policies inline four times.
create or replace function public.is_hr_in_org(p_org_id uuid)
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $$
  select exists (
    select 1 from public.org_members om
    where om.org_id = p_org_id
      and om.user_id = auth.uid()
      and public.is_hr_role(om.role)
  );
$$;


-- ── 3. RLS — the authoritative boundary ─────────────────────────────────────
--
-- Explicit per-command policies. Nothing here relies on UI filtering, and
-- nothing is filtered client-side: an unauthorised employee row is not returned
-- by the database at all, so it cannot leak a name, employment detail, or even
-- the fact that the employee exists.

-- SELECT. Was: org_id in my_org_ids() — every member of an organisation could
-- read every employee in it, location_manager included.
drop policy if exists employee_records_select_same_org on public.employee_records;

create policy employee_records_select_scoped
  on public.employee_records for select
  to authenticated
  using (
    org_id in (select public.my_org_ids())
    and public.can_access_employee(org_id, location_id)
  );

-- INSERT. HR keeps its existing behaviour, including deliberately creating an
-- unassigned employee. A location_manager gains scoped creation: location_id is
-- mandatory and must be one of theirs, so they cannot create an unassigned
-- employee, cannot create into another manager's location, and cannot create
-- into another organisation. org_id is still constrained to their own
-- organisations, so a submitted org_id cannot widen anything.
drop policy if exists employee_records_write_hr_only on public.employee_records;

create policy employee_records_insert_scoped
  on public.employee_records for insert
  to authenticated
  with check (
    org_id in (select public.my_org_ids())
    and (
      public.is_hr_in_org(org_id)
      or public.is_location_manager_for(org_id, location_id)
    )
  );

-- UPDATE. HR keeps its existing behaviour. A location_manager may edit an
-- employee inside their scope — but see §4: they cannot change location_id
-- itself. Both USING and WITH CHECK are constrained, so an update cannot move a
-- row to an organisation or location the caller could not already reach.
drop policy if exists employee_records_update_hr_only on public.employee_records;

create policy employee_records_update_scoped
  on public.employee_records for update
  to authenticated
  using (
    org_id in (select public.my_org_ids())
    and (
      public.is_hr_in_org(org_id)
      or public.is_location_manager_for(org_id, location_id)
    )
  )
  with check (
    org_id in (select public.my_org_ids())
    and (
      public.is_hr_in_org(org_id)
      or public.is_location_manager_for(org_id, location_id)
    )
  );

-- DELETE. Unchanged, HR only. Location Manager delete rights are not broadened.
-- Restated verbatim rather than left alone only so this file is a complete
-- description of the table's policy set.
drop policy if exists employee_records_delete_hr_only on public.employee_records;

create policy employee_records_delete_hr_only
  on public.employee_records for delete
  to authenticated
  using (
    org_id in (select public.my_org_ids())
    and public.is_hr_in_org(org_id)
  );


-- ── 4. Canonical location is not an ordinary editable field ─────────────────
--
-- RLS cannot express "this column specifically may not change": a WITH CHECK
-- expression sees the new row only, never the old one, so it cannot tell an
-- edit of job_title from an edit of location_id. Column-level GRANTs cannot
-- express it either, because every application user authenticates as the same
-- `authenticated` role.
--
-- So a guard trigger, following protect_case_hr_only_columns()'s existing
-- idiom. The rule it enforces is the bounded one E1.5 committed to: changing an
-- employee's canonical location has security consequences, because it moves
-- that employee into or out of a Location Manager's permission scope. A Location
-- Manager must therefore not be able to do it through a generic edit — not even
-- for an employee they are otherwise fully authorised to manage. Reassignment is
-- HR-controlled in E1.5; E1.7's employment events can implement a deliberate
-- scoped workflow later.
--
-- INSERT is not guarded: a Location Manager creating an employee must set
-- location_id, and the INSERT policy already confines it to their own scope.
create or replace function public.protect_employee_location_column()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.location_id is distinct from old.location_id then
    if auth.role() <> 'service_role' and not public.is_hr_in_org(old.org_id) then
      raise exception 'Only HR can change an employee''s canonical location. Changing it moves the employee between permission scopes, so it is an explicit HR action rather than an ordinary edit.'
        using errcode = '42501';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists employee_records_protect_location on public.employee_records;
create trigger employee_records_protect_location
  before update on public.employee_records
  for each row execute function public.protect_employee_location_column();


-- ── 5. Auditing an employee-level change ───────────────────────────────────
--
-- audit_log could already HOLD this information in `detail` — that is what
-- 'Employee identity corrected' does today. What it could not do is carry
-- employee PARENTAGE: that row hangs off case_id, and a location change has no
-- case. Writing one with case_id NULL would leave the employee reachable only by
-- text-searching a uuid out of a sentence.
--
-- The minimum additive solution is one nullable column mirroring case_id
-- exactly, including ON DELETE SET NULL so deleting an employee cannot delete
-- the audit history of what was done to them. This is NOT a polymorphic audit
-- redesign, and E1.6's activity linkage is not built here.
alter table public.audit_log
  add column if not exists employee_id uuid;

alter table public.audit_log
  add constraint audit_log_employee_id_fkey
  foreign key (employee_id) references public.employee_records(id) on delete set null;

create index if not exists audit_log_employee_id_created_at_idx
  on public.audit_log (employee_id, created_at desc)
  where employee_id is not null;

comment on column public.audit_log.employee_id is
  'Phase E1.5. Employee-level audit parentage, mirroring case_id (nullable, ON DELETE SET NULL). Lets an employee-scoped change be recorded without borrowing a case_id as fake parentage.';

-- The existing SELECT policy already covers this shape: a row with case_id NULL
-- is visible to its own actor, or to HR in that organisation. An employee
-- location change is an HR action, so HR visibility is correct and no policy
-- change is required. Restated here because relying on it silently would be
-- worse than saying so.


-- ── 6. The authoritative location-assignment operation ─────────────────────
--
-- A plain UPDATE cannot do this job: audit_log has no INSERT policy at all, so
-- the client cannot write the audit row, and an assignment whose audit trail
-- might be missing is not acceptable for a permission-bearing field. This
-- function writes both in one transaction.
--
-- Optimistic concurrency is enforced here rather than client-side, because the
-- write happens inside the function. p_expected_updated_at is the updated_at the
-- caller last saw; if the row has moved since, the assignment is refused with
-- errcode PT409 — the same signal correct_case_employee() already uses for a
-- lost race — so HR user A cannot silently overwrite HR user B's change.
--
-- p_location_id may be NULL: HR must be able to undo a mistaken assignment, and
-- returning an employee to unassigned NARROWS access rather than widening it.
-- It is recorded as its own action so it is never mistaken for an assignment.
create or replace function public.set_employee_location(
  p_employee_id uuid,
  p_location_id uuid,
  p_expected_updated_at timestamptz
)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_emp record;
  v_member record;
  v_old_name text;
  v_new_name text;
  v_action text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_emp from public.employee_records where id = p_employee_id;
  if v_emp.id is null then
    -- Deliberately indistinguishable from "not authorised": a caller must not
    -- learn that an employee exists in an organisation they cannot see.
    raise exception 'Employee record not found' using errcode = '42501';
  end if;

  select * into v_member from public.org_members
    where org_id = v_emp.org_id and user_id = auth.uid();
  if v_member.id is null or not public.is_hr_role(v_member.role) then
    raise exception 'Only HR can assign an employee''s canonical location'
      using errcode = '42501';
  end if;

  -- Same-organisation integrity. The composite FK would catch this too; failing
  -- here first produces an explanation instead of a constraint-violation string.
  if p_location_id is not null then
    if not exists (
      select 1 from public.locations l
      where l.id = p_location_id and l.org_id = v_emp.org_id
    ) then
      raise exception 'That location does not belong to this employee''s organisation'
        using errcode = '42501';
    end if;
  end if;

  if v_emp.location_id is not distinct from p_location_id then
    raise exception 'This employee is already assigned to that location'
      using errcode = 'check_violation';
  end if;

  select name into v_old_name from public.locations where id = v_emp.location_id;
  select name into v_new_name from public.locations where id = p_location_id;

  update public.employee_records
     set location_id = p_location_id,
         updated_at  = now()
   where id = p_employee_id
     and (p_expected_updated_at is null or updated_at = p_expected_updated_at);
  if not found then
    raise exception 'This employee record changed while you were assigning a location. Refresh and try again.'
      using errcode = 'PT409';
  end if;

  v_action := case
                when p_location_id is null then 'Employee location cleared'
                when v_emp.location_id is null then 'Employee location assigned'
                else 'Employee location changed'
              end;

  -- Old AND new, by UUID and by name. The UUID is the authority; the names make
  -- the trail readable later, and survive a location being renamed or removed.
  insert into public.audit_log (org_id, user_id, user_name, action, detail, employee_id)
  values (
    v_emp.org_id,
    auth.uid(),
    coalesce(v_member.name, 'Unknown'),
    v_action,
    format('employee %s (%L); location %s (%L) -> %s (%L); legacy free text %L',
           v_emp.id, coalesce(v_emp.name, '(unnamed)'),
           coalesce(v_emp.location_id::text, 'none'), coalesce(v_old_name, '(none)'),
           coalesce(p_location_id::text, 'none'), coalesce(v_new_name, '(none)'),
           coalesce(v_emp.location, '(none)')),
    v_emp.id
  );
end;
$$;

grant execute on function public.set_employee_location(uuid, uuid, timestamptz) to authenticated;
revoke all on function public.set_employee_location(uuid, uuid, timestamptz) from anon, public;

comment on function public.set_employee_location(uuid, uuid, timestamptz) is
  'Phase E1.5. Sets an employee''s canonical location. HR only, same-organisation enforced, optimistic on updated_at (PT409 on a lost race), audited old -> new with employee parentage in the same transaction. Never infers a location from the legacy free-text column.';


-- ── 7. Make the new audit actions unforgeable ──────────────────────────────
-- Same treatment as the existing reserved actions: the generic audit RPC must
-- not be able to claim a location change happened.
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
    'Employee identity corrected',
    -- Phase E1.5
    'Employee location assigned',
    'Employee location changed',
    'Employee location cleared'
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
--   drop trigger if exists employee_records_protect_location on public.employee_records;
--   drop function if exists public.protect_employee_location_column();
--   drop function if exists public.set_employee_location(uuid, uuid, timestamptz);
--
--   drop policy if exists employee_records_select_scoped on public.employee_records;
--   drop policy if exists employee_records_insert_scoped on public.employee_records;
--   drop policy if exists employee_records_update_scoped on public.employee_records;
--   create policy employee_records_select_same_org on public.employee_records
--     for select using (org_id in (select public.my_org_ids()));
--   -- then re-create employee_records_write_hr_only / _update_hr_only exactly as
--   -- they were (org membership AND is_hr_role(role) via the inline subquery).
--
--   drop function if exists public.can_access_employee(uuid, uuid);
--   drop function if exists public.is_location_manager_for(uuid, uuid);
--   drop function if exists public.is_hr_in_org(uuid);
--
--   alter table public.audit_log drop constraint if exists audit_log_employee_id_fkey;
--   drop index if exists audit_log_employee_id_created_at_idx;
--   alter table public.audit_log drop column if exists employee_id;
--
--   drop index if exists employee_records_org_location_idx;
--   alter table public.employee_records drop constraint if exists employee_records_location_same_org_fkey;
--   alter table public.employee_records drop column if exists location_id;
--   alter table public.locations drop constraint if exists locations_id_org_key;
--
--   -- and re-create log_audit_event without the three Phase E1.5 reserved actions.
-- ============================================================================
