-- ============================================================================
-- Phase E1.6 — EMPLOYEE ACTIVITIES FOUNDATION — 2026-09-27
-- ============================================================================
-- ADDITIVE. Two new tables, one new nullable audit column, three triggers, one
-- unique constraint on each parent so composite foreign keys can enforce
-- parentage. No existing row is read, written or migrated.
--
-- ┌─ WHAT THIS IS FOR ──────────────────────────────────────────────────────┐
-- │ Not everything is a case. A 1:1, a return-to-work conversation, an       │
-- │ ordinary management conversation and an informal management concern are    │
-- │ employee-owned management history — not formal ER machinery. Recording    │
-- │ them as cases would drag hearings, investigations and sanctions behind    │
-- │ them, which is how an informal concern quietly becomes a disciplinary.    │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- WHAT IS DELIBERATELY NOT HERE
--   * Employment events (E1.7).
--   * Any migration of case_type='informal', wellbeing notes, meetings or
--     return-to-work history. Those 14 informal cases stay historical cases.
--   * public.meetings is untouched. It has no employee_id at all (only
--     employee_name text) and carries formal-process machinery — transcript,
--     review_draft, signatures, calendar. Activities are not forced through it.
--   * No relevance scoring, no AI, no automatic escalation.
-- ============================================================================


-- ── 1. Parent keys, so parentage can be declared rather than checked ────────
--
-- Composite foreign keys need a unique constraint on exactly the referenced
-- column list. `id` is already unique on both tables, so these add no new
-- restriction — they exist only so the FKs below can carry org_id and
-- employee_id along with the id, making cross-tenant and cross-employee
-- parentage impossible to express rather than merely forbidden by convention.
alter table public.employee_records
  add constraint employee_records_id_org_key unique (id, org_id);


-- ── 2. The activity — one management matter ────────────────────────────────
create table public.employee_activities (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null,
  -- CANONICAL identity. Never a name: two employees may share one, and the
  -- whole identity programme exists because a name is a label.
  employee_id uuid not null,

  activity_type text not null,

  -- Short human title. Optional: "Timekeeping" for a concern, usually nothing
  -- for a 1:1 whose subject is simply the conversation.
  title text,

  -- ── Lifecycle: TWO columns, deliberately, never one shared enum ──────────
  --
  -- A completed 1:1 is not "resolved", and a management concern is not
  -- "completed". One universal status column would force one of those two
  -- sentences to be written down as if it were true. The CHECK below makes the
  -- wrong combination unrepresentable rather than merely discouraged.
  lifecycle_state text,   -- ordinary activities
  concern_state text,     -- management concerns only

  -- ── WHEN IT HAPPENED, which is not when it was typed in ─────────────────
  --
  -- A conversation held on 15 September and recorded on 27 September belongs in
  -- employment history on the 15th. created_at keeps the system truth; nothing
  -- ever rewrites it to simulate retrospective history.
  occurred_at timestamptz not null,

  -- ── Location context AT OCCURRENCE ──────────────────────────────────────
  --
  -- Captured on the activity, not read back from the employee later. When an
  -- employee transfers, history must not silently claim the conversation
  -- happened at their new site. This is a snapshot of context, NOT an access
  -- control input — authorisation always follows the employee (see §5).
  location_id uuid,

  recorded_by uuid not null,
  -- Display label for who managed the conversation. A label, not authority.
  manager_name text,

  follow_up_date date,
  resolved_at timestamptz,
  resolved_by uuid,

  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint employee_activities_type_valid check (
    activity_type in ('one_to_one', 'return_to_work', 'conversation', 'management_concern')
  ),

  -- The domain rule from §8, enforced by the database.
  --
  -- A management concern has a concern state and no lifecycle state; every other
  -- activity type has a lifecycle state and no concern state. So a 1:1 cannot be
  -- 'resolved' and a concern cannot be 'completed' — not because the UI avoids
  -- offering it, but because the row would not be storable.
  constraint employee_activities_state_matches_type check (
    (activity_type = 'management_concern'
      and concern_state in ('open', 'resolved')
      and lifecycle_state is null)
    or
    (activity_type <> 'management_concern'
      and lifecycle_state in ('draft', 'scheduled', 'in_progress', 'completed', 'cancelled')
      and concern_state is null)
  ),

  -- Resolution metadata belongs only to a resolved concern.
  constraint employee_activities_resolution_consistent check (
    (concern_state = 'resolved' and resolved_at is not null)
    or (concern_state is distinct from 'resolved' and resolved_at is null and resolved_by is null)
  ),

  constraint employee_activities_org_fkey
    foreign key (org_id) references public.organisations(id) on delete cascade,

  -- Employee parentage AND tenancy in one declaration: the pair must exist on
  -- employee_records, so an activity in org A cannot belong to an employee in
  -- org B. No trigger, no application check, nothing to forget.
  constraint employee_activities_employee_same_org_fkey
    foreign key (employee_id, org_id) references public.employee_records(id, org_id)
    on delete cascade,

  -- Same trick for the location snapshot, matching E1.5's employee_records FK.
  constraint employee_activities_location_same_org_fkey
    foreign key (location_id, org_id) references public.locations(id, org_id)
    on delete restrict,

  -- Needed by the records table's own composite FK below.
  constraint employee_activities_id_org_employee_key unique (id, org_id, employee_id)
);

