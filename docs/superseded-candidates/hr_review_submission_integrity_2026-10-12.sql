-- ════════════════════════════════════════════════════════════════════════════
-- B3 A3c (REVISED) — HR REVIEW SUBMISSION INTEGRITY
-- Candidate migration. NOT APPLIED.
--
-- Supersedes 2623aff78f039368c85a750db9b8896ca7fca46e013aa92e5162542f08d47c75,
-- which was never applied. Three things changed substantively:
--
--   1. The post-return rule no longer compares timestamps. It compares a
--      per-case lifecycle-event sequence. The old rule was unprovable by
--      rolled-back probe because now() is TRANSACTION time, so every event in
--      a single probe carried an identical timestamp and the required sequence
--      collapsed into one instant.
--   2. hr_review_clarifications.case_id becomes a COMPOSITE same-org reference.
--      The single-column form was caught by the tenancy gate before
--      application.
--   3. Terminal HR decisions cannot be reversed, and only one investigation
--      review may be open at a time.
--
-- ── WHY version_no CANNOT DO THIS ───────────────────────────────────────────
--
-- In BOTH the refused and the permitted sequence the submitted version is v2
-- and the returned version is v1, so version_no 2 > 1 holds either way. The
-- only difference is WHEN the adoption happened:
--
--   refused    submit v1 -> adopt v2 -> HR returns v1 -> submit v2
--   permitted  submit v1 -> save v2 -> HR returns v1 -> adopt v2 -> submit v2
--
-- Creation order is identical; adoption order is inverted. No function of
-- version_no separates them. Nor does the adoption RPC help: it has no
-- "must be the highest version" check, so any unadopted version may be
-- adopted at any time.
--
-- ── WHY A SEQUENCE, AND WHY IT IS TESTABLE ──────────────────────────────────
--
-- case_seq advances per STATEMENT, not per transaction. So the whole sequence
-- is observable inside one rolled-back transaction (adopt=2, return=3,
-- adopt=4), which is what makes every rule below provable with a control that
-- can actually pass.
--
-- ── CONCURRENCY: THE ADVISORY LOCK IS A LEAF ────────────────────────────────
--
-- Lock acquisition order, read from the live functions rather than assumed:
--
--   adopt_investigation_report_version   cases row (FOR UPDATE) -> version row
--   assign_..._version_no (INSERT trg)   cases row (FOR UPDATE)
--   submit_..._for_hr_review (below)     cases row (FOR UPDATE) -> hrr row
--   HR decision (client UPDATE)          hrr row  -> [BEFORE trigger runs]
--
-- The decision path CANNOT take the cases row first: UPDATE locks the
-- hr_review_requests tuple before any BEFORE ROW trigger fires. So a recorder
-- that grabbed the cases row would invert the order against the submission
-- path and deadlock.
--
-- Both recorders therefore serialise on pg_advisory_xact_lock(case_id) and
-- request NOTHING else while holding it. A lock that is never held while
-- waiting for another lock cannot appear in a wait-for cycle, so it is
-- deadlock-free by construction rather than by lucky ordering.
--
-- UNIQUE (case_id, case_seq) is NOT the concurrency control. It is the
-- backstop that turns a hypothetical lost update into a hard 23505 instead of
-- a duplicated sequence number.
--
-- ── WHAT THIS DOES NOT TOUCH ────────────────────────────────────────────────
--
-- A1 (protect_adopted_investigation_report), A3a (the regime foundation),
-- A3b (protect_versioned_case_legacy_report), adopt_investigation_report_version,
-- save_investigation_report_version, the author guard, the version-numbering
-- trigger, the version immutability guard, and every existing policy and grant
-- on existing tables. All are pinned by md5 in the drift guard below.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── DRIFT GUARD ───────────────────────────────────────────────────────────
do $guard$
declare
  v text;
  v_pairs text[][] := array[
    ['protect_adopted_investigation_report',       '85ba380f71d56ecf66daa2441d97dbdf'],
    ['stamp_case_report_regime',                   '247284ee9eca33e72bc6d005f0e16830'],
    ['protect_case_report_regime',                 '684666d4f922b92401c3e8ad556a9834'],
    ['protect_versioned_case_legacy_report',       '64e43642a994499687780a3719c121c0'],
    ['adopt_investigation_report_version',         'fb45b6388323936ce8e405614ecc2882'],
    ['save_investigation_report_version',           'fb626a16d73a3470f48f02510a2df730'],
    ['hr_review_report_integrity_guard',            '08dc6b8b8c83cbec0951f2f7371d9faf'],
    ['investigation_report_versions_author_guard',  'c25056999f07a5d789a1ec0034e9204e'],
    ['assign_investigation_report_version_no',      'fc76a8f6adb17d4f40c2e988143062d0']
  ];
  i int;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    select md5(prosrc) into v from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_pairs[i][1];
    if v is distinct from v_pairs[i][2] then
      raise exception 'DRIFT: %() is %, expected %. This candidate was written against the recorded bodies and must not be applied on top of a changed one.',
        v_pairs[i][1], coalesce(v, 'MISSING'), v_pairs[i][2];
    end if;
  end loop;

  -- The composite tenancy FKs below need this to exist.
  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.cases'::regclass
                    and contype in ('u', 'p')
                    and pg_get_constraintdef(oid) ilike '%(id, org_id)%') then
    raise exception 'DRIFT: cases has no UNIQUE/PK on (id, org_id); the composite same-org foreign keys cannot be declared.';
  end if;

  if not exists (select 1 from pg_attribute
                  where attrelid = 'public.cases'::regclass
                    and attname = 'report_regime' and not attisdropped) then
    raise exception 'DRIFT: cases.report_regime is missing. A3a must be applied first.';
  end if;

  -- The progression guard must fire AFTER A3b, which must fire after A3a.
  if not ('protect_zzb_progression_currency_trg' > 'protect_zza_versioned_legacy_report_upd_trg') then
    raise exception 'DRIFT: the proposed progression trigger name would not sort after A3b.';
  end if;
