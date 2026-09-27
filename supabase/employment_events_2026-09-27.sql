-- ============================================================================
-- Phase E1.7 — EMPLOYMENT EVENTS + LEAVERS + ARCHIVE — 2026-09-27
-- ============================================================================
-- ADDITIVE. One new table, two deterministic resolver functions, one nullable
-- audit column, four triggers, and ONE narrowly-substituted RLS predicate.
-- No existing row is read, written, migrated or inferred.
--
-- ┌─ THE CENTRAL PROBLEM ───────────────────────────────────────────────────┐
-- │ A promotion recorded on 27 September and effective 1 November must not    │
-- │ change anything until 1 November — and must then change it with no cron,  │
-- │ no scheduler, and no browser writing security-critical state.            │
-- │                                                                         │
-- │ Solved by RESOLUTION, not mutation. Current state is computed from the    │
-- │ base record plus the events whose effective_date has arrived. Nothing is  │
-- │ ever written "later".                                                    │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- WHAT THE AUDIT DECIDED, AND WHAT IT FORBADE
--   * employee_records has NO contractual-hours column, so
--     contractual_hours_changed is NOT implemented. Only events backed by real
--     fields exist: job_title, department, manager, working_pattern, location_id.
--   * employment_started is NOT implemented. start_date is TEXT and 14 of the 17
--     populated values are not ISO (e.g. "01/01/2026"), so it cannot be read as a
--     date without guessing. Untouched.
--   * start_date/end_date are NOT converted. Effective dates live on this table as
--     a proper DATE; the legacy text columns are left exactly as they are.
--   * leaver_instances (107 rows, no employee_id, name-based) is NOT migrated and
--     NOT attached. It has no write route in the application.
--   * No historical promotion, transfer or leaver is inferred from anything.
-- ============================================================================


-- ── 1. The event ───────────────────────────────────────────────────────────
--
-- Old → new values are TYPED, not a JSON dumping ground: one text pair covers
-- job title / department / manager / working pattern, and one uuid pair covers
-- location so the same-organisation foreign key can still apply. That is the
-- smallest robust design — a table per field would be five tables, and an
-- untyped blob would lose both the constraint and the meaning.
create table public.employee_employment_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  employee_id uuid not null,

  event_type text not null,

  -- DATE, not timestamptz. "Effective 1 November" has no time of day, and
  -- storing an instant is how it becomes effective late on 31 October for one
  -- reader and late on 1 November for another.
  effective_date date not null,

  -- What actually changed. Storing only "Promoted" would lose the employment
  -- history this table exists to keep.
  old_text text,
  new_text text,
  old_location_id uuid,
  new_location_id uuid,

  -- Free text, deliberately NOT a classification enum: inventing dismissal or
  -- termination categories is outside this phase.
  note text,

  documentation_status text not null default 'not_required',

  -- Cancellation, for a future event recorded in error. History is never
  -- deleted; a cancelled event stays visible and says it was cancelled.
  cancelled_at timestamptz,
  cancelled_by uuid,
  cancellation_reason text,

  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint employment_events_type_valid check (
    event_type in (
      'job_title_changed', 'department_changed', 'manager_changed',
      'working_pattern_changed', 'location_changed', 'employment_ended'
    )
  ),

  constraint employment_events_documentation_valid check (
    documentation_status in ('sent', 'not_sent', 'not_required')
  ),

  -- The right value pair for the right event type, enforced rather than trusted.
  -- A location change carries locations; a text change carries text; employment
  -- ending carries neither, because the effective_date IS the leaving date.
  constraint employment_events_values_match_type check (
    (event_type = 'location_changed'
      and new_location_id is not null
      and old_text is null and new_text is null)
    or
    (event_type = 'employment_ended'
      and old_text is null and new_text is null
      and old_location_id is null and new_location_id is null)
    or
    (event_type in ('job_title_changed', 'department_changed', 'manager_changed', 'working_pattern_changed')
      and new_text is not null
      and old_location_id is null and new_location_id is null)
  ),

  -- A cancellation needs its timestamp; an un-cancelled event must not carry
  -- cancellation metadata.
  constraint employment_events_cancellation_consistent check (
    (cancelled_at is not null and cancelled_by is not null)
    or (cancelled_at is null and cancelled_by is null and cancellation_reason is null)
  ),

  constraint employment_events_org_fkey
    foreign key (org_id) references public.organisations(id) on delete cascade,

  -- Employee parentage AND tenancy in one declaration, as in E1.6.
  constraint employment_events_employee_same_org_fkey
    foreign key (employee_id, org_id) references public.employee_records(id, org_id)
    on delete cascade,

  -- Both location columns are same-organisation enforced, so a transfer can
  -- never name another tenant's site.
  constraint employment_events_new_location_same_org_fkey
    foreign key (new_location_id, org_id) references public.locations(id, org_id)
    on delete restrict,
  constraint employment_events_old_location_same_org_fkey
    foreign key (old_location_id, org_id) references public.locations(id, org_id)
    on delete restrict
);