create index employee_activities_employee_occurred_idx
  on public.employee_activities (employee_id, occurred_at desc);
create index employee_activities_org_open_concern_idx
  on public.employee_activities (org_id, concern_state)
  where concern_state = 'open';
create index employee_activities_follow_up_idx
  on public.employee_activities (org_id, follow_up_date)
  where follow_up_date is not null;

comment on table public.employee_activities is
  'Phase E1.6. Employee-owned management activities: 1:1, return to work, conversation, management concern. NOT cases and never converted into cases. occurred_at is when it happened; created_at is when it was recorded. location_id is context at occurrence, never an access-control input.';


-- ── 3. The chronology inside an activity ───────────────────────────────────
--
-- A management concern is one matter with several entries — conversation,
-- expectations, follow-up, a Letter of Concern, review, resolution. Without this
-- table each follow-up would have to become another activity, which is the same
-- mistake as making every follow-up a new case.
create table public.employee_activity_records (
  id uuid primary key default gen_random_uuid(),
  activity_id uuid not null,
  org_id uuid not null,
  employee_id uuid not null,

  record_type text not null,
  occurred_at timestamptz not null,
  body text,

  recorded_by uuid not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),

  constraint employee_activity_records_type_valid check (
    record_type in ('conversation', 'follow_up', 'note', 'letter_of_concern', 'communication')
  ),

  -- Parentage, tenancy and employee identity in ONE constraint: a record's
  -- (activity, org, employee) triple must exist on the parent. A record cannot
  -- be attached to an activity in another organisation, and cannot claim a
  -- different employee from the activity it belongs to.
  constraint employee_activity_records_parent_fkey
    foreign key (activity_id, org_id, employee_id)
    references public.employee_activities(id, org_id, employee_id)
    on delete cascade
);

create index employee_activity_records_activity_occurred_idx
  on public.employee_activity_records (activity_id, occurred_at);
create index employee_activity_records_employee_idx
  on public.employee_activity_records (employee_id, occurred_at desc);
-- Supports "has this employee ever had a Letter of Concern" without scanning.
create index employee_activity_records_letter_idx
  on public.employee_activity_records (employee_id, occurred_at desc)
  where record_type = 'letter_of_concern';

comment on table public.employee_activity_records is
  'Phase E1.6. Chronological entries within one employee activity. record_type=letter_of_concern is an INFORMAL management action and is structurally incapable of becoming a formal warning: no warning column, no expiry, and Current Warnings reads only cases/allegations.';