end;
$guard$;

-- ── SUPPORTING UNIQUE CONSTRAINTS ─────────────────────────────────────────
-- Redundant by themselves (id is already unique) and that is the point: they
-- are what let a composite foreign key bind a referenced row to the SAME
-- case, so a lifecycle event naming another case's version or review becomes
-- unrepresentable rather than merely trigger-checked.
alter table public.investigation_report_versions
  add constraint investigation_report_versions_id_case_key unique (id, case_id);
alter table public.hr_review_requests
  add constraint hr_review_requests_id_case_key unique (id, case_id);

-- ── 1. THE LIFECYCLE EVENT STORE ──────────────────────────────────────────
create table public.investigation_report_lifecycle_events (
  id                bigserial    primary key,
  case_id           uuid         not null,
  org_id            uuid         not null,
  case_seq          integer      not null,
  event_kind        text         not null,
  version_id        uuid,
  review_request_id uuid,
  actor             uuid         not null references auth.users(id),
  occurred_at       timestamptz  not null default now(),

  constraint irle_kind_valid
    check (event_kind in ('adoption', 'hr_return')),
  constraint irle_adoption_names_a_version
    check (event_kind <> 'adoption' or version_id is not null),
  constraint irle_case_seq_positive check (case_seq >= 1),

  -- TENANCY, structurally. A cross-tenant event cannot be stored.
  constraint irle_case_same_org_fkey
    foreign key (case_id, org_id) references public.cases(id, org_id) on delete cascade,
  constraint irle_org_fkey
    foreign key (org_id) references public.organisations(id) on delete cascade,
  -- SAME CASE, structurally, via the unique constraints added above.
  constraint irle_version_same_case_fkey
    foreign key (version_id, case_id)
      references public.investigation_report_versions(id, case_id) on delete cascade,
  constraint irle_review_same_case_fkey
    foreign key (review_request_id, case_id)
      references public.hr_review_requests(id, case_id) on delete cascade,

  -- The backstop, not the concurrency control.
  constraint irle_case_seq_unique unique (case_id, case_seq)
);

comment on table public.investigation_report_lifecycle_events is
  'Append-only, per-case ordering of the two events that decide whether an investigation report may be submitted for HR review: the adoption of a version, and a formal HR return. case_seq is assigned under a per-case advisory lock and is gap-free within a case. Written only by SECURITY DEFINER triggers on the state transitions themselves, so no code path can skip recording one; no client holds any write privilege. ON DELETE CASCADE from the case is deliberate: the durable record of these facts lives in audit_log, whose case_id is ON DELETE SET NULL, while these rows are case-scoped operational metadata carrying an actor identity and must not survive an authorised erasure.';

create index irle_case_kind_seq_idx
  on public.investigation_report_lifecycle_events (case_id, event_kind, case_seq desc);
create index irle_version_idx
  on public.investigation_report_lifecycle_events (version_id) where version_id is not null;

revoke all on public.investigation_report_lifecycle_events from public;
revoke all on public.investigation_report_lifecycle_events from anon;
revoke all on public.investigation_report_lifecycle_events from authenticated;
grant select on public.investigation_report_lifecycle_events to authenticated;
-- service_role too. Found by probe: with only anon/authenticated revoked,
-- service_role INSERTed a forged adoption event successfully. The recorders
-- are SECURITY DEFINER owned by postgres, so they write regardless of the
-- CALLER's grants -- revoking these breaks nothing and leaves the two trigger
-- functions as the only writers in the system. TRUNCATE is revoked here even
-- though the 2026-10-11 hardening deliberately left service_role holding it
-- on every other table: this one is append-only, and no administrative
-- operation has a reason to empty it.
revoke insert, update, delete, truncate on public.investigation_report_lifecycle_events from service_role;
revoke all on sequence public.investigation_report_lifecycle_events_id_seq from public;
revoke all on sequence public.investigation_report_lifecycle_events_id_seq from anon;
revoke all on sequence public.investigation_report_lifecycle_events_id_seq from authenticated;

alter table public.investigation_report_lifecycle_events enable row level security;