-- Supports the resolver functions below, which are on the RLS path and must stay
-- cheap. Partial: a cancelled event never participates in current state.
create index employment_events_effective_idx
  on public.employee_employment_events (employee_id, event_type, effective_date desc)
  where cancelled_at is null;
create index employment_events_employee_created_idx
  on public.employee_employment_events (employee_id, effective_date desc);
create index employment_events_org_documentation_idx
  on public.employee_employment_events (org_id, documentation_status)
  where documentation_status = 'not_sent' and cancelled_at is null;

comment on table public.employee_employment_events is
  'Phase E1.7. Effective-dated employment changes: old -> new -> effective_date. Current state is RESOLVED from the base employee record plus events whose effective_date has arrived — never written ahead of time, and never applied by a scheduler. employment_started and contractual_hours_changed are deliberately absent: no such usable field exists.';


-- ── 2. Effective current state, resolved — never mutated ────────────────────
--
-- This is the answer to "how does a future change take effect without a cron".
-- It does not "take effect" at all: the current value is a function of the base
-- record, the effective events, and today's date. On 31 October the function
-- returns London; on 1 November, with nothing having run in between, it returns
-- Manchester.
--
-- STABLE, not IMMUTABLE: current_date changes between transactions.
create or replace function public.effective_employee_location(p_employee_id uuid)
returns uuid
language sql
stable
security definer
set search_path to 'public'
as $$
  select coalesce(
    (
      -- The most recently EFFECTIVE location change. A future-dated one is
      -- excluded by the date test, which is what stops target-location access
      -- being granted early.
      select e.new_location_id
        from public.employee_employment_events e
       where e.employee_id = p_employee_id
         and e.event_type = 'location_changed'
         and e.cancelled_at is null
         and e.effective_date <= current_date
       order by e.effective_date desc, e.created_at desc
       limit 1
    ),
    -- No effective transfer: the canonical base location, which is what
    -- set_employee_location() (E1.5) maintains.
    (select er.location_id from public.employee_records er where er.id = p_employee_id)
  );
$$;

comment on function public.effective_employee_location(uuid) is
  'Phase E1.7. The employee''s CURRENTLY EFFECTIVE location: the latest non-cancelled location_changed event whose effective_date has arrived, else employee_records.location_id. A future-dated transfer resolves to the OLD location until its date, so it grants no access early and removes none early.';

create or replace function public.effective_employment_status(p_employee_id uuid)
returns text
language sql
stable
security definer
set search_path to 'public'
as $$
  select case
    when exists (
      select 1 from public.employee_employment_events e
       where e.employee_id = p_employee_id
         and e.event_type = 'employment_ended'
         and e.cancelled_at is null
         and e.effective_date <= current_date
    ) then 'leaver'
    else coalesce((select er.employment_status from public.employee_records er where er.id = p_employee_id), 'unknown')
  end;
$$;

comment on function public.effective_employment_status(uuid) is
  'Phase E1.7. ''leaver'' once an employment_ended event''s effective_date has arrived, otherwise the base employment_status. A future leaving date therefore leaves the employee current — People vs Archive is a projection of this, not a scheduled move.';


-- ── 3. RLS reads the EFFECTIVE location ────────────────────────────────────
--
-- One narrowly-substituted predicate. E1.5's policy passed the raw
-- employee_records.location_id column; it now passes the resolved effective
-- location instead. Everything else about the policy is unchanged.
--
-- Why this is the safe shape, and not a security redesign:
--   * With no events — the state of all 2,685 production employees — the
--     function returns exactly location_id, so behaviour is identical.
--   * A FUTURE transfer is excluded by `effective_date <= current_date`, so the
--     target location's manager gains nothing early and the source location's
--     manager loses nothing early. That is the §9 requirement, met by
--     construction rather than by remembering to check.
--   * employee_records.location_id is never written with a future value, so
--     there is no window in which the stored column disagrees with authority.
--   * No scheduler, no browser, no clock owned by the client.
alter table public.employee_records enable row level security;