comment on column public.employee_activity_records.record_type is
  'conversation | follow_up | note | letter_of_concern | communication. A Letter of Concern is informal management history, NOT a First or Final Written Warning, and carries no expiry.';


-- ── 4. Parentage is immutable ──────────────────────────────────────────────
--
-- The composite FKs make a cross-tenant or cross-employee value impossible to
-- insert. They do not stop a row being re-pointed at a DIFFERENT employee within
-- the same organisation — which would move a person's management history onto
-- someone else. That is the same class of harm the cases parentage guard exists
-- to prevent, so it gets the same treatment.
-- TWO functions, not one shared one. This is not stylistic.
--
-- A single function attached to both tables cannot reference a column that only
-- one of them has: plpgsql resolves `new.activity_id` when it evaluates the
-- expression, and does NOT skip it because the `tg_table_name = ...` conjunct to
-- its left is false. A shared guard written that way raises
--   42703  record "new" has no field "activity_id"
-- on EVERY update to employee_activities — including resolving a concern. Caught
-- in the dry run only because a legitimate title edit was tested alongside the
-- reparent attempts; the reparent tests still passed, because their branch is
-- evaluated first, which is how a broken guard hides behind green assertions.
create or replace function public.employee_activity_parentage_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.org_id is distinct from old.org_id
     or new.employee_id is distinct from old.employee_id then
    raise exception 'An activity cannot be moved between employees or organisations (activity %). Employment history belongs to the person it was recorded about.', old.id
      using errcode = 'check_violation';
  end if;
  -- occurred_at stays editable: a manager correcting the date of a conversation
  -- they recorded from memory is legitimate, and the audit trail records it.
  return new;
end;
$$;

create or replace function public.employee_activity_record_parentage_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if new.org_id is distinct from old.org_id
     or new.employee_id is distinct from old.employee_id then
    raise exception 'An activity record cannot be moved between employees or organisations (record %).', old.id
      using errcode = 'check_violation';
  end if;
  if new.activity_id is distinct from old.activity_id then
    raise exception 'An activity record cannot be moved to a different activity (record %).', old.id
      using errcode = 'check_violation';
  end if;
  return new;
end;
$$;

create trigger employee_activities_parentage
  before update on public.employee_activities
  for each row execute function public.employee_activity_parentage_guard();

create trigger employee_activity_records_parentage
  before update on public.employee_activity_records
  for each row execute function public.employee_activity_record_parentage_guard();

-- Server-set updated_at, so the optimistic-concurrency key cannot be forged or
-- skewed by a client clock the way every pre-E1.5 employee write could be.
create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := now();
  return new;
end;
$$;

create trigger employee_activities_touch
  before update on public.employee_activities
  for each row execute function public.touch_updated_at();

create trigger employee_activity_records_touch
  before update on public.employee_activity_records
  for each row execute function public.touch_updated_at();


-- ── 5. RLS — inherited from the employee, not restated ─────────────────────
--
-- The predicate is "can I see this employee_records row?", expressed as an
-- EXISTS against that table. Because employee_records has its own RLS, the
-- subquery only finds employees the caller is authorised for — so activity
-- visibility can never exceed Employee File visibility, and it cannot drift out
-- of step with can_access_employee() because it does not duplicate it.
--
-- This is the same inheritance pattern the case child objects already use, and
-- it delivers every requirement in §13 without restating any of them:
--   * HR / organisation-wide roles: their own organisation's employees.
--   * Location Manager: only employees in their authorised locations.
--   * Employee with no canonical location: HR/organisation-wide only.
--   * Cross-organisation: denied.
--   * Platform admin with no membership: denied.
--
-- Note what is NOT here: the activity's own location_id plays no part. It is
-- historical context. Using it would mean a transfer silently changed who could
-- read history, and a Location Manager could reach an employee they cannot
-- otherwise see by virtue of an old activity.
alter table public.employee_activities enable row level security;
alter table public.employee_activity_records enable row level security;