create policy irle_select_case_scoped
  on public.investigation_report_lifecycle_events
  for select
  using (exists (select 1 from public.cases c
                  where c.id = investigation_report_lifecycle_events.case_id));

-- Append-only. Fires for service_role and postgres too: rolbypassrls bypasses
-- RLS, never triggers.
create or replace function public.irle_append_only_guard()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    -- THE CASCADE ESCAPE HATCH, and it is load-bearing. A BEFORE DELETE
    -- trigger that raises unconditionally also blocks the ON DELETE CASCADE
    -- from cases, so "Delete all data" would fail with a check_violation
    -- instead of erasing the tenant. A probe caught exactly that.
    --
    -- PostgreSQL runs the FK cascade after the parent row is gone, so a
    -- missing parent is the reliable signature of an authorised deletion
    -- rather than of tampering. This is the same idiom
    -- investigation_report_versions_immutability_guard already uses in
    -- production, copied rather than reinvented.
    if not exists (select 1 from public.cases where id = old.case_id) then
      return old;
    end if;
    if not exists (select 1 from public.organisations where id = old.org_id) then
      return old;
    end if;
    raise exception 'The report lifecycle record cannot be deleted (event % of case %).',
      old.case_seq, old.case_id using errcode = 'check_violation';
  end if;
  raise exception 'The report lifecycle record cannot be changed (event % of case %).',
    old.case_seq, old.case_id using errcode = 'check_violation';
end;
$function$;

revoke all on function public.irle_append_only_guard() from public;
revoke all on function public.irle_append_only_guard() from anon;
revoke all on function public.irle_append_only_guard() from authenticated;

create trigger irle_a_append_only_trg
  before update or delete on public.investigation_report_lifecycle_events
  for each row execute function public.irle_append_only_guard();

-- ── 2. THE RECORDERS ──────────────────────────────────────────────────────
-- Both take the per-case advisory lock LAST and request nothing while holding
-- it. See the header: that is what makes them deadlock-free.

create or replace function public.record_report_adoption_event()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_seq int;
begin
  perform pg_advisory_xact_lock(hashtextextended('irle:' || new.case_id::text, 0));
  select coalesce(max(case_seq), 0) + 1 into v_seq
    from public.investigation_report_lifecycle_events where case_id = new.case_id;
  insert into public.investigation_report_lifecycle_events
    (case_id, org_id, case_seq, event_kind, version_id, actor)
  values (new.case_id, new.org_id, v_seq, 'adoption', new.id, new.adopted_by);
  return null;
end;
$function$;

revoke all on function public.record_report_adoption_event() from public;
revoke all on function public.record_report_adoption_event() from anon;
revoke all on function public.record_report_adoption_event() from authenticated;

-- Recorded on the STATE TRANSITION, not inside the adoption RPC, so no path
-- can adopt without recording. The RPC keeps md5 fb45b638... unchanged.
create trigger record_zz_adoption_event_trg
  after update on public.investigation_report_versions
  for each row
  when (old.adopted_at is null and new.adopted_at is not null)
  execute function public.record_report_adoption_event();

create or replace function public.record_hr_return_event()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_seq int;
begin
  perform pg_advisory_xact_lock(hashtextextended('irle:' || new.case_id::text, 0));
  select coalesce(max(case_seq), 0) + 1 into v_seq
    from public.investigation_report_lifecycle_events where case_id = new.case_id;
  insert into public.investigation_report_lifecycle_events
    (case_id, org_id, case_seq, event_kind, review_request_id, actor)
  values (new.case_id, new.org_id, v_seq, 'hr_return', new.id,
          coalesce(new.reviewed_by, auth.uid()));
  return null;
end;
$function$;

revoke all on function public.record_hr_return_event() from public;
revoke all on function public.record_hr_return_event() from anon;
revoke all on function public.record_hr_return_event() from authenticated;

create trigger record_zz_hr_return_event_trg
  after update on public.hr_review_requests
  for each row
  when (new.status = 'returned' and old.status is distinct from 'returned')
  execute function public.record_hr_return_event();

-- ── 3. CLARIFICATION ROUNDS ───────────────────────────────────────────────
create table public.hr_review_clarifications (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null,
  org_id      uuid not null references public.organisations(id) on delete cascade,
  case_id     uuid not null,
  round       integer not null,
  question    text not null,
  asked_by    uuid not null references auth.users(id),
  asked_at    timestamptz not null default now(),
  response    text,
  answered_by uuid references auth.users(id),
  answered_at timestamptz,

  constraint hr_review_clarifications_round_positive check (round >= 1),
  constraint hr_review_clarifications_answer_complete
    check ((response is null and answered_by is null and answered_at is null)
        or (response is not null and answered_by is not null and answered_at is not null)),

  -- TENANCY: composite, replacing the single-column case_id reference the
  -- governance gate rejected in the previous candidate.
  constraint hr_review_clarifications_case_same_org_fkey
    foreign key (case_id, org_id) references public.cases(id, org_id) on delete cascade,
  constraint hr_review_clarifications_review_same_case_fkey
    foreign key (review_id, case_id)
      references public.hr_review_requests(id, case_id) on delete cascade
);

