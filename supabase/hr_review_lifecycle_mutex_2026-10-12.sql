-- ════════════════════════════════════════════════════════════════════════════
-- B3 A3c (COORDINATED) — HR REVIEW LIFECYCLE UNDER A PER-CASE MUTEX
-- Candidate migration. NOT APPLIED.
--
-- Supersedes 3d0fba384e2898eec709355d9e71d51a0c7e751a42771595c810dc2cc1aa25be
-- (never applied), which used a per-case ADVISORY lock. That design admitted a
-- deadlock and the advisory lock is removed here entirely.
--
-- ── WHY THE ADVISORY LOCK WAS WRONG ─────────────────────────────────────────
--
-- The previous candidate claimed the advisory lock was a "leaf": nothing was
-- requested while holding it. Two facts falsify that.
--
--   1. pg_advisory_xact_lock is TRANSACTION-scoped. It is held until COMMIT,
--      so every lock the transaction takes afterwards is taken while holding
--      it -- including the adoption RPC's own cases mirror UPDATE and its
--      audit_log insert.
--   2. The event INSERT validates up to five foreign keys, and FK validation
--      takes a row lock on each parent. MEASURED, not assumed: inserting a
--      child row moved the parent cases row's xmax from 152436 to 152494 (the
--      probing transaction's own xid).
--
-- FOR KEY SHARE conflicts with FOR UPDATE, so:
--
--   T1 adoption:  holds cases[X] FOR UPDATE  -> waits for advisory(X)
--   T2 HR return: holds advisory(X)          -> waits for cases[X] KEY SHARE
--   T1 -> advisory(X) -> T2 -> cases[X] -> T1                        CYCLE
--
-- ── THE REPLACEMENT: THE CASE ROW IS THE MUTEX ──────────────────────────────
--
-- Every lifecycle path takes `select ... from public.cases where id = <case>
-- for update` as its FIRST lock, and only then touches a version or review
-- row. FOR UPDATE subsumes every KEY SHARE the FK checks need, so no lock
-- upgrade can occur, and case_seq is serialised by the mutex rather than by a
-- second lock type.
--
--   cases[X] FOR UPDATE
--      |-> investigation_report_versions[V]      row UPDATE / FK KEY SHARE
--      |-> hr_review_requests[R]                 INSERT or row UPDATE
--      |-> investigation_report_lifecycle_events INSERT (new row)
--      |-> audit_log                             INSERT (new row)
--      \-> FK KEY SHARE: organisations, auth.users (never held exclusively)
--
-- Every path is a prefix of that one order, so the wait-for graph is acyclic
-- by construction. adopt_investigation_report_version and
-- assign_investigation_report_version_no ALREADY take cases FOR UPDATE first,
-- verified verbatim in their live bodies, so they need no change and keep
-- their hashes.
--
-- ── THE ONE PATH THAT CANNOT TAKE THE CASE ROW FIRST ────────────────────────
--
-- A direct client `UPDATE hr_review_requests ...` locks the review tuple
-- before any BEFORE trigger runs. Nothing inside a trigger can undo that, so
-- that path can never join the protocol -- it is the other half of the cycle.
--
-- So it is REFUSED rather than tolerated, and the refusal is gated on
-- cases.report_regime = 'versioned'. That gate is not an arbitrary flag: it is
-- written only by A3a's operator-only activation RPC, no client holds a write
-- privilege on the table behind it, and activation is a separately approved
-- step. The consequences line up exactly:
--
--   TODAY (0 activated organisations, 0 versioned cases)
--     direct UPDATE keeps working -> no existing HR workflow breaks
--     and the deadlock is UNREACHABLE, because it needs an adoption, which
--     needs a versioned case
--
--   AFTER ACTIVATION
--     direct UPDATE on a versioned case is refused 42501 with a message
--     naming decide_hr_review() -> an outdated client bundle fails LOUDLY
--     instead of deadlocking
--
-- The window and the activation cannot coexist. There is therefore no interval
-- in which the old path can trigger the known deadlock.
--
-- WHERE THE ENFORCEMENT BOUNDARY ACTUALLY IS: THE PRIVILEGE, NOT A GATE.
--
-- Two in-trigger discriminators were tried and both rejected.
--
--   current_user <> 'postgres'   CANNOT WORK, and a probe proved it. This
--     guard is itself SECURITY DEFINER, so inside it current_user is always
--     the owner regardless of who issued the UPDATE. The property that lets
--     the guard read RLS-protected tables is exactly what blinds it to the
--     caller. A first probe appeared to pass only because the review was
--     already terminal and a different rule fired first.
--
--   a transaction-local GUC marker   WORKS but is CLIENT-FORGEABLE, because
--     set_config on a namespaced custom GUC needs no privilege. It was
--     demonstrated working, and demonstrated forgeable, and then REJECTED as
--     an enforcement boundary -- the same conclusion A3a reached about
--     compass.activating_org, and for the same reason: a boundary that can be
--     forged invites reliance it cannot carry.
--
-- So this migration contains NO cutover gate at all. The boundary is the
-- table privilege, applied at cutover stage 5:
--
--     revoke update on public.hr_review_requests from authenticated;
--
-- Table privileges are checked before RLS and before any trigger, cannot be
-- set_config'd, and cannot be reached by a role that is a member of nothing.
-- After the revoke the ONLY way to change a review row is through the
-- SECURITY DEFINER RPCs below, every one of which takes the case row FOR
-- UPDATE first -- so the mutex protocol is guaranteed by construction rather
-- than asserted by a trigger. An outdated client fails closed with
-- `42501 permission denied for table hr_review_requests`.
--
-- WHAT COVERS THE INTERIM. Between applying this migration and the revoke, a
-- direct UPDATE is still possible and could in principle invert the lock order
-- against decide_hr_review. That window is closed by SEQUENCING, not by a
-- gate: the deadlock needs an adoption, an adoption needs a versioned case,
-- and no organisation may be activated until the revoke is done. The drift
-- guard below refuses to apply if any organisation is already activated, so
-- the ordering cannot be got wrong by accident.
--
-- A third option -- an intent row in a table with no client write grant, which
-- WOULD be unforgeable -- was considered and not built. It would protect only
-- the interim above, which is already closed by ordering, at the cost of a
-- table, a trigger dependency and a cleanup path.
--
-- No api/ route writes hr_review_requests (api/_auth.js only reads it;
-- api/_platformAdmin.js is explicitly forbidden from touching it), so no
-- service-role path is affected either way.
--
-- ── DEPENDENCY ON THE ADOPTION PREDICATE FIX ────────────────────────────────
--
-- The progression guards call adoption_stage_block_reason. While that function
-- still reads `p_outcome is not null`, it returns a block reason for all 2963
-- production cases (cases.outcome is '' on 2825 of them and NULL on none), so
-- the guards would compare an identical reason before and after and stand down
-- -- inert for the wrong reason. The drift guard therefore asserts the fixed
-- BEHAVIOUR rather than a hash, so this migration cannot be applied before
-- adoption_outcome_predicate_fix_2026-10-12.sql
-- (SHA-256 2bbce8b3b1cd06bf6e48802ac245dc85345e6ba4a39202885077089950df6bd2),
-- which stays a separate artefact and is not reproduced here.
--
-- ── WHAT THIS DOES NOT TOUCH ────────────────────────────────────────────────
--
-- A1, A3a, A3b, adopt_investigation_report_version,
-- save_investigation_report_version, the author guard, the version-numbering
-- trigger, the version immutability guard, adoption_stage_block_reason, every
-- existing policy, and every existing privilege on every existing table.
-- No privilege is revoked from authenticated on hr_review_requests here; that
-- is cutover stage 5 and is deliberately out of this migration.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── DRIFT GUARD ───────────────────────────────────────────────────────────
do $guard$
declare
  v text;
  v_pairs text[][] := array[
    ['protect_adopted_investigation_report',          '85ba380f71d56ecf66daa2441d97dbdf'],
    ['stamp_case_report_regime',                      '247284ee9eca33e72bc6d005f0e16830'],
    ['protect_case_report_regime',                    '684666d4f922b92401c3e8ad556a9834'],
    ['protect_versioned_case_legacy_report',          '64e43642a994499687780a3719c121c0'],
    ['adopt_investigation_report_version',            'fb45b6388323936ce8e405614ecc2882'],
    ['save_investigation_report_version',             'fb626a16d73a3470f48f02510a2df730'],
    ['hr_review_report_integrity_guard',              '08dc6b8b8c83cbec0951f2f7371d9faf'],
    ['investigation_report_versions_author_guard',    'c25056999f07a5d789a1ec0034e9204e'],
    ['assign_investigation_report_version_no',        'fc76a8f6adb17d4f40c2e988143062d0'],
    ['is_platform_admin',                             '1e6e04db46218a797b81d6b9123084fa']
  ];
  i int;