create policy employee_activities_select
  on public.employee_activities for select to authenticated
  using (
    org_id in (select public.my_org_ids())
    and exists (
      select 1 from public.employee_records er
      where er.id = employee_activities.employee_id
    )
  );

create policy employee_activities_insert
  on public.employee_activities for insert to authenticated
  with check (
    org_id in (select public.my_org_ids())
    and recorded_by = auth.uid()
    and exists (
      select 1 from public.employee_records er
      where er.id = employee_activities.employee_id
    )
  );

create policy employee_activities_update
  on public.employee_activities for update to authenticated
  using (
    org_id in (select public.my_org_ids())
    and exists (
      select 1 from public.employee_records er
      where er.id = employee_activities.employee_id
    )
  )
  with check (
    org_id in (select public.my_org_ids())
    and exists (
      select 1 from public.employee_records er
      where er.id = employee_activities.employee_id
    )
  );

-- No DELETE policy, so deletion is denied for every application user.
-- Employment history is not something a manager removes because they would
-- rather it had not happened; a resolved concern stays in the chronology.

create policy employee_activity_records_select
  on public.employee_activity_records for select to authenticated
  using (
    org_id in (select public.my_org_ids())
    and exists (
      select 1 from public.employee_activities a
      where a.id = employee_activity_records.activity_id
    )
  );

create policy employee_activity_records_insert
  on public.employee_activity_records for insert to authenticated
  with check (
    org_id in (select public.my_org_ids())
    and recorded_by = auth.uid()
    and exists (
      select 1 from public.employee_activities a
      where a.id = employee_activity_records.activity_id
    )
  );

create policy employee_activity_records_update
  on public.employee_activity_records for update to authenticated
  using (
    org_id in (select public.my_org_ids())
    and exists (
      select 1 from public.employee_activities a
      where a.id = employee_activity_records.activity_id
    )
  )
  with check (
    org_id in (select public.my_org_ids())
    and exists (
      select 1 from public.employee_activities a
      where a.id = employee_activity_records.activity_id
    )
  );

-- Records inherit from the ACTIVITY, which inherits from the employee. A child
-- record therefore cannot be reached around its parent: the EXISTS finds nothing
-- when employee_activities' own policy excludes the parent row, so knowing a
-- record uuid discloses nothing.


-- ── 6. Audit ───────────────────────────────────────────────────────────────
--
-- audit_log gained employee_id in E1.5. An activity event needs to point at the
-- activity as well, so one more nullable column, mirroring case_id and
-- employee_id exactly (ON DELETE SET NULL, so removing an activity could never
-- erase the record of what was done to it).
alter table public.audit_log
  add column if not exists employee_activity_id uuid;

alter table public.audit_log
  add constraint audit_log_employee_activity_id_fkey
  foreign key (employee_activity_id) references public.employee_activities(id) on delete set null;

create index audit_log_employee_activity_idx
  on public.audit_log (employee_activity_id, created_at desc)
  where employee_activity_id is not null;

comment on column public.audit_log.employee_activity_id is
  'Phase E1.6. Activity-level audit parentage, mirroring case_id and employee_id. No activity event ever borrows a case_id as fake parentage.';

-- Written by a TRIGGER rather than by the client or an RPC wrapper.
--
-- audit_log has no INSERT policy at all, so a client cannot write these rows;
-- and a trigger cannot be forgotten by a new code path the way an explicit
-- audit call can. Every create, every material change and every resolution is
-- recorded because the write itself causes it.
create or replace function public.log_employee_activity_event()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member record;
  v_action text;
  v_detail text;
  v_activity record;
  v_activity_id uuid;
  v_employee_name text;