comment on table public.hr_review_clarifications is
  'One row per clarification round on an HR review: HR''s question with its author and time, and the investigator''s response with theirs. Append-only for the question, write-once for the answer. Written only by hr_review_report_integrity_guard (the question, atomically with the status transition) and answer_hr_review_clarification (the response); no client holds any write privilege. Content is personal data about a named employee and is DSAR-reviewable, never automatically disclosed.';

create unique index hr_review_clarifications_round_unique
  on public.hr_review_clarifications (review_id, round);
create unique index hr_review_clarifications_one_open
  on public.hr_review_clarifications (review_id) where answered_at is null;
create index hr_review_clarifications_case_idx
  on public.hr_review_clarifications (case_id);

revoke all on public.hr_review_clarifications from public;
revoke all on public.hr_review_clarifications from anon;
revoke all on public.hr_review_clarifications from authenticated;
grant select on public.hr_review_clarifications to authenticated;
-- As above: the guard and answer_hr_review_clarification are SECURITY DEFINER,
-- so removing service_role's write verbs leaves them as the only writers.
revoke insert, update, delete, truncate on public.hr_review_clarifications from service_role;

alter table public.hr_review_clarifications enable row level security;

-- Delegated to the caller's own `cases` RLS, which is RESTRICTIVE and resolves
-- to: org_members.case_access_level = 1, OR level 2 and the case's creator, OR
-- an explicit case_access row. Measured: 0 cross-tenant rows for three
-- identities, and the assigned investigator DOES reach their own case's rows,
-- which an is_hr_role predicate would have cut off -- they are the person
-- required to answer.
create policy hr_review_clarifications_select_case_scoped
  on public.hr_review_clarifications
  for select
  using (exists (select 1 from public.cases c where c.id = hr_review_clarifications.case_id));

create or replace function public.hr_review_clarifications_append_only()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    -- Same cascade escape hatch as irle_append_only_guard; see the comment
    -- there. Without it the authorised tenant erasure fails outright.
    if not exists (select 1 from public.cases where id = old.case_id) then
      return old;
    end if;
    if not exists (select 1 from public.organisations where id = old.org_id) then
      return old;
    end if;
    raise exception 'A clarification round cannot be deleted (round % of review %).',
      old.round, old.review_id using errcode = 'check_violation';
  end if;
  if new.review_id is distinct from old.review_id
     or new.case_id is distinct from old.case_id
     or new.org_id is distinct from old.org_id
     or new.round is distinct from old.round
     or new.question is distinct from old.question
     or new.asked_by is distinct from old.asked_by
     or new.asked_at is distinct from old.asked_at then
    raise exception 'A clarification question cannot be changed once asked (round % of review %).',
      old.round, old.review_id using errcode = 'check_violation';
  end if;
  if old.answered_at is not null then
    raise exception 'A clarification answer cannot be replaced (round % of review %).',
      old.round, old.review_id using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

revoke all on function public.hr_review_clarifications_append_only() from public;
revoke all on function public.hr_review_clarifications_append_only() from anon;
revoke all on function public.hr_review_clarifications_append_only() from authenticated;

create trigger hr_review_clarifications_append_only_trg
  before update or delete on public.hr_review_clarifications
  for each row execute function public.hr_review_clarifications_append_only();

-- ── 4. THE HR REVIEW GUARD ────────────────────────────────────────────────
--
-- TERMINAL-STATE MATRIX, chosen after reading each status's actual handler in
-- resolveInvestigationReview (App.jsx) rather than from the status list:
--
--   pending                 -> any resolution                    PERMITTED
--   clarification_requested -> pending (answer received)          PERMITTED
--                              answer_hr_review_clarification does exactly
--                              this, so a blanket ban on transitions INTO
--                              pending would break the round-trip entirely.
--   clarification_requested -> any resolution                    PERMITTED
--   approved                -> anything                          REFUSED
--   returned                -> anything                          REFUSED
--   closed                  -> anything                          REFUSED
--   progressed              -> anything                          REFUSED
--   taken_over              -> any resolution                    PERMITTED
--
-- taken_over is deliberately NOT terminal. It is custodial: its handler sets
-- the case manager and grants case_owner, and does not close or progress
-- anything. HR who have taken a case over may still need to resolve the same
-- review afterwards, and blocking that would be the "accidentally blocked
-- custodial operation" this matrix exists to avoid.
--
-- closed and progressed ARE terminal: their handlers write stage 'closed' and
-- record progression, and reversing them would un-close a case.
create or replace function public.hr_review_report_integrity_guard()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_privileged boolean := coalesce(auth.role(), '') = 'service_role';
  v_actor uuid := case when v_privileged then null else auth.uid() end;
  v_ver public.investigation_report_versions;
  v_return_seq int;
  v_adopt_seq int;
  v_open int;
  v_terminal text[] := array['approved', 'returned', 'closed', 'progressed'];