begin
  for i in 1 .. array_length(v_pairs, 1) loop
    select md5(prosrc) into v from pg_proc p
      join pg_namespace n on n.oid = p.pronamespace
     where n.nspname = 'public' and p.proname = v_pairs[i][1];
    if v is distinct from v_pairs[i][2] then
      raise exception 'DRIFT: %() is %, expected %.', v_pairs[i][1], coalesce(v,'MISSING'), v_pairs[i][2];
    end if;
  end loop;

  -- PREREQUISITE, asserted as behaviour rather than as a hash: the adoption
  -- predicate fix must already be applied, or the progression guards below are
  -- inert for the wrong reason.
  if public.adoption_stage_block_reason('open', '', '[]'::jsonb) is not null then
    raise exception 'PREREQUISITE MISSING: adoption_stage_block_reason still treats an empty-string outcome as a recorded outcome. Apply adoption_outcome_predicate_fix_2026-10-12.sql (2bbce8b3...) first, or the progression guards in this migration will never fire.';
  end if;
  if public.adoption_stage_block_reason('open', 'Dismissal with notice', '[]'::jsonb) is null then
    raise exception 'PREREQUISITE BROKEN: a genuine outcome no longer blocks adoption.';
  end if;

  -- The lock protocol depends on these two taking the case row FOR UPDATE
  -- first. Asserted against the live bodies, not assumed from the hashes.
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='adopt_investigation_report_version')
     !~ 'from public\.cases where id = v_row\.case_id for update' then
    raise exception 'DRIFT: the adoption RPC no longer locks the case row FOR UPDATE; the mutex protocol would be incomplete.';
  end if;
  if (select prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname='public' and p.proname='assign_investigation_report_version_no')
     !~ 'from public\.cases where id = new\.case_id for update' then
    raise exception 'DRIFT: the version-numbering trigger no longer locks the case row FOR UPDATE.';
  end if;

  if not exists (select 1 from pg_constraint
                  where conrelid = 'public.cases'::regclass and contype in ('u','p')
                    and pg_get_constraintdef(oid) ilike '%(id, org_id)%') then
    raise exception 'DRIFT: cases has no UNIQUE/PK on (id, org_id); the composite tenancy FKs cannot be declared.';
  end if;
  if not exists (select 1 from pg_attribute
                  where attrelid = 'public.cases'::regclass
                    and attname = 'report_regime' and not attisdropped) then
    raise exception 'DRIFT: cases.report_regime is missing. A3a must be applied first.';
  end if;

  -- Trigger firing order on cases is alphabetical. The new guards must sort
  -- after A3a's regime stamp (which sets new.report_regime) and after A3b.
  if not ('protect_zzc_progression_insert_trg' > 'protect_zza_versioned_legacy_report_ins_trg'
          and 'protect_zzc_progression_insert_trg' > 'protect_zz_stamp_report_regime_trg'
          and 'protect_zzd_progression_update_trg' > 'protect_zza_versioned_legacy_report_upd_trg') then
    raise exception 'DRIFT: the proposed trigger names would not fire after A3a/A3b.';
  end if;

  -- No organisation may be activated while this is applied: the refusal gate
  -- turns on with activation, and the client must be wired first.
  if (select count(*) from public.organisation_report_settings) <> 0 then
    raise exception 'REFUSED: % organisation(s) are already activated. This migration must be applied BEFORE any activation, so that the fail-closed refusal cannot strand a live HR review workflow. See the cutover plan.',
      (select count(*) from public.organisation_report_settings);
  end if;
end;
$guard$;

-- ── SUPPORTING UNIQUE CONSTRAINTS ─────────────────────────────────────────
-- Redundant alone (id is already unique) and that is the point: they are what
-- let a composite foreign key bind a referenced row to the SAME case, making a
-- lifecycle event that names another case's version or review unrepresentable
-- rather than merely trigger-checked.
alter table public.investigation_report_versions
  add constraint investigation_report_versions_id_case_key unique (id, case_id);
alter table public.hr_review_requests
  add constraint hr_review_requests_id_case_key unique (id, case_id);

-- ── 1. IMMUTABLE LIFECYCLE HISTORY ────────────────────────────────────────
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

  constraint irle_case_same_org_fkey
    foreign key (case_id, org_id) references public.cases(id, org_id) on delete cascade,
  constraint irle_org_fkey
    foreign key (org_id) references public.organisations(id) on delete cascade,
  constraint irle_version_same_case_fkey
    foreign key (version_id, case_id)
      references public.investigation_report_versions(id, case_id) on delete cascade,
  constraint irle_review_same_case_fkey
    foreign key (review_request_id, case_id)
      references public.hr_review_requests(id, case_id) on delete cascade,

  -- Not the concurrency control -- the case-row mutex is. This is the backstop
  -- that turns a hypothetical lost update into a hard 23505.
  constraint irle_case_seq_unique unique (case_id, case_seq)
);