begin
  if tg_table_name = 'employee_activities' then
    v_activity_id := new.id;
    v_activity := new;
  else
    v_activity_id := new.activity_id;
    select * into v_activity from public.employee_activities where id = new.activity_id;
  end if;

  select * into v_member from public.org_members
    where org_id = new.org_id and user_id = auth.uid();
  select name into v_employee_name from public.employee_records where id = new.employee_id;

  if tg_table_name = 'employee_activities' then
    if tg_op = 'INSERT' then
      v_action := 'Employee activity recorded';
      v_detail := format('%s for employee %s (%L); occurred %s',
                         new.activity_type, new.employee_id,
                         coalesce(v_employee_name, '(unnamed)'), new.occurred_at);
    elsif old.concern_state is distinct from new.concern_state and new.concern_state = 'resolved' then
      v_action := 'Management concern resolved';
      v_detail := format('activity %s for employee %s (%L)', new.id, new.employee_id,
                         coalesce(v_employee_name, '(unnamed)'));
    elsif old.follow_up_date is distinct from new.follow_up_date then
      v_action := 'Employee activity follow-up changed';
      v_detail := format('activity %s follow-up %s -> %s', new.id,
                         coalesce(old.follow_up_date::text, 'none'),
                         coalesce(new.follow_up_date::text, 'none'));
    else
      v_action := 'Employee activity updated';
      v_detail := format('activity %s (%s)', new.id, new.activity_type);
    end if;
  else
    if new.record_type = 'letter_of_concern' then
      -- Named distinctly because it is meaningful informal management history —
      -- and named as a LETTER, never as a warning.
      v_action := 'Letter of Concern recorded';
    elsif tg_op = 'INSERT' then
      v_action := 'Employee activity record added';
    else
      v_action := 'Employee activity record updated';
    end if;
    v_detail := format('%s on activity %s for employee %s (%L)',
                       new.record_type, v_activity_id, new.employee_id,
                       coalesce(v_employee_name, '(unnamed)'));
  end if;

  insert into public.audit_log (org_id, user_id, user_name, action, detail, employee_id, employee_activity_id)
  values (new.org_id, auth.uid(), coalesce(v_member.name, 'Unknown'),
          v_action, v_detail, new.employee_id, v_activity_id);

  return null;  -- AFTER trigger
end;
$$;

create trigger employee_activities_audit
  after insert or update on public.employee_activities
  for each row execute function public.log_employee_activity_event();

create trigger employee_activity_records_audit
  after insert or update on public.employee_activity_records
  for each row execute function public.log_employee_activity_event();

-- And make the new actions unforgeable through the generic audit RPC, the same
-- treatment every other authoritative action gets.
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
    -- Phase E1.6
    'Employee activity recorded',
    'Employee activity updated',
    'Employee activity record added',
    'Employee activity record updated',
    'Employee activity follow-up changed',
    'Management concern resolved',
    'Letter of Concern recorded'
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
--   drop trigger if exists employee_activity_records_audit on public.employee_activity_records;
--   drop trigger if exists employee_activities_audit on public.employee_activities;
--   drop trigger if exists employee_activity_records_touch on public.employee_activity_records;
--   drop trigger if exists employee_activities_touch on public.employee_activities;
--   drop trigger if exists employee_activity_records_parentage on public.employee_activity_records;
--   drop trigger if exists employee_activities_parentage on public.employee_activities;
--   drop function if exists public.log_employee_activity_event();
--   drop function if exists public.employee_activity_record_parentage_guard();
--   drop function if exists public.employee_activity_parentage_guard();
--   drop function if exists public.touch_updated_at();
--   drop index if exists audit_log_employee_activity_idx;
--   alter table public.audit_log drop constraint if exists audit_log_employee_activity_id_fkey;
--   alter table public.audit_log drop column if exists employee_activity_id;
--   drop table if exists public.employee_activity_records;
--   drop table if exists public.employee_activities;
--   alter table public.employee_records drop constraint if exists employee_records_id_org_key;
--   -- and re-create log_audit_event without the seven Phase E1.6 reserved actions.
-- ============================================================================