begin
  -- ── version sanity, on both INSERT and UPDATE ──
  if new.report_version_id is not null then
    select * into v_ver from public.investigation_report_versions
     where id = new.report_version_id;
    if v_ver.id is null then
      raise exception 'That report version does not exist' using errcode = '23503';
    end if;
    if v_ver.adopted_at is null then
      raise exception 'A report must be adopted before it can be submitted for HR review'
        using errcode = 'check_violation';
    end if;
    if v_ver.case_id is distinct from new.case_id then
      raise exception 'That report version belongs to a different case'
        using errcode = 'check_violation';
    end if;
  end if;

  if tg_op = 'INSERT' then
    if new.report_version_id is not null then
      -- Only the CURRENT adopted version may be submitted. Checked on INSERT
      -- only: re-checking on every UPDATE would freeze a live review the
      -- moment a newer version was adopted.
      if not v_ver.is_current then
        raise exception 'That report version has been superseded by a later adoption. Submit the current adopted report.'
          using errcode = 'check_violation';
      end if;

      -- ORDERING: the adoption must not predate the latest formal return.
      select coalesce(max(case_seq), 0) into v_return_seq
        from public.investigation_report_lifecycle_events
       where case_id = new.case_id and event_kind = 'hr_return';
      select max(case_seq) into v_adopt_seq
        from public.investigation_report_lifecycle_events
       where case_id = new.case_id and event_kind = 'adoption'
         and version_id = new.report_version_id;

      if v_adopt_seq is null then
        raise exception 'That report was not adopted through the recorded process, so its place in the case history cannot be established.'
          using errcode = 'check_violation';
      end if;
      if v_adopt_seq < v_return_seq then
        raise exception 'HR returned this investigation for further work. Adopt a version after the return before submitting it again.'
          using errcode = 'check_violation';
      end if;

      -- ONE OPEN REVIEW per case and step.
      select count(*) into v_open from public.hr_review_requests r
       where r.case_id = new.case_id and r.step = new.step
         and r.status in ('pending', 'clarification_requested');
      if v_open > 0 then
        raise exception 'An HR review of this investigation is already open. It must be decided before another is submitted.'
          using errcode = 'check_violation';
      end if;
    end if;
    return new;
  end if;

  -- ── UPDATE ──
  -- The decision identity is the database's, never the client's, on every
  -- path and not only on a status change.
  new.reviewed_at := old.reviewed_at;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_by_name := old.reviewed_by_name;

  -- Which version a review is about is fixed when it is submitted.
  if new.report_version_id is distinct from old.report_version_id then
    raise exception 'The report version under review cannot be changed. Submit a new review instead.'
      using errcode = 'check_violation';
  end if;

  -- TERMINAL decisions are final.
  if old.status = any (v_terminal) and new.status is distinct from old.status then
    raise exception 'That HR review is already resolved as "%" and cannot be reopened. Submit a new review instead.',
      old.status using errcode = 'check_violation';
  end if;

  if new.status is distinct from old.status and new.status <> 'pending' then
    if v_actor is null then
      raise exception 'An HR review decision must be made by a signed-in HR user. An automated or service-role process cannot decide a review.'
        using errcode = '42501';
    end if;
    if not exists (select 1 from public.org_members om
                    where om.org_id = new.org_id and om.user_id = v_actor
                      and public.is_hr_role(om.role)) then
      raise exception 'Only HR can decide an HR review' using errcode = '42501';
    end if;
    if v_actor = old.requested_by then
      raise exception 'You cannot decide an HR review that you submitted' using errcode = '42501';
    end if;
    if new.report_version_id is not null and v_ver.adopted_by = v_actor then
      raise exception 'You cannot decide an HR review of a report that you adopted' using errcode = '42501';
    end if;

    -- APPROVAL requires currency AND ordering, re-checked at decision time.
    -- A return or a newer adoption may have landed since submission.
    if new.status in ('approved', 'progressed') and new.report_version_id is not null then
      if not v_ver.is_current then
        raise exception 'A newer investigation report has since been adopted on this case. Return this review, or ask for the current version to be submitted.'
          using errcode = 'check_violation';
      end if;
      select coalesce(max(case_seq), 0) into v_return_seq
        from public.investigation_report_lifecycle_events
       where case_id = new.case_id and event_kind = 'hr_return';
      select max(case_seq) into v_adopt_seq
        from public.investigation_report_lifecycle_events
       where case_id = new.case_id and event_kind = 'adoption'
         and version_id = new.report_version_id;
      if coalesce(v_adopt_seq, -1) < v_return_seq then
        raise exception 'This investigation has been formally returned since the report was submitted. It cannot be approved on the returned version.'
          using errcode = 'check_violation';
      end if;
    end if;

    new.reviewed_by := v_actor;
    new.reviewed_at := now();

    -- A clarification question is recorded atomically with the transition.
    if new.status = 'clarification_requested' then
      if coalesce(btrim(new.comments), '') = '' then
        raise exception 'Requesting clarification needs a written question, which is recorded on the case.'
          using errcode = 'check_violation';
      end if;
      insert into public.hr_review_clarifications
        (review_id, org_id, case_id, round, question, asked_by)
      select new.id, new.org_id, new.case_id,
             coalesce(max(c.round), 0) + 1, btrim(new.comments), v_actor
        from public.hr_review_clarifications c where c.review_id = new.id;
    end if;
  elsif new.status = 'pending' and old.status is distinct from 'pending' then
    -- The ONLY permitted route back to pending is answering a clarification.
    if old.status is distinct from 'clarification_requested' then
      raise exception 'An HR review can only return to awaiting-decision by answering an outstanding clarification.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$function$;