comment on table public.investigation_report_lifecycle_events is
  'Append-only, per-case ordering of the two events that decide whether an investigation report may be submitted for HR review: adoption of a version, and a formal HR return. case_seq is assigned under the case-row mutex (cases FOR UPDATE) and is gap-free within a case. Written only by SECURITY DEFINER triggers on the state transitions themselves, so no code path can skip recording one; no client role holds any write privilege, service_role included. ON DELETE CASCADE from the case is deliberate: audit_log carries the durable record of these facts with case_id ON DELETE SET NULL, while these rows are case-scoped operational metadata carrying an actor identity and must not survive an authorised erasure.';

create index irle_case_kind_seq_idx
  on public.investigation_report_lifecycle_events (case_id, event_kind, case_seq desc);
create index irle_version_idx
  on public.investigation_report_lifecycle_events (version_id) where version_id is not null;

revoke all on public.investigation_report_lifecycle_events from public;
revoke all on public.investigation_report_lifecycle_events from anon;
revoke all on public.investigation_report_lifecycle_events from authenticated;
grant select on public.investigation_report_lifecycle_events to authenticated;
-- service_role too. A probe on the previous candidate showed that with only
-- anon/authenticated revoked, service_role INSERTed a forged adoption event.
-- The recorders are SECURITY DEFINER owned by postgres, so they write
-- regardless of the CALLER's grants; revoking these leaves the two trigger
-- functions as the only writers in the system. TRUNCATE is revoked even though
-- the 2026-10-11 hardening deliberately left service_role holding it on every
-- other table: this one is append-only and no administrative operation has a
-- reason to empty it.
revoke insert, update, delete, truncate on public.investigation_report_lifecycle_events from service_role;
revoke all on sequence public.investigation_report_lifecycle_events_id_seq from public;
revoke all on sequence public.investigation_report_lifecycle_events_id_seq from anon;
revoke all on sequence public.investigation_report_lifecycle_events_id_seq from authenticated;

alter table public.investigation_report_lifecycle_events enable row level security;

create policy irle_select_case_scoped
  on public.investigation_report_lifecycle_events for select
  using (exists (select 1 from public.cases c
                  where c.id = investigation_report_lifecycle_events.case_id));

create or replace function public.irle_append_only_guard()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    -- THE CASCADE ESCAPE HATCH, and it is load-bearing. A BEFORE DELETE
    -- trigger that raises unconditionally also blocks the ON DELETE CASCADE
    -- from cases, so "Delete all data" fails with a check_violation instead of
    -- erasing the tenant. A probe on the previous candidate caught exactly
    -- that. PostgreSQL runs the FK cascade after the parent row is gone, so a
    -- missing parent is the reliable signature of an authorised deletion. Same
    -- idiom investigation_report_versions_immutability_guard already uses.
    if not exists (select 1 from public.cases where id = old.case_id) then return old; end if;
    if not exists (select 1 from public.organisations where id = old.org_id) then return old; end if;
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

-- ── 2. THE RECORDERS, UNDER THE MUTEX ─────────────────────────────────────
-- No advisory lock. Each takes the case row FOR UPDATE, which is a no-op when
-- the calling path already holds it (every supported path does) and which
-- establishes the mutex if a privileged operator writes directly.

create or replace function public.record_report_adoption_event()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare v_seq int;
begin
  perform 1 from public.cases where id = new.case_id for update;
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
  perform 1 from public.cases where id = new.case_id for update;
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

  constraint hr_review_clarifications_case_same_org_fkey
    foreign key (case_id, org_id) references public.cases(id, org_id) on delete cascade,
  constraint hr_review_clarifications_review_same_case_fkey
    foreign key (review_id, case_id)
      references public.hr_review_requests(id, case_id) on delete cascade
);

comment on table public.hr_review_clarifications is
  'One row per clarification round on an HR review: HR''s question with its author and time, and the investigator''s response with theirs. Append-only for the question, write-once for the answer. Written only by hr_review_report_integrity_guard (the question, atomically with the status transition) and answer_hr_review_clarification (the response); no client role holds any write privilege, service_role included. Content is personal data about a named employee, is DSAR-reviewable, and must never be released automatically -- a round can quote a witness or a third party, so it needs the same human review and redaction as a meeting record.';

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
revoke insert, update, delete, truncate on public.hr_review_clarifications from service_role;

alter table public.hr_review_clarifications enable row level security;

-- Delegated to the caller's own `cases` RLS, which is RESTRICTIVE and resolves
-- to: org_members.case_access_level = 1, OR level 2 and the case's creator, OR
-- an explicit case_access row. Measured: 0 cross-tenant rows across three
-- identities, and the assigned investigator DOES reach their own case's rows,
-- which an is_hr_role predicate would have cut off -- they are the person
-- required to answer.
create policy hr_review_clarifications_select_case_scoped
  on public.hr_review_clarifications for select
  using (exists (select 1 from public.cases c where c.id = hr_review_clarifications.case_id));

create or replace function public.hr_review_clarifications_append_only()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    -- Same cascade escape hatch as irle_append_only_guard; see the comment
    -- there. Without it the authorised tenant erasure fails outright.
    if not exists (select 1 from public.cases where id = old.case_id) then return old; end if;
    if not exists (select 1 from public.organisations where id = old.org_id) then return old; end if;
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

-- ── 4. STATUS VOCABULARY, AS DATA ─────────────────────────────────────────
-- The full live vocabulary, read from the application rather than invented:
--
--   pending                  requestHrReview INSERT
--   approved                 ApprovalsPanel.jsx:40, resolveInvestigationReview
--   rejected                 ApprovalsPanel.jsx:41
--   resolved                 AskHrPanel.jsx:38
--   returned                 resolveInvestigationReview
--   closed                   resolveInvestigationReview
--   progressed               resolveInvestigationReview
--   taken_over               resolveInvestigationReview
--   clarification_requested  resolveInvestigationReview
--
-- The previous candidate's terminal set omitted `rejected` and `resolved`,
-- which are written by two live client code paths. They are terminal here.
--
-- taken_over is deliberately NOT terminal: its handler sets the case manager
-- and grants case_owner and does not close or progress anything, so HR who
-- have taken a case over may still need to resolve the same review afterwards.
-- clarification_requested is intermediate; the ONLY route back to pending is
-- answer_hr_review_clarification.
create or replace function public.hr_review_known_statuses()
returns text[] language sql immutable set search_path to 'public'
as $function$
  select array['pending','approved','rejected','resolved','returned',
               'closed','progressed','taken_over','clarification_requested']
$function$;

create or replace function public.hr_review_terminal_statuses()
returns text[] language sql immutable set search_path to 'public'
as $function$
  select array['approved','rejected','resolved','returned','closed','progressed']
$function$;