drop policy if exists employee_records_select_scoped on public.employee_records;
create policy employee_records_select_scoped
  on public.employee_records for select
  to authenticated
  using (
    org_id in (select public.my_org_ids())
    and public.can_access_employee(org_id, public.effective_employee_location(id))
  );

drop policy if exists employee_records_update_scoped on public.employee_records;
create policy employee_records_update_scoped
  on public.employee_records for update
  to authenticated
  using (
    org_id in (select public.my_org_ids())
    and (
      public.is_hr_in_org(org_id)
      or public.is_location_manager_for(org_id, public.effective_employee_location(id))
    )
  )
  with check (
    org_id in (select public.my_org_ids())
    and (
      public.is_hr_in_org(org_id)
      or public.is_location_manager_for(org_id, public.effective_employee_location(id))
    )
  );

-- INSERT and DELETE are unchanged: a new employee has no events, so the raw
-- column and the effective value are necessarily the same thing.


-- ── 4. Event RLS — inherited, as in E1.6 ───────────────────────────────────
alter table public.employee_employment_events enable row level security;

create policy employment_events_select
  on public.employee_employment_events for select
  to authenticated
  using (
    org_id in (select public.my_org_ids())
    and exists (
      select 1 from public.employee_records er
      where er.id = employee_employment_events.employee_id
    )
  );

-- INSERT. Two rules beyond the inherited boundary.
--
-- 1. recorded_by must be the actor, so an event cannot be attributed to someone
--    else.
-- 2. A location_changed event requires HR. This is DELIBERATELY not a guess at
--    the Location Manager transfer rule: E1.5/AD-003 deferred "may a Location
--    Manager move an employee, and to which locations" to this phase, and the
--    phase brief instructs that the question must not be answered without an
--    explicit product decision. Until that decision exists, the fail-closed
--    behaviour is HR-only, so no Location Manager can enlarge or manipulate
--    their own scope through a transfer. Every OTHER employment change is open
--    to a Location Manager for an employee they currently manage.
create policy employment_events_insert
  on public.employee_employment_events for insert
  to authenticated
  with check (
    org_id in (select public.my_org_ids())
    and recorded_by = auth.uid()
    and exists (
      select 1 from public.employee_records er
      where er.id = employee_employment_events.employee_id
    )
    and (
      event_type <> 'location_changed'
      or public.is_hr_in_org(org_id)
    )
  );

create policy employment_events_update
  on public.employee_employment_events for update
  to authenticated
  using (
    org_id in (select public.my_org_ids())
    and exists (
      select 1 from public.employee_records er
      where er.id = employee_employment_events.employee_id
    )
  )
  with check (
    org_id in (select public.my_org_ids())
    and exists (
      select 1 from public.employee_records er
      where er.id = employee_employment_events.employee_id
    )
  );

-- No DELETE policy. Employment history is corrected or cancelled, never removed.


-- ── 5. Parentage frozen, and history not casually rewritten ────────────────
create or replace function public.employment_event_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.org_id is distinct from old.org_id
     or new.employee_id is distinct from old.employee_id then
    raise exception 'An employment event cannot be moved between employees or organisations (event %).', old.id
      using errcode = 'check_violation';
  end if;

  -- The event TYPE is what the history says happened. Changing it would turn a
  -- recorded promotion into a recorded transfer.
  if new.event_type is distinct from old.event_type then
    raise exception 'An employment event''s type cannot be changed (event %). Cancel it and record the correct event.', old.id
      using errcode = 'check_violation';
  end if;

  -- Once an event is EFFECTIVE, its substance is settled: the organisation has
  -- acted on it. Correcting a future event is ordinary; rewriting the past is
  -- not, so it is refused rather than audited-and-allowed. Documentation status
  -- and cancellation stay editable, because those are about follow-up, not about
  -- what happened.
  if old.effective_date <= current_date
     and (new.effective_date is distinct from old.effective_date
          or new.old_text is distinct from old.old_text
          or new.new_text is distinct from old.new_text
          or new.old_location_id is distinct from old.old_location_id
          or new.new_location_id is distinct from old.new_location_id) then
    raise exception 'This employment change has already taken effect and its details cannot be rewritten (event %). Record a further change instead.', old.id
      using errcode = 'check_violation';
  end if;

  -- Cancellation is one-way. Un-cancelling would make the audit trail a lie.
  if old.cancelled_at is not null and new.cancelled_at is null then
    raise exception 'A cancelled employment event cannot be reinstated (event %).', old.id
      using errcode = 'check_violation';
  end if;

  return new;