-- ── 5. PROGRESSION CURRENCY GUARD ─────────────────────────────────────────
--
-- The progression boundary is NOT cases.stage. Production holds only
-- open/closed/appeal/inv_report; 'disciplinary' and 'outcome' are INFERRED
-- from cases.meetings and cases.outcome by inferDisciplinaryStage and are
-- never stored. A guard on the stage column would protect nothing.
--
-- So this fires when an UPDATE introduces a progression signal that was not
-- already there, judged by the SAME audited predicate the adoption RPC uses
-- (adoption_stage_block_reason) rather than a rival reimplementation.
--
-- Gated on report_regime = 'versioned', so it is inert for all 2963 existing
-- cases and begins protecting only after an organisation is activated.
create or replace function public.protect_progression_version_currency()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_before text;
  v_after text;
  v_current uuid;
  v_approved boolean;
begin
  if old.report_regime is distinct from 'versioned' then
    return new;
  end if;

  v_before := public.adoption_stage_block_reason(old.stage, old.outcome, old.meetings);
  v_after  := public.adoption_stage_block_reason(new.stage, new.outcome, new.meetings);

  -- No new progression signal: nothing to judge. This also lets a case be
  -- closed, and lets an already-progressed case continue to be edited.
  if v_after is null or v_after = coalesce(v_before, '~none~') then
    return new;
  end if;
  if coalesce(new.stage, '') = 'closed' then
    return new;
  end if;

  select v.id into v_current from public.investigation_report_versions v
   where v.case_id = old.id and v.is_current;

  if v_current is null then
    raise exception 'This case cannot move past the investigation report stage until an investigation report has been adopted.'
      using errcode = 'check_violation';
  end if;

  select exists (
    select 1 from public.hr_review_requests r
     where r.case_id = old.id
       and r.step = 'inv_report'
       and r.report_version_id = v_current
       and r.status in ('approved', 'progressed')
  ) into v_approved;

  if not v_approved then
    raise exception 'The investigation report currently on this case has not been approved by HR. Submit the adopted report for HR review before the case moves on.'
      using errcode = 'check_violation';
  end if;

  return new;
end;
$function$;

revoke all on function public.protect_progression_version_currency() from public;
revoke all on function public.protect_progression_version_currency() from anon;
revoke all on function public.protect_progression_version_currency() from authenticated;

create trigger protect_zzb_progression_currency_trg
  before update on public.cases
  for each row
  when (new.outcome is distinct from old.outcome
        or new.meetings is distinct from old.meetings
        or new.stage is distinct from old.stage)
  execute function public.protect_progression_version_currency();

-- ── 6. SUBMISSION RPC ─────────────────────────────────────────────────────
create or replace function public.submit_adopted_report_for_hr_review(
  p_case_id    uuid,
  p_version_id uuid,
  p_hr_reason  text default null
)
returns public.hr_review_requests
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_case public.cases;
  v_ver public.investigation_report_versions;
  v_row public.hr_review_requests;
  v_is_investigator boolean;
  v_is_hr boolean;
  v_reason text := nullif(btrim(coalesce(p_hr_reason, '')), '');
  v_member record;
begin
  if v_actor is null then
    raise exception 'Submitting an investigation report for HR review must be done by a signed-in user. An automated or service-role process cannot submit a report.'
      using errcode = '42501';
  end if;

  -- CASES ROW FIRST. Matches adopt_investigation_report_version, so the two
  -- serialise against each other and the ordering read below is stable.
  select * into v_case from public.cases where id = p_case_id for update;
  if v_case.id is null then
    raise exception 'That case does not exist' using errcode = '23503';
  end if;

  select exists (select 1 from public.case_access ca
                  where ca.case_id = p_case_id and ca.user_id = v_actor
                    and ca.role = 'investigator'),
         exists (select 1 from public.org_members om
                  where om.org_id = v_case.org_id and om.user_id = v_actor
                    and public.is_hr_role(om.role))
    into v_is_investigator, v_is_hr;

  if not v_is_investigator then
    if not v_is_hr then
      raise exception 'Only this case''s assigned investigator, or HR under a documented exception, can submit the investigation report for review'
        using errcode = '42501';
    end if;
    if v_reason is null then
      raise exception 'Submitting the report as HR rather than the assigned investigator requires a written reason, which is recorded in the case audit trail'
        using errcode = 'check_violation';
    end if;
  end if;

  if v_case.report_regime is distinct from 'versioned' then
    raise exception 'This case uses the existing investigation report route. Use the standard submission for it.'
      using errcode = 'check_violation';
  end if;

  select * into v_ver from public.investigation_report_versions where id = p_version_id;
  if v_ver.id is null then
    raise exception 'That investigation report version does not exist' using errcode = '23503';
  end if;

  -- Every remaining rule -- adopted, current, ordering, one-open-review --
  -- lives in the guard, so a direct INSERT is held to the same standard as
  -- this RPC rather than to a weaker one.
  insert into public.hr_review_requests
    (org_id, case_id, step, status, requested_by, requested_by_name,
     report_version_id, case_employee_name, comments)
  select v_case.org_id, p_case_id, 'inv_report', 'pending', v_actor,
         coalesce(om.name, 'Unknown'), p_version_id, v_case.employee_name,
         case when v_is_investigator then null
              else 'Submitted by HR rather than the assigned investigator. Reason: ' || v_reason end
    from public.org_members om
   where om.org_id = v_case.org_id and om.user_id = v_actor
  returning * into v_row;

  if v_row.id is null then
    raise exception 'The HR review could not be created for this submitter' using errcode = '42501';
  end if;

  select * into v_member from public.org_members
   where org_id = v_case.org_id and user_id = v_actor;

  insert into public.audit_log (org_id, user_id, user_name, action, detail, case_id)
  values (v_case.org_id, v_actor, coalesce(v_member.name, 'Unknown'),
          'Investigation report submitted for HR review',
          'Version ' || v_ver.version_no
            || case when v_is_investigator then ' — submitted by the assigned investigator'
                    else ' — submitted by HR. Reason: ' || v_reason end,
          p_case_id);

  return v_row;