revoke all on function public.hr_review_known_statuses() from public;
revoke all on function public.hr_review_terminal_statuses() from public;
grant execute on function public.hr_review_known_statuses() to authenticated, service_role;
grant execute on function public.hr_review_terminal_statuses() to authenticated, service_role;

-- ── 5. THE HR REVIEW GUARD ────────────────────────────────────────────────
create or replace function public.hr_review_report_integrity_guard()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_privileged boolean := coalesce(auth.role(), '') = 'service_role';
  v_actor uuid := case when v_privileged then null else auth.uid() end;
  v_ver public.investigation_report_versions;
  v_regime text;
  v_return_seq int;
  v_adopt_seq int;
  v_open int;
  v_name text;
begin
  select report_regime into v_regime from public.cases where id = new.case_id;

  -- ── version sanity, on both INSERT and UPDATE ──
  if new.report_version_id is not null then
    select * into v_ver from public.investigation_report_versions where id = new.report_version_id;
    if v_ver.id is null then
      raise exception 'That report version does not exist' using errcode = '23503'; end if;
    if v_ver.adopted_at is null then
      raise exception 'A report must be adopted before it can be submitted for HR review'
        using errcode = 'check_violation'; end if;
    if v_ver.case_id is distinct from new.case_id then
      raise exception 'That report version belongs to a different case'
        using errcode = 'check_violation'; end if;
  end if;

  -- Unknown statuses fail closed on every path.
  if not (new.status = any (public.hr_review_known_statuses())) then
    raise exception 'Unrecognised HR review status "%". A new status must be introduced deliberately, in a migration, with its terminal and progression meaning decided.',
      new.status using errcode = 'check_violation';
  end if;

  if tg_op = 'INSERT' then
    if new.report_version_id is not null then
      if not v_ver.is_current then
        raise exception 'That report version has been superseded by a later adoption. Submit the current adopted report.'
          using errcode = 'check_violation'; end if;

      select coalesce(max(case_seq), 0) into v_return_seq
        from public.investigation_report_lifecycle_events
       where case_id = new.case_id and event_kind = 'hr_return';
      select max(case_seq) into v_adopt_seq
        from public.investigation_report_lifecycle_events
       where case_id = new.case_id and event_kind = 'adoption'
         and version_id = new.report_version_id;

      if v_adopt_seq is null then
        raise exception 'That report was not adopted through the recorded process, so its place in the case history cannot be established.'
          using errcode = 'check_violation'; end if;
      if v_adopt_seq < v_return_seq then
        raise exception 'HR returned this investigation for further work. Adopt a version after the return before submitting it again.'
          using errcode = 'check_violation'; end if;

      -- Complements hr_review_requests_one_pending_per_step and
      -- hr_review_requests_one_open_inv_report, which cover status='pending'
      -- only. This adds clarification_requested, which both indexes miss, and
      -- reports a readable reason rather than a 23505.
      select count(*) into v_open from public.hr_review_requests rr
       where rr.case_id = new.case_id and rr.step = new.step
         and rr.status in ('pending', 'clarification_requested');
      if v_open > 0 then
        raise exception 'An HR review of this investigation is already open. It must be decided before another is submitted.'
          using errcode = 'check_violation'; end if;
    end if;
    return new;
  end if;

  -- ══ UPDATE ══
  -- There is deliberately no path discriminator here. See this migration's
  -- header: the direct-UPDATE path is closed by revoking the table privilege
  -- at cutover stage 5, not by a trigger test. Every rule below therefore
  -- applies identically to the RPCs and to any privileged direct write, which
  -- is the posture that holds whether or not the revoke has happened yet.
  -- The decision identity is the database's, never the client's, on every path
  -- and not only on a status change.
  new.reviewed_at := old.reviewed_at;
  new.reviewed_by := old.reviewed_by;
  new.reviewed_by_name := old.reviewed_by_name;

  if new.report_version_id is distinct from old.report_version_id then
    raise exception 'The report version under review cannot be changed. Submit a new review instead.'
      using errcode = 'check_violation'; end if;

  -- A RESOLVED REVIEW IS FROZEN, not merely un-reversible. A probe found that
  -- gating only on a status CHANGE left `comments` editable after the
  -- decision -- and comments is the recorded decision note, and carries the
  -- substantive reason for a discontinuation. Rewriting it after the fact
  -- would alter the audit record of a decision that has already been acted on.
  if old.status = any (public.hr_review_terminal_statuses()) then
    if new.status is distinct from old.status then
      raise exception 'That HR review is already resolved as "%" and cannot be reopened. Submit a new review instead.',
        old.status using errcode = 'check_violation'; end if;
    if new.comments is distinct from old.comments then
      raise exception 'The decision note on a resolved HR review cannot be rewritten. Record anything further on the case instead.'
        using errcode = 'check_violation'; end if;
  end if;

  if new.status is distinct from old.status and new.status <> 'pending' then
    if v_actor is null then
      raise exception 'An HR review decision must be made by a signed-in HR user. An automated or service-role process cannot decide a review.'
        using errcode = '42501'; end if;
    if not exists (select 1 from public.org_members om
                    where om.org_id = new.org_id and om.user_id = v_actor
                      and public.is_hr_role(om.role)) then
      raise exception 'Only HR can decide an HR review' using errcode = '42501'; end if;
    if v_actor = old.requested_by then
      raise exception 'You cannot decide an HR review that you submitted' using errcode = '42501'; end if;
    if new.report_version_id is not null and v_ver.adopted_by = v_actor then
      raise exception 'You cannot decide an HR review of a report that you adopted' using errcode = '42501'; end if;

    -- Approval requires currency AND ordering, re-checked at decision time: a
    -- return or a newer adoption may have landed since submission.
    if new.status in ('approved', 'progressed') and new.report_version_id is not null then
      if not v_ver.is_current then
        raise exception 'A newer investigation report has since been adopted on this case. Return this review, or ask for the current version to be submitted.'
          using errcode = 'check_violation'; end if;
      select coalesce(max(case_seq), 0) into v_return_seq
        from public.investigation_report_lifecycle_events
       where case_id = new.case_id and event_kind = 'hr_return';
      select max(case_seq) into v_adopt_seq
        from public.investigation_report_lifecycle_events
       where case_id = new.case_id and event_kind = 'adoption'
         and version_id = new.report_version_id;
      if coalesce(v_adopt_seq, -1) < v_return_seq then
        raise exception 'This investigation has been formally returned since the report was submitted. It cannot be approved on the returned version.'
          using errcode = 'check_violation'; end if;
    end if;

    -- SERVER-STAMPED REVIEWER IDENTITY. The previous candidate discarded the
    -- client's reviewed_by_name without replacing it, which would have left it
    -- NULL on every decision -- a visible regression: all 20 decided reviews in
    -- production have it populated and none is NULL. Discarding an untrusted
    -- value is only half the job.
    select om.name into v_name from public.org_members om
     where om.org_id = new.org_id and om.user_id = v_actor;
    new.reviewed_by := v_actor;
    new.reviewed_at := now();
    new.reviewed_by_name := coalesce(v_name, 'Unknown');

    if new.status = 'clarification_requested' then
      if coalesce(btrim(new.comments), '') = '' then
        raise exception 'Requesting clarification needs a written question, which is recorded on the case.'
          using errcode = 'check_violation'; end if;
      insert into public.hr_review_clarifications
        (review_id, org_id, case_id, round, question, asked_by)
      select new.id, new.org_id, new.case_id,
             coalesce(max(c.round), 0) + 1, btrim(new.comments), v_actor
        from public.hr_review_clarifications c where c.review_id = new.id;
    end if;
  elsif new.status = 'pending' and old.status is distinct from 'pending' then
    if old.status is distinct from 'clarification_requested' then
      raise exception 'An HR review can only return to awaiting-decision by answering an outstanding clarification.'
        using errcode = 'check_violation'; end if;
  end if;

  return new;