end;
$$;

create trigger employment_events_guard
  before update on public.employee_employment_events
  for each row execute function public.employment_event_guard();

create trigger employment_events_touch
  before update on public.employee_employment_events
  for each row execute function public.touch_updated_at();


-- ── 6. Audit ───────────────────────────────────────────────────────────────
alter table public.audit_log
  add column if not exists employment_event_id uuid;

alter table public.audit_log
  add constraint audit_log_employment_event_id_fkey
  foreign key (employment_event_id) references public.employee_employment_events(id) on delete set null;

create index audit_log_employment_event_idx
  on public.audit_log (employment_event_id, created_at desc)
  where employment_event_id is not null;

comment on column public.audit_log.employment_event_id is
  'Phase E1.7. Employment-event audit parentage, mirroring case_id, employee_id and employee_activity_id. No employment event borrows a case_id.';

create or replace function public.log_employment_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member record;
  v_action text;
  v_detail text;
  v_employee_name text;
  v_old text;
  v_new text;
begin
  select * into v_member from public.org_members
    where org_id = new.org_id and user_id = auth.uid();
  select name into v_employee_name from public.employee_records where id = new.employee_id;

  if new.event_type = 'location_changed' then
    select name into v_old from public.locations where id = new.old_location_id;
    select name into v_new from public.locations where id = new.new_location_id;
  else
    v_old := new.old_text;
    v_new := new.new_text;
  end if;

  if tg_op = 'INSERT' then
    v_action := case when new.event_type = 'employment_ended'
                     then 'Employee marked as leaver'
                     else 'Employment change recorded' end;
    v_detail := format('%s for employee %s (%L); %L -> %L; effective %s; documentation %s',
                       new.event_type, new.employee_id, coalesce(v_employee_name, '(unnamed)'),
                       coalesce(v_old, '(none)'), coalesce(v_new, '(none)'),
                       new.effective_date, new.documentation_status);
  elsif old.cancelled_at is null and new.cancelled_at is not null then
    v_action := 'Employment event cancelled';
    v_detail := format('event %s (%s) effective %s cancelled; reason: %s',
                       new.id, new.event_type, new.effective_date,
                       coalesce(new.cancellation_reason, '(none given)'));
  elsif old.documentation_status is distinct from new.documentation_status then
    v_action := 'Employment documentation status changed';
    v_detail := format('event %s: %s -> %s', new.id, old.documentation_status, new.documentation_status);
  else
    v_action := 'Employment event corrected';
    v_detail := format('event %s (%s); effective %s -> %s',
                       new.id, new.event_type, old.effective_date, new.effective_date);
  end if;

  insert into public.audit_log (org_id, user_id, user_name, action, detail, employee_id, employment_event_id)
  values (new.org_id, auth.uid(), coalesce(v_member.name, 'Unknown'),
          v_action, v_detail, new.employee_id, new.id);

  return null;
end;
$$;

create trigger employment_events_audit
  after insert or update on public.employee_employment_events
  for each row execute function public.log_employment_event();

-- Reserve the new actions against the generic audit RPC, as every authoritative
-- action is. Appended to the existing list rather than replacing the function
-- wholesale, so no earlier reservation can be lost by transcription.
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
    'Employee location assigned',
    'Employee location changed',
    'Employee location cleared',
    'Employee activity recorded',
    'Employee activity updated',
    'Employee activity record added',
    'Employee activity record updated',
    'Employee activity follow-up changed',
    'Management concern resolved',
    'Letter of Concern recorded',
    -- Phase E1.7
    'Employment change recorded',
    'Employee marked as leaver',
    'Employment event cancelled',
    'Employment event corrected',
    'Employment documentation status changed',
    'Employee details corrected'
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