end;
$function$;

revoke all on function public.submit_adopted_report_for_hr_review(uuid, uuid, text) from public;
revoke all on function public.submit_adopted_report_for_hr_review(uuid, uuid, text) from anon;
grant execute on function public.submit_adopted_report_for_hr_review(uuid, uuid, text) to authenticated;

-- ── 7. CLARIFICATION ANSWER RPC ───────────────────────────────────────────
create or replace function public.answer_hr_review_clarification(
  p_review_id uuid,
  p_response  text
)
returns public.hr_review_clarifications
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_review public.hr_review_requests;
  v_round public.hr_review_clarifications;
  v_is_investigator boolean;
  v_is_hr boolean;
  v_text text := nullif(btrim(coalesce(p_response, '')), '');
  v_n int;
begin
  if v_actor is null then
    raise exception 'Answering a clarification must be done by a signed-in user.' using errcode = '42501';
  end if;
  if v_text is null then
    raise exception 'A clarification needs a written answer.' using errcode = 'check_violation';
  end if;

  select * into v_review from public.hr_review_requests where id = p_review_id;
  if v_review.id is null then
    raise exception 'That review request does not exist' using errcode = '23503';
  end if;

  select exists (select 1 from public.case_access ca
                  where ca.case_id = v_review.case_id and ca.user_id = v_actor
                    and ca.role = 'investigator'),
         exists (select 1 from public.org_members om
                  where om.org_id = v_review.org_id and om.user_id = v_actor
                    and public.is_hr_role(om.role))
    into v_is_investigator, v_is_hr;

  if not (v_is_investigator or v_is_hr) then
    raise exception 'Only this case''s assigned investigator, or HR, can answer a clarification on it'
      using errcode = '42501';
  end if;

  if v_review.status is distinct from 'clarification_requested' then
    raise exception 'That review is not waiting for a clarification.' using errcode = 'check_violation';
  end if;

  update public.hr_review_clarifications
     set response = v_text, answered_by = v_actor, answered_at = now()
   where review_id = p_review_id and answered_at is null
  returning * into v_round;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'There is no outstanding question on that review.' using errcode = 'check_violation';
  end if;

  update public.hr_review_requests set status = 'pending' where id = p_review_id;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'The review could not be returned to awaiting decision.' using errcode = 'check_violation';
  end if;

  return v_round;
end;
$function$;

revoke all on function public.answer_hr_review_clarification(uuid, text) from public;
revoke all on function public.answer_hr_review_clarification(uuid, text) from anon;
grant execute on function public.answer_hr_review_clarification(uuid, text) to authenticated;