end;
$function$;

-- ── 6. DECISION RPC ───────────────────────────────────────────────────────
create or replace function public.decide_hr_review(
  p_review_id uuid,
  p_status    text,
  p_comments  text default null
)
returns public.hr_review_requests
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_review public.hr_review_requests;
  v_row public.hr_review_requests;
  v_comments text := nullif(btrim(coalesce(p_comments, '')), '');
  v_n int;
begin
  if coalesce(auth.role(), '') = 'service_role' or v_actor is null then
    raise exception 'An HR review decision must be made by a signed-in HR user. An automated or service-role process cannot decide a review.'
      using errcode = '42501';
  end if;
  if not (p_status = any (public.hr_review_known_statuses())) then
    raise exception 'Unrecognised HR review status "%".', p_status using errcode = 'check_violation';
  end if;
  if p_status = 'pending' then
    raise exception 'A review cannot be decided back to awaiting-decision. Answer the outstanding clarification instead.'
      using errcode = 'check_violation';
  end if;

  -- Unlocked read, ONLY to find the case. Every decision below is made against
  -- the re-read copy inside the mutex.
  select * into v_review from public.hr_review_requests where id = p_review_id;
  if v_review.id is null then
    raise exception 'That review request does not exist' using errcode = '23503';
  end if;

  -- ── THE MUTEX: case row first, always ──
  perform 1 from public.cases where id = v_review.case_id for update;

  -- Re-read under the lock. Its status may have moved while we waited.
  select * into v_review from public.hr_review_requests where id = p_review_id;

  -- ── REPLAY SAFETY ──
  -- An exact replay returns the original decision and writes nothing. A
  -- conflicting retry is refused rather than silently accepted.
  if v_review.status = p_status then
    if v_review.reviewed_by is not distinct from v_actor
       and coalesce(btrim(v_review.comments), '') = coalesce(v_comments, '') then
      return v_review;
    end if;
    raise exception 'This review has already been decided as "%" by someone else, or with a different note. Reload and review the current decision before retrying.',
      v_review.status using errcode = 'check_violation';
  end if;

  if v_review.status = any (public.hr_review_terminal_statuses()) then
    raise exception 'That HR review is already resolved as "%" and cannot be reopened. Submit a new review instead.',
      v_review.status using errcode = 'check_violation';
  end if;

  -- The guard enforces authority, independence, currency, ordering, the
  -- clarification round and the server-stamped identity. It is deliberately
  -- NOT duplicated here: a direct privileged UPDATE must be held to the same
  -- standard as this RPC, not a weaker one.
  update public.hr_review_requests
     set status = p_status,
         comments = coalesce(v_comments, comments)
   where id = p_review_id
  returning * into v_row;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'The HR review could not be updated.' using errcode = 'check_violation';
  end if;

  insert into public.audit_log (org_id, user_id, user_name, action, detail, case_id)
  values (v_row.org_id, v_actor, coalesce(v_row.reviewed_by_name, 'Unknown'),
          'HR review decision: ' || p_status,
          'Step ' || v_row.step
            || case when v_row.report_version_id is not null
                    then ' — report version ' ||
                         (select version_no::text from public.investigation_report_versions
                           where id = v_row.report_version_id)
                    else '' end
            || coalesce(' — ' || v_comments, ''),
          v_row.case_id);

  return v_row;
end;
$function$;

revoke all on function public.decide_hr_review(uuid, text, text) from public;
revoke all on function public.decide_hr_review(uuid, text, text) from anon;
grant execute on function public.decide_hr_review(uuid, text, text) to authenticated;

-- ── 7. DISCONTINUATION ────────────────────────────────────────────────────
-- NOT an escape from independent review. It requires HR authority, refuses the
-- submitter of the open review (so the person who asked for review cannot
-- dismiss their own request), demands a substantive written reason, resolves
-- the review to a terminal status rather than abandoning it, and audits the
-- decision. Only then is the case closed.
--
-- It reuses the existing 'closed' status rather than introducing a tenth one,
-- so no client status vocabulary changes; the reason lives in comments and in
-- a distinct audit action.
create or replace function public.discontinue_investigation(
  p_case_id uuid,
  p_reason  text
)
returns public.hr_review_requests
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_case public.cases;
  v_review public.hr_review_requests;
  v_row public.hr_review_requests;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_name text;
  v_n int;
begin
  if coalesce(auth.role(), '') = 'service_role' or v_actor is null then
    raise exception 'Discontinuing an investigation must be done by a signed-in HR user.'
      using errcode = '42501';
  end if;
  if v_reason is null or length(v_reason) < 20 then
    raise exception 'Discontinuing an investigation requires a written reason of at least 20 characters, which is recorded against the review and in the case audit trail.'
      using errcode = 'check_violation';
  end if;

  perform 1 from public.cases where id = p_case_id for update;
  select * into v_case from public.cases where id = p_case_id;
  if v_case.id is null then
    raise exception 'That case does not exist' using errcode = '23503';
  end if;

  if not exists (select 1 from public.org_members om
                  where om.org_id = v_case.org_id and om.user_id = v_actor
                    and public.is_hr_role(om.role)) then
    raise exception 'Only HR can discontinue an investigation' using errcode = '42501';
  end if;

  select * into v_review from public.hr_review_requests
   where case_id = p_case_id and step = 'inv_report'
     and status in ('pending', 'clarification_requested')
   order by requested_at desc limit 1;

  if v_review.id is null then
    raise exception 'There is no open investigation review on this case to discontinue. Close the case in the normal way.'
      using errcode = 'check_violation';
  end if;

  -- INDEPENDENCE, PRESERVED. The person who submitted the review cannot
  -- discontinue it. If they are the only available HR user, the correct route
  -- is escalate_blocked_hr_review -- which records the blockage and does NOT
  -- decide the review.
  if v_actor = v_review.requested_by then
    raise exception 'You submitted this investigation for review, so you cannot discontinue it. If no independent HR reviewer is available, record that with escalate_blocked_hr_review().'
      using errcode = '42501';
  end if;

  select om.name into v_name from public.org_members om
   where om.org_id = v_case.org_id and om.user_id = v_actor;

  update public.hr_review_requests
     set status = 'closed',
         comments = 'Investigation discontinued — no further action. ' || v_reason
   where id = v_review.id
  returning * into v_row;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'The open review could not be resolved.' using errcode = 'check_violation';
  end if;

  insert into public.audit_log (org_id, user_id, user_name, action, detail, case_id)
  values (v_case.org_id, v_actor, coalesce(v_name, 'Unknown'),
          'Investigation discontinued — no further action',
          'Open HR review resolved as closed without a decision on the report. Reason: ' || v_reason,
          p_case_id);

  -- The case may now be closed: no review remains open, so the closure
  -- safeguard stands down. protect_case_closure still requires HR.
  update public.cases set stage = 'closed' where id = p_case_id;
  get diagnostics v_n = row_count;
  if v_n <> 1 then
    raise exception 'The case could not be closed.' using errcode = 'check_violation';
  end if;

  return v_row;