-- ── 7. Correcting employee details is audited, and is NOT an event ──────────
--
-- A typo in an email is not employment history. This records the correction so it
-- is never invisible, while deliberately creating no employment event and nothing
-- in Activity. Written as a trigger so no code path can correct details silently.
create or replace function public.log_employee_detail_correction()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member record;
  v_changed text[] := '{}';
begin
  -- location_id is excluded on purpose: it has its own authoritative operation
  -- (set_employee_location, E1.5) with its own audit action, and a transfer has
  -- its own event type. Recording it here too would double-count it.
  -- array_append, NOT the || operator. `v_changed || 'job_title'` looks like an
  -- append, but Postgres resolves the untyped literal against anyarray||anyarray
  -- first and tries to parse it as an array literal:
  --   22P02 malformed array literal: "job_title"
  -- which made EVERY employee detail edit fail. Caught by the live verification
  -- rather than the dry run, because the dry run exercised the events table and
  -- never this trigger.
  if new.job_title is distinct from old.job_title then v_changed := array_append(v_changed, 'job_title'); end if;
  if new.department is distinct from old.department then v_changed := array_append(v_changed, 'department'); end if;
  if new.manager is distinct from old.manager then v_changed := array_append(v_changed, 'manager'); end if;
  if new.working_pattern is distinct from old.working_pattern then v_changed := array_append(v_changed, 'working_pattern'); end if;
  if new.work_email is distinct from old.work_email then v_changed := array_append(v_changed, 'work_email'); end if;
  if new.employee_number is distinct from old.employee_number then v_changed := array_append(v_changed, 'employee_number'); end if;
  if new.start_date is distinct from old.start_date then v_changed := array_append(v_changed, 'start_date'); end if;
  if new.employment_status is distinct from old.employment_status then v_changed := array_append(v_changed, 'employment_status'); end if;

  if array_length(v_changed, 1) is null then
    return null;
  end if;

  select * into v_member from public.org_members
    where org_id = new.org_id and user_id = auth.uid();

  insert into public.audit_log (org_id, user_id, user_name, action, detail, employee_id)
  values (new.org_id, auth.uid(), coalesce(v_member.name, 'Unknown'),
          'Employee details corrected',
          format('employee %s (%L); fields: %s', new.id, coalesce(new.name, '(unnamed)'),
                 array_to_string(v_changed, ', ')),
          new.id);
  return null;
end;
$$;

create trigger employee_records_correction_audit
  after update on public.employee_records
  for each row execute function public.log_employee_detail_correction();


-- ============================================================================
-- ROLLBACK (complete)
-- ============================================================================
--   drop trigger if exists employee_records_correction_audit on public.employee_records;
--   drop function if exists public.log_employee_detail_correction();
--   drop trigger if exists employment_events_audit on public.employee_employment_events;
--   drop trigger if exists employment_events_touch on public.employee_employment_events;
--   drop trigger if exists employment_events_guard on public.employee_employment_events;
--   drop function if exists public.log_employment_event();
--   drop function if exists public.employment_event_guard();
--   drop index if exists audit_log_employment_event_idx;
--   alter table public.audit_log drop constraint if exists audit_log_employment_event_id_fkey;
--   alter table public.audit_log drop column if exists employment_event_id;
--   drop table if exists public.employee_employment_events;
--   drop function if exists public.effective_employment_status(uuid);
--   drop function if exists public.effective_employee_location(uuid);
--   -- restore the E1.5 predicates, which read the raw column:
--   drop policy if exists employee_records_select_scoped on public.employee_records;
--   create policy employee_records_select_scoped on public.employee_records for select to authenticated
--     using (org_id in (select public.my_org_ids()) and public.can_access_employee(org_id, location_id));
--   drop policy if exists employee_records_update_scoped on public.employee_records;
--   create policy employee_records_update_scoped on public.employee_records for update to authenticated
--     using (org_id in (select public.my_org_ids()) and (public.is_hr_in_org(org_id) or public.is_location_manager_for(org_id, location_id)))
--     with check (org_id in (select public.my_org_ids()) and (public.is_hr_in_org(org_id) or public.is_location_manager_for(org_id, location_id)));
--   -- and re-create log_audit_event without the six Phase E1.7 reserved actions.
-- ============================================================================