-- ── POST-CONDITIONS ──────────────────────────────────────────────────────
do $verify$
declare n int;
begin
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public'
     and c.relname in ('investigation_report_lifecycle_events', 'hr_review_clarifications');
  if n <> 2 then raise exception 'FAILED: expected 2 new tables, found %', n; end if;

  -- No client write privilege on either new table, on any of the three verbs
  -- plus TRUNCATE. This is the layer that beats RLS and triggers.
  -- service_role is included deliberately. A probe showed it could otherwise
  -- INSERT a forged adoption event, and the SECURITY DEFINER recorders do not
  -- need the grant.
  select count(*) into n
    from (values ('investigation_report_lifecycle_events'), ('hr_review_clarifications')) t(rel)
   cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
   cross join (values ('anon'), ('authenticated'), ('service_role')) r(role)
   where has_table_privilege(r.role, 'public.' || t.rel, p.priv);
  if n <> 0 then raise exception 'FAILED: % write privilege(s) remain on the new tables outside the definer functions', n; end if;

  select count(*) into n
    from (values ('investigation_report_lifecycle_events'), ('hr_review_clarifications')) t(rel)
   where not has_table_privilege('authenticated', 'public.' || t.rel, 'SELECT');
  if n <> 0 then raise exception 'FAILED: authenticated cannot SELECT a new table'; end if;

  -- Both new tables carry a COMPOSITE same-org reference to cases.
  select count(*) into n from pg_constraint
   where conrelid in ('public.investigation_report_lifecycle_events'::regclass,
                      'public.hr_review_clarifications'::regclass)
     and contype = 'f'
     and pg_get_constraintdef(oid) ilike '%(case_id, org_id) references cases(id, org_id)%';
  if n <> 2 then raise exception 'FAILED: expected 2 composite same-org FKs to cases, found %', n; end if;

  -- SECURITY DEFINER, owned by postgres, pinned search_path, no client EXECUTE
  -- on the trigger functions.
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('irle_append_only_guard', 'record_report_adoption_event',
                       'record_hr_return_event', 'hr_review_clarifications_append_only',
                       'hr_review_report_integrity_guard', 'protect_progression_version_currency')
     and p.prosecdef
     and pg_get_userbyid(p.proowner) = 'postgres'
     and 'search_path=public' = any (coalesce(p.proconfig, array[]::text[]));
  if n <> 6 then raise exception 'FAILED: expected 6 hardened trigger functions, found %', n; end if;

  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('irle_append_only_guard', 'record_report_adoption_event',
                       'record_hr_return_event', 'hr_review_clarifications_append_only',
                       'protect_progression_version_currency')
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if n <> 0 then raise exception 'FAILED: % trigger function(s) still executable by a client', n; end if;

  -- A1, A3a and A3b are untouched.
  if (select md5(prosrc) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'public' and p.proname = 'protect_adopted_investigation_report')
     is distinct from '85ba380f71d56ecf66daa2441d97dbdf' then
    raise exception 'FAILED: A1 changed';
  end if;
  if (select md5(prosrc) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname = 'public' and p.proname = 'adopt_investigation_report_version')
     is distinct from 'fb45b6388323936ce8e405614ecc2882' then
    raise exception 'FAILED: the adoption RPC changed';
  end if;

  select count(*) into n from public.investigation_report_lifecycle_events;
  if n <> 0 then raise exception 'FAILED: this migration wrote % lifecycle event(s)', n; end if;

  raise notice 'A3c revised: 2 tables, 6 hardened functions, composite tenancy FKs, no client writes, no rows written.';
end;
$verify$;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- ACTIVATION BLOCKERS, recorded rather than quietly handled
--
-- 1. STANDALONE MEETINGS. The progression guard reads cases.meetings, which is
--    what inferDisciplinaryStage reads. public.meetings is a SEPARATE store
--    with its own nullable case_id. If a disciplinary meeting can reach a case
--    through that table without cases.meetings changing, the guard does not
--    see it. This needs verifying against the application's write path before
--    any organisation is activated.
--
-- 2. APPLICATION WIRING. Nothing calls submit_adopted_report_for_hr_review yet;
--    finalizeInvestigationSubmission still inserts directly and does not await
--    requestHrReview (defect G6). The guard holds a direct INSERT to the same
--    rules, so integrity does not depend on the wiring -- but the versioned
--    route is not reachable from the UI until it is done.
--
-- 3. PLATFORM CORRECTION PATH. Terminal statuses are final for everyone,
--    including service_role and postgres, because triggers fire for
--    rolbypassrls roles. A mistaken 'closed' therefore has no in-product
--    remedy. If one is wanted it must be an audited SECURITY DEFINER RPC,
--    designed separately.
--
-- 4. supabase_admin DEFAULT PRIVILEGES. Still grant TRUNCATE on new tables in
--    public and cannot be altered by postgres. The explicit revokes above are
--    what protect these two tables; a future table created by supabase_admin
--    would inherit the grant again.
--
-- ROLLBACK
--
--   drop trigger if exists protect_zzb_progression_currency_trg on public.cases;
--   drop trigger if exists record_zz_hr_return_event_trg on public.hr_review_requests;
--   drop trigger if exists record_zz_adoption_event_trg on public.investigation_report_versions;
--   drop function if exists public.protect_progression_version_currency();
--   drop function if exists public.record_hr_return_event();
--   drop function if exists public.record_report_adoption_event();
--   drop function if exists public.submit_adopted_report_for_hr_review(uuid, uuid, text);
--   drop function if exists public.answer_hr_review_clarification(uuid, text);
--   drop table if exists public.hr_review_clarifications;
--   drop table if exists public.investigation_report_lifecycle_events;
--   drop function if exists public.hr_review_clarifications_append_only();
--   drop function if exists public.irle_append_only_guard();
--   alter table public.hr_review_requests drop constraint if exists hr_review_requests_id_case_key;
--   alter table public.investigation_report_versions drop constraint if exists investigation_report_versions_id_case_key;
--   -- and restore hr_review_report_integrity_guard to 08dc6b8b8c83cbec0951f2f7371d9faf
-- ════════════════════════════════════════════════════════════════════════════