end;
$function$;

revoke all on function public.discontinue_investigation(uuid, text) from public;
revoke all on function public.discontinue_investigation(uuid, text) from anon;
grant execute on function public.discontinue_investigation(uuid, text) to authenticated;

-- ── 8. ESCALATION ─────────────────────────────────────────────────────────
-- Records that an HR review cannot be decided independently, and NOTHING else.
-- It does not approve, reject, return or close anything; the review stays
-- exactly where it was, visible and pending. This is the authorised path for
-- "no independent reviewer is available" -- the alternative being a silent
-- bypass, which is what this exists to prevent.
create or replace function public.escalate_blocked_hr_review(
  p_review_id uuid,
  p_reason    text
)
returns public.audit_log
language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_review public.hr_review_requests;
  v_reason text := nullif(btrim(coalesce(p_reason, '')), '');
  v_name text;
  v_audit public.audit_log;
  v_status_before text;
begin
  if coalesce(auth.role(), '') = 'service_role' or v_actor is null then
    raise exception 'Escalating a blocked HR review must be done by a signed-in HR user.'
      using errcode = '42501';
  end if;
  if v_reason is null or length(v_reason) < 20 then
    raise exception 'Escalating a blocked HR review requires a written explanation of at least 20 characters.'
      using errcode = 'check_violation';
  end if;

  select * into v_review from public.hr_review_requests where id = p_review_id;
  if v_review.id is null then
    raise exception 'That review request does not exist' using errcode = '23503';
  end if;

  perform 1 from public.cases where id = v_review.case_id for update;
  select * into v_review from public.hr_review_requests where id = p_review_id;
  v_status_before := v_review.status;

  if not exists (select 1 from public.org_members om
                  where om.org_id = v_review.org_id and om.user_id = v_actor
                    and public.is_hr_role(om.role)) then
    raise exception 'Only HR can escalate a blocked HR review' using errcode = '42501';
  end if;
  if v_review.status not in ('pending', 'clarification_requested') then
    raise exception 'That review is already resolved as "%", so there is nothing to escalate.',
      v_review.status using errcode = 'check_violation';
  end if;

  select om.name into v_name from public.org_members om
   where om.org_id = v_review.org_id and om.user_id = v_actor;

  insert into public.audit_log (org_id, user_id, user_name, action, detail, case_id)
  values (v_review.org_id, v_actor, coalesce(v_name, 'Unknown'),
          'HR review escalated as blocked',
          'Step ' || v_review.step || ' — the review remains open and undecided. Reason: ' || v_reason,
          v_review.case_id)
  returning * into v_audit;

  -- Asserted, not assumed: escalation must not have moved the review.
  if (select status from public.hr_review_requests where id = p_review_id)
     is distinct from v_status_before then
    raise exception 'Escalation must not change the review status.' using errcode = 'check_violation';
  end if;

  return v_audit;
end;
$function$;

revoke all on function public.escalate_blocked_hr_review(uuid, text) from public;
revoke all on function public.escalate_blocked_hr_review(uuid, text) from anon;
grant execute on function public.escalate_blocked_hr_review(uuid, text) to authenticated;

-- ── 9. SUBMISSION RPC ─────────────────────────────────────────────────────
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
  if coalesce(auth.role(), '') = 'service_role' or v_actor is null then
    raise exception 'Submitting an investigation report for HR review must be done by a signed-in user.'
      using errcode = '42501';
  end if;

  -- MUTEX: case row first, matching adopt_investigation_report_version.
  perform 1 from public.cases where id = p_case_id for update;
  select * into v_case from public.cases where id = p_case_id;
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
        using errcode = '42501'; end if;
    if v_reason is null then
      raise exception 'Submitting the report as HR rather than the assigned investigator requires a written reason, which is recorded in the case audit trail'
        using errcode = 'check_violation'; end if;
  end if;

  if v_case.report_regime is distinct from 'versioned' then
    raise exception 'This case uses the existing investigation report route. Use the standard submission for it.'
      using errcode = 'check_violation';
  end if;

  select * into v_ver from public.investigation_report_versions where id = p_version_id;
  if v_ver.id is null then
    raise exception 'That investigation report version does not exist' using errcode = '23503';
  end if;

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

-- ── 10. CLARIFICATION ANSWER RPC ──────────────────────────────────────────
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
  if coalesce(auth.role(), '') = 'service_role' or v_actor is null then
    raise exception 'Answering a clarification must be done by a signed-in user.' using errcode = '42501';
  end if;
  if v_text is null then
    raise exception 'A clarification needs a written answer.' using errcode = 'check_violation';
  end if;

  select * into v_review from public.hr_review_requests where id = p_review_id;
  if v_review.id is null then
    raise exception 'That review request does not exist' using errcode = '23503';
  end if;

  -- MUTEX: case row first, so answering serialises against adoption and
  -- decision on the same case.
  perform 1 from public.cases where id = v_review.case_id for update;
  select * into v_review from public.hr_review_requests where id = p_review_id;

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

-- ── 11. PROGRESSION AND CLOSURE PROTECTION ────────────────────────────────
--
-- The progression boundary is NOT cases.stage. Production holds only
-- open/closed/appeal/inv_report; 'disciplinary' and 'outcome' are INFERRED
-- from cases.meetings and cases.outcome by inferDisciplinaryStage and are
-- never stored, so a guard on the stage column would protect nothing.
--
-- These fire on a newly-introduced progression signal, judged by the SAME
-- audited predicate the adoption RPC uses rather than a rival
-- reimplementation, and are gated on report_regime = 'versioned' so they are
-- inert for all 2963 existing cases.
create or replace function public.protect_progression_version_currency()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
declare
  v_before text; v_after text; v_current uuid; v_approved boolean; v_open int;
begin
  if old.report_regime is distinct from 'versioned' then
    return new;
  end if;

  -- CLOSURE SAFEGUARD. An unresolved mandatory investigation review may not be
  -- bypassed by closing the case directly; discontinue_investigation() is the
  -- audited route, and it resolves the review before closing. Deliberately
  -- scoped to step 'inv_report' and to versioned cases, so none of the 119
  -- currently-pending reviews on legacy cases is affected.
  if coalesce(new.stage, '') = 'closed' and coalesce(old.stage, '') <> 'closed' then
    select count(*) into v_open from public.hr_review_requests rr
     where rr.case_id = old.id and rr.step = 'inv_report'
       and rr.status in ('pending', 'clarification_requested');
    if v_open > 0 then
      raise exception 'This case has an investigation review still awaiting an HR decision. Resolve it, or discontinue the investigation with a recorded reason, before closing the case.'
        using errcode = 'check_violation';
    end if;
    -- Closing is otherwise always permitted: a case can legitimately end with
    -- no report at all, and refusing would trap it with no remedy.
    return new;
  end if;

  v_before := public.adoption_stage_block_reason(old.stage, old.outcome, old.meetings);
  v_after  := public.adoption_stage_block_reason(new.stage, new.outcome, new.meetings);

  if v_after is null or v_after = coalesce(v_before, '~none~') then
    return new;
  end if;

  select v.id into v_current from public.investigation_report_versions v
   where v.case_id = old.id and v.is_current;
  if v_current is null then
    raise exception 'This case cannot move past the investigation report stage until an investigation report has been adopted.'
      using errcode = 'check_violation';
  end if;

  select exists (
    select 1 from public.hr_review_requests rr
     where rr.case_id = old.id and rr.step = 'inv_report'
       and rr.report_version_id = v_current
       and rr.status in ('approved', 'progressed')
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

create trigger protect_zzd_progression_update_trg
  before update on public.cases
  for each row
  when (new.outcome is distinct from old.outcome
        or new.meetings is distinct from old.meetings
        or new.stage is distinct from old.stage)
  execute function public.protect_progression_version_currency();

-- The INSERT counterpart. A case CREATED already holding a progression signal
-- would otherwise bypass the UPDATE guard entirely -- exactly the gap A3b had
-- to close for investigation_report. A brand-new case cannot have an adopted,
-- HR-approved report, so any progression signal at birth is unapprovable by
-- construction. Fires after A3a's stamp trigger, which is what sets
-- new.report_regime; asserted in the drift guard.
create or replace function public.protect_progression_on_insert()
returns trigger language plpgsql security definer set search_path to 'public'
as $function$
begin
  if new.report_regime is distinct from 'versioned' then
    return new;
  end if;
  if coalesce(new.stage, '') = 'closed' then
    return new;
  end if;
  if public.adoption_stage_block_reason(new.stage, new.outcome, new.meetings) is null then
    return new;
  end if;
  raise exception 'A new case cannot be created already past the investigation report stage. Record the investigation and its adopted report first.'
    using errcode = 'check_violation';
end;
$function$;

revoke all on function public.protect_progression_on_insert() from public;
revoke all on function public.protect_progression_on_insert() from anon;
revoke all on function public.protect_progression_on_insert() from authenticated;

create trigger protect_zzc_progression_insert_trg
  before insert on public.cases
  for each row
  execute function public.protect_progression_on_insert();

-- ── POST-CONDITIONS ──────────────────────────────────────────────────────
do $verify$
declare n int;
begin
  select count(*) into n from pg_class c join pg_namespace ns on ns.oid = c.relnamespace
   where ns.nspname = 'public'
     and c.relname in ('investigation_report_lifecycle_events', 'hr_review_clarifications');
  if n <> 2 then raise exception 'FAILED: expected 2 new tables, found %', n; end if;

  -- No write privilege for ANY client role on either new table. service_role
  -- included: a probe showed it could otherwise forge an adoption event.
  select count(*) into n
    from (values ('investigation_report_lifecycle_events'), ('hr_review_clarifications')) t(rel)
   cross join (values ('INSERT'), ('UPDATE'), ('DELETE'), ('TRUNCATE')) p(priv)
   cross join (values ('anon'), ('authenticated'), ('service_role')) r(role)
   where has_table_privilege(r.role, 'public.' || t.rel, p.priv);
  if n <> 0 then raise exception 'FAILED: % write privilege(s) remain outside the definer functions', n; end if;

  -- Composite same-org tenancy on both new tables.
  select count(*) into n from pg_constraint
   where conrelid in ('public.investigation_report_lifecycle_events'::regclass,
                      'public.hr_review_clarifications'::regclass)
     and contype = 'f'
     and pg_get_constraintdef(oid) ilike '%(case_id, org_id) references cases(id, org_id)%';
  if n <> 2 then raise exception 'FAILED: expected 2 composite same-org FKs, found %', n; end if;

  -- No advisory lock anywhere in the new code.
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public' and p.prosrc ~ 'advisory'
     and p.proname in ('record_report_adoption_event', 'record_hr_return_event',
                       'decide_hr_review', 'discontinue_investigation',
                       'escalate_blocked_hr_review', 'submit_adopted_report_for_hr_review',
                       'answer_hr_review_clarification');
  if n <> 0 then raise exception 'FAILED: % function(s) still use an advisory lock', n; end if;

  -- Every lifecycle writer takes the case row FOR UPDATE.
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('record_report_adoption_event', 'record_hr_return_event',
                       'decide_hr_review', 'discontinue_investigation',
                       'escalate_blocked_hr_review', 'submit_adopted_report_for_hr_review',
                       'answer_hr_review_clarification')
     and p.prosrc ~ 'from public\.cases where id = [^;]*for update';
  if n <> 7 then raise exception 'FAILED: only % of 7 lifecycle functions take the case-row mutex', n; end if;

  -- Hardened trigger/guard functions.
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('irle_append_only_guard', 'record_report_adoption_event',
                       'record_hr_return_event', 'hr_review_clarifications_append_only',
                       'hr_review_report_integrity_guard', 'protect_progression_version_currency',
                       'protect_progression_on_insert')
     and p.prosecdef and pg_get_userbyid(p.proowner) = 'postgres'
     and 'search_path=public' = any (coalesce(p.proconfig, array[]::text[]));
  if n <> 7 then raise exception 'FAILED: expected 7 hardened trigger functions, found %', n; end if;

  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('irle_append_only_guard', 'record_report_adoption_event',
                       'record_hr_return_event', 'hr_review_clarifications_append_only',
                       'protect_progression_version_currency', 'protect_progression_on_insert')
     and (has_function_privilege('anon', p.oid, 'EXECUTE')
          or has_function_privilege('authenticated', p.oid, 'EXECUTE'));
  if n <> 0 then raise exception 'FAILED: % trigger function(s) executable by a client', n; end if;

  -- The five client RPCs are callable by authenticated and NOT by anon.
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname = 'public'
     and p.proname in ('decide_hr_review', 'discontinue_investigation',
                       'escalate_blocked_hr_review', 'submit_adopted_report_for_hr_review',
                       'answer_hr_review_clarification')
     and has_function_privilege('authenticated', p.oid, 'EXECUTE')
     and not has_function_privilege('anon', p.oid, 'EXECUTE');
  if n <> 5 then raise exception 'FAILED: only % of 5 client RPCs have the expected grants', n; end if;

  -- A1, A3a, A3b, the adoption RPC and the predicate function are untouched.
  if (select md5(prosrc) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname='public' and p.proname='protect_adopted_investigation_report')
     is distinct from '85ba380f71d56ecf66daa2441d97dbdf' then
    raise exception 'FAILED: A1 changed'; end if;
  if (select md5(prosrc) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname='public' and p.proname='adopt_investigation_report_version')
     is distinct from 'fb45b6388323936ce8e405614ecc2882' then
    raise exception 'FAILED: the adoption RPC changed'; end if;
  if (select md5(prosrc) from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname='public' and p.proname='protect_versioned_case_legacy_report')
     is distinct from '64e43642a994499687780a3719c121c0' then
    raise exception 'FAILED: A3b changed'; end if;

  -- NO in-trigger cutover gate of either rejected kind may be present. Both
  -- were tried; current_user is inert inside a definer function, and a GUC
  -- marker is client-forgeable. Asserted so neither can be reintroduced.
  if (select prosrc from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
       where ns.nspname='public' and p.proname='hr_review_report_integrity_guard')
     ~ 'current_user' then
    raise exception 'FAILED: the guard tests current_user, which is always the owner inside a SECURITY DEFINER function.'; end if;
  select count(*) into n from pg_proc p join pg_namespace ns on ns.oid = p.pronamespace
   where ns.nspname='public'
     and p.proname in ('hr_review_report_integrity_guard','decide_hr_review',
                       'discontinue_investigation','answer_hr_review_clarification')
     and p.prosrc ~ 'compass\.hr_review_decision';
  if n <> 0 then raise exception 'FAILED: % function(s) still rely on the rejected forgeable marker', n; end if;

  -- No privilege was taken from authenticated on hr_review_requests: that is
  -- cutover stage 5, deliberately not in this migration.
  if not has_table_privilege('authenticated', 'public.hr_review_requests', 'UPDATE') then
    raise exception 'FAILED: this migration must NOT revoke the direct UPDATE privilege yet.'; end if;

  select count(*) into n from public.investigation_report_lifecycle_events;
  if n <> 0 then raise exception 'FAILED: wrote % lifecycle event(s)', n; end if;
  select count(*) into n from public.hr_review_clarifications;
  if n <> 0 then raise exception 'FAILED: wrote % clarification(s)', n; end if;

  raise notice 'A3c coordinated: 2 tables, 5 client RPCs, 7 hardened guards, per-case mutex, no advisory lock, no rows written, no privilege revoked.';
end;
$verify$;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- COORDINATED CUTOVER (database first, revoke last)
--
--   1. Apply adoption_outcome_predicate_fix_2026-10-12.sql (2bbce8b3...).
--      Separate artefact. This migration refuses to apply without it.
--   2. Apply THIS migration. Nothing breaks: the fail-closed refusal is gated
--      on report_regime = 'versioned', and no organisation is activated, so
--      0 cases are versioned. The drift guard enforces that.
--   3. Ship the client: EVERY HR review decision -- legacy and versioned, all
--      six steps, all nine statuses -- routed through decide_hr_review;
--      closure -> discontinue_investigation; blocked review ->
--      escalate_blocked_hr_review. Direct UPDATE still works at this point, so
--      a partially-rolled-out client is not broken.
--   4. Verify in UAT that no decision path remains that writes
--      hr_review_requests directly.
--   5. revoke update on public.hr_review_requests from authenticated.
--      THIS IS THE ENFORCEMENT BOUNDARY. From here the only writer is a
--      SECURITY DEFINER RPC that takes the case row FOR UPDATE first, so the
--      mutex protocol holds by construction. An outdated client fails closed
--      with 42501 permission denied.
--   6. ONLY THEN activate an organisation.
--
-- WHY THERE IS NO DEADLOCK WINDOW. The cycle needs decide_hr_review
-- (cases -> review) concurrent with a direct UPDATE (review -> cases). Steps
-- 1-4 leave the direct path open but there are no versioned cases, and an
-- adoption -- the other half of the cycle -- is only possible on one. Step 5
-- closes the direct path for good. Step 6 is the first moment an adoption can
-- happen. The window and the activation never coexist, and the drift guard
-- refuses to apply this migration if an organisation is already activated.
--
-- OUTDATED CLIENTS after step 5 fail closed at the privilege layer, which
-- cannot be forged, rather than at a trigger test that can.
--
-- ROLLBACK (reverse order)
--
--   drop trigger if exists protect_zzc_progression_insert_trg on public.cases;
--   drop trigger if exists protect_zzd_progression_update_trg on public.cases;
--   drop trigger if exists record_zz_hr_return_event_trg on public.hr_review_requests;
--   drop trigger if exists record_zz_adoption_event_trg on public.investigation_report_versions;
--   drop function if exists public.protect_progression_on_insert();
--   drop function if exists public.protect_progression_version_currency();
--   drop function if exists public.answer_hr_review_clarification(uuid, text);
--   drop function if exists public.submit_adopted_report_for_hr_review(uuid, uuid, text);
--   drop function if exists public.escalate_blocked_hr_review(uuid, text);
--   drop function if exists public.discontinue_investigation(uuid, text);
--   drop function if exists public.decide_hr_review(uuid, text, text);
--   drop function if exists public.record_hr_return_event();
--   drop function if exists public.record_report_adoption_event();
--   drop table if exists public.hr_review_clarifications;
--   drop table if exists public.investigation_report_lifecycle_events;
--   drop function if exists public.hr_review_clarifications_append_only();
--   drop function if exists public.irle_append_only_guard();
--   drop function if exists public.hr_review_terminal_statuses();
--   drop function if exists public.hr_review_known_statuses();
--   alter table public.hr_review_requests drop constraint if exists hr_review_requests_id_case_key;
--   alter table public.investigation_report_versions drop constraint if exists investigation_report_versions_id_case_key;
--   -- and restore hr_review_report_integrity_guard to 08dc6b8b8c83cbec0951f2f7371d9faf
--
-- Rolling back AFTER step 5 must also restore the UPDATE privilege, or HR
-- review decisions become impossible on every case.
-- ════════════════════════════════════════════════════════════════════════════
