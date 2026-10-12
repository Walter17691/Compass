-- ════════════════════════════════════════════════════════════════════════════
-- B3 PHASE A3c — SUBMITTING A VERSIONED REPORT TO HR REVIEW
-- Candidate migration. NOT APPLIED.
--
-- Today an investigation is submitted by a client-side INSERT into
-- hr_review_requests with report_version_id left NULL — the column exists and
-- nothing in src/ has ever populated it. Every version rule in the existing
-- guard sits inside `if new.report_version_id is not null`, so a NULL
-- submission skips all of them. This migration makes the database the
-- authority instead of the client.
--
-- ── WHAT THE SUBMISSION RPC IS FOR ──────────────────────────────────────────
--
-- A submission is not one write. It is: prove who is asking, prove the case
-- is versioned, prove the version is the CURRENT ADOPTED one, prove it has
-- not already been formally returned, then either open a review or recognise
-- that one is already open — and record it. Spread across a client those are
-- separate transactions that can interleave or half-fail. In one RPC they are
-- one transaction, taken behind the case lock.
--
-- ── IDEMPOTENCY WITHOUT A NEW TOKEN COLUMN ──────────────────────────────────
--
-- hr_review_requests already carries a natural idempotency key: the partial
-- unique index hr_review_requests_one_open_inv_report, one pending inv_report
-- review per case. A retry therefore finds the open review and the RPC
-- returns it — but ONLY if it is for the same version. A retry naming a
-- DIFFERENT version is not a retry, it is a second submission of different
-- content, and it is refused rather than silently answered with the first
-- one. That is the distinction between idempotent and merely forgiving, and
-- it needs no request_id column and no schema change.
--
-- ── RETURN HISTORY, NOT JUST CURRENT STATE ──────────────────────────────────
--
-- "Is this version currently adopted" is not enough. A version that was
-- submitted, formally RETURNED by HR, and is still the current adoption would
-- otherwise be resubmittable unchanged — the return answered with nothing.
-- So the RPC reads the review HISTORY for that exact version and refuses if
-- any prior review blocks it.
--
-- The blocking set is defined by EXCLUSION, which is what makes it fail
-- closed: only 'pending' (reuse) and 'clarification_requested' (an open
-- question, not a rejection) permit resubmission of the same version.
-- hr_review_requests.status has never had a CHECK constraint, so unknown
-- values are reachable, and anything unrecognised blocks.
--
-- ── RETURN IS NOT CLARIFICATION ─────────────────────────────────────────────
--
-- Traced through the handlers, these differ materially. 'returned' reverts
-- the stage to investigation and un-ticks Step 7: the report is rejected, and
-- a new saved version and deliberate re-adoption are required.
-- 'clarification_requested' creates a "Clarify: …" task and leaves the stage
-- and Step 7 alone: the report stands, HR has a question. Forcing a new
-- immutable version just to answer a question would be a security rule
-- causing a product defect.
--
-- ── WHY CLARIFICATIONS GET THEIR OWN TABLE ──────────────────────────────────
--
-- hr_review_requests.comments holds HR's text and nothing holds the
-- investigator's answer. Appending both to one column loses attribution and
-- collapses rounds. A round is a question, who asked it and when, and an
-- answer, who gave it and when — so it is a row, and repeat rounds are more
-- rows. Nothing is ever overwritten: the table is append-only for the
-- question, write-once for the answer.
--
-- The question row is created BY THE GUARD, in the same statement as the
-- status transition, so a clarification cannot exist without its question or
-- a question without its clarification. No second RPC and no client change is
-- needed for HR's side.
--
-- ── NO MARKER, NO WIDENED POLICY ────────────────────────────────────────────
--
-- The investigator cannot UPDATE hr_review_requests: that policy is HR-only
-- and is NOT widened here. answer_hr_review_clarification is SECURITY
-- DEFINER, so it reaches the row while the policy stays as it is. No
-- transaction-local GUC is used to recognise a legitimate writer — that was
-- attacked during A3a and an HR Director forged one successfully.
--
-- ── WHAT THIS DOES NOT TOUCH ────────────────────────────────────────────────
--
-- A1 (85ba380f71d56ecf66daa2441d97dbdf), A3a (247284ee…, 684666d4…), A3b
-- (64e43642…), the adoption RPC, the save RPC, protect_immutable_columns, the
-- hr_review_requests UPDATE policy, the two partial unique indexes, every
-- legacy case and every historical review.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── DRIFT GUARD ───────────────────────────────────────────────────────────
do $guard$
declare
  v_a1 text; v_a3b text; v_stamp text; v_regime text; v_adopt text; v_save text; v_hr text;
  v_idx int; v_col int;
begin
  select md5(prosrc) into v_a1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='protect_adopted_investigation_report';
  select md5(prosrc) into v_a3b from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='protect_versioned_case_legacy_report';
  select md5(prosrc) into v_stamp from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='stamp_case_report_regime';
  select md5(prosrc) into v_regime from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='protect_case_report_regime';
  select md5(prosrc) into v_adopt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='adopt_investigation_report_version';
  select md5(prosrc) into v_save from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='save_investigation_report_version';
  select md5(prosrc) into v_hr from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname='public' and p.proname='hr_review_report_integrity_guard';

  if v_a1    is distinct from '85ba380f71d56ecf66daa2441d97dbdf' then raise exception 'DRIFT: A1 has changed (found %)', coalesce(v_a1,'MISSING'); end if;
  if v_a3b   is distinct from '64e43642a994499687780a3719c121c0' then raise exception 'DRIFT: A3b has changed (found %)', coalesce(v_a3b,'MISSING'); end if;
  if v_stamp is distinct from '247284ee9eca33e72bc6d005f0e16830' then raise exception 'DRIFT: A3a stamp_case_report_regime has changed (found %)', coalesce(v_stamp,'MISSING'); end if;
  if v_regime is distinct from '684666d4f922b92401c3e8ad556a9834' then raise exception 'DRIFT: A3a protect_case_report_regime has changed (found %)', coalesce(v_regime,'MISSING'); end if;
  if v_adopt is distinct from 'fb45b6388323936ce8e405614ecc2882' then raise exception 'DRIFT: adopt_investigation_report_version has changed (found %)', coalesce(v_adopt,'MISSING'); end if;
  if v_save  is distinct from 'fb626a16d73a3470f48f02510a2df730' then raise exception 'DRIFT: save_investigation_report_version has changed (found %)', coalesce(v_save,'MISSING'); end if;
  if v_hr    is distinct from '08dc6b8b8c83cbec0951f2f7371d9faf' then
    raise exception 'DRIFT: hr_review_report_integrity_guard is not the body this migration extends (found %). Re-review before replacing it.', coalesce(v_hr,'MISSING'); end if;

  -- The RPC's idempotency relies on this index, not on a convention.
  select count(*) into v_idx from pg_indexes
   where schemaname='public' and indexname='hr_review_requests_one_open_inv_report';
  if v_idx <> 1 then
    raise exception 'DRIFT: hr_review_requests_one_open_inv_report is missing; submission idempotency depends on it.'; end if;

  select count(*) into v_col from pg_attribute
   where attrelid='public.cases'::regclass and attname='report_regime' and not attisdropped;
  if v_col <> 1 then raise exception 'DRIFT: cases.report_regime is missing. A3a must be applied first.'; end if;
end;
$guard$;

-- ── 1. CLARIFICATION ROUNDS ───────────────────────────────────────────────
create table if not exists public.hr_review_clarifications (
  id          uuid primary key default gen_random_uuid(),
  review_id   uuid not null references public.hr_review_requests(id) on delete cascade,
  org_id      uuid not null references public.organisations(id),
  case_id     uuid not null references public.cases(id) on delete cascade,
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
        or (response is not null and answered_by is not null and answered_at is not null))
);

comment on table public.hr_review_clarifications is
  'One row per clarification round on an HR review: HR''s question with its author and time, and the investigator''s response with theirs. Append-only for the question, write-once for the answer, so a round can never be overwritten and a second answer cannot replace the first. Written only by hr_review_report_integrity_guard (the question, atomically with the status transition) and answer_hr_review_clarification (the response); no client holds any write privilege.';

create unique index if not exists hr_review_clarifications_round_unique
  on public.hr_review_clarifications (review_id, round);

-- At most one question awaiting an answer per review. This is what makes
-- concurrent responses a refusal rather than a race.
create unique index if not exists hr_review_clarifications_one_open
  on public.hr_review_clarifications (review_id) where answered_at is null;

create index if not exists hr_review_clarifications_case_idx
  on public.hr_review_clarifications (case_id);

revoke all on public.hr_review_clarifications from public;
revoke all on public.hr_review_clarifications from anon;
revoke all on public.hr_review_clarifications from authenticated;
grant select on public.hr_review_clarifications to authenticated;

alter table public.hr_review_clarifications enable row level security;

drop policy if exists hr_review_clarifications_select_case_scoped on public.hr_review_clarifications;
create policy hr_review_clarifications_select_case_scoped
  on public.hr_review_clarifications
  for select
  using (exists (select 1 from public.cases c where c.id = hr_review_clarifications.case_id));

-- ── 2. A ROUND IS WRITE-ONCE ──────────────────────────────────────────────
create or replace function public.hr_review_clarifications_append_only()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if tg_op = 'DELETE' then
    raise exception 'A clarification round is part of the review record and cannot be deleted.'
      using errcode = 'check_violation';
  end if;
  if new.review_id is distinct from old.review_id
     or new.org_id is distinct from old.org_id
     or new.case_id is distinct from old.case_id
     or new.round is distinct from old.round
     or new.question is distinct from old.question
     or new.asked_by is distinct from old.asked_by
     or new.asked_at is distinct from old.asked_at then
    raise exception 'A clarification question cannot be changed after it is asked.'
      using errcode = 'check_violation';
  end if;
  if old.answered_at is not null
     and (new.response is distinct from old.response
          or new.answered_by is distinct from old.answered_by
          or new.answered_at is distinct from old.answered_at) then
    raise exception 'That clarification has already been answered. Answer the next question instead.'
      using errcode = 'check_violation';
  end if;
  return new;
end;
$function$;

revoke all on function public.hr_review_clarifications_append_only() from public;
revoke all on function public.hr_review_clarifications_append_only() from anon;
revoke all on function public.hr_review_clarifications_append_only() from authenticated;

drop trigger if exists hr_review_clarifications_append_only_trg on public.hr_review_clarifications;
create trigger hr_review_clarifications_append_only_trg
  before update or delete on public.hr_review_clarifications
  for each row
  execute function public.hr_review_clarifications_append_only();

-- ── 3. THE STRENGTHENED GUARD ─────────────────────────────────────────────
-- Everything the previous body did is preserved verbatim. What is added:
--   * versioned inv_report INSERTs must carry a CURRENT adopted version
--   * report_version_id and requested_at become immutable on UPDATE
--   * a transition to 'clarification_requested' creates its question row
--   * a transition back to 'pending' is permitted only from
--     'clarification_requested', and only once that round is answered
create or replace function public.hr_review_report_integrity_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_privileged boolean := coalesce(auth.role(), '') = 'service_role';
  v_actor uuid := case when v_privileged then null else auth.uid() end;
  v_ver public.investigation_report_versions;
  v_regime text;
  v_next_round integer;
  v_open_round public.hr_review_clarifications;
  v_actor_name text;
  v_returned_at timestamptz;
begin
  if new.report_version_id is not null then
    select * into v_ver from public.investigation_report_versions where id = new.report_version_id;
    if v_ver.id is null then
      raise exception 'That report version does not exist' using errcode = '23503';
    end if;
    if v_ver.adopted_at is null then
      raise exception 'A report must be adopted before it can be submitted for HR review' using errcode = 'check_violation';
    end if;
    if v_ver.case_id is distinct from new.case_id then
      raise exception 'That report version belongs to a different case' using errcode = 'check_violation';
    end if;
    -- NEW: adopted is not enough AT SUBMISSION TIME. A superseded adoption is
    -- not the current report, so it cannot be sent for review.
    --
    -- ON INSERT ONLY, and that restriction is the whole point. A version
    -- legitimately becomes superseded AFTER it was submitted — the
    -- investigator adopts a newer one while HR still holds the earlier
    -- review. Re-checking is_current on every UPDATE would freeze that review
    -- permanently: HR could no longer decide it, return it, or even ask a
    -- question, because every one of those is an UPDATE that would re-run
    -- this test and fail. Found by probe, not by reading.
    --
    -- A review of version N remains a review of version N. That the version
    -- has since been superseded is history, and history is what the review
    -- record is for.
    if tg_op = 'INSERT' and not v_ver.is_current then
      raise exception 'That report version has been superseded. Submit the report that is currently adopted.'
        using errcode = 'check_violation';
    end if;
  end if;

  -- NEW: a versioned case cannot submit an investigation report without one.
  -- Scoped to inv_report so the 104 disciplinary-gate reviews are untouched,
  -- and to versioned cases so all 2963 legacy cases keep their current path.
  if tg_op = 'INSERT' and new.step = 'inv_report' then
    select c.report_regime into v_regime from public.cases c where c.id = new.case_id;
    if v_regime = 'versioned' and new.report_version_id is null then
      raise exception
        'This case''s investigation report is written and confirmed by hand. Submit the confirmed report rather than an unlinked request.'
        using errcode = 'check_violation';
    end if;

    -- NEW: AFTER A FORMAL RETURN, THE WORK MUST POST-DATE THE RETURN.
    --
    -- Refusing only the returned version is not enough. Consider: submit v1,
    -- adopt v2 while HR still holds v1, HR returns v1, submit v2. v2 is a
    -- different version, currently adopted, never itself returned — and it
    -- was written and confirmed BEFORE HR said what was wrong. Accepting it
    -- answers a return with work that cannot possibly have responded to it.
    --
    -- The test is therefore temporal, and both sides of it are server-written:
    --   adopted_at  set by adopt_investigation_report_version from now(), and
    --               IMMUTABLE thereafter — investigation_report_versions_
    --               immutability_guard lists it among the frozen columns.
    --   reviewed_at set by the stamping branch below from now(), and now
    --               discarded from every client UPDATE (see above), so it
    --               cannot be moved to widen the window.
    -- Neither is a client timestamp, and neither can be edited after the fact.
    if v_regime = 'versioned' and new.report_version_id is not null then
      select r.reviewed_at into v_returned_at
        from public.hr_review_requests r
       where r.case_id = new.case_id
         and r.step = 'inv_report'
         and r.status = 'returned'
       order by r.reviewed_at desc nulls last
       limit 1;
      if v_returned_at is not null
         and (v_ver.adopted_at is null or v_ver.adopted_at <= v_returned_at) then
        raise exception
          'HR returned this investigation for further work. Revise the report, confirm the new version, and send that.'
          using errcode = 'check_violation';
      end if;
    end if;
  end if;

  if tg_op = 'UPDATE' then
    -- NEW: what was submitted, and when it was asked for, are facts.
    if new.report_version_id is distinct from old.report_version_id then
      raise exception 'The report submitted for review cannot be changed. Submit a new review instead.'
        using errcode = 'check_violation';
    end if;
    if new.requested_at is distinct from old.requested_at then
      raise exception 'The time a review was requested cannot be changed.' using errcode = 'check_violation';
    end if;
    -- NEW, AND LOAD-BEARING FOR THE POST-RETURN RULE. reviewed_at is the
    -- moment HR decided, and the submission RPC compares a version's
    -- adopted_at against it to tell "rewritten after the return" from
    -- "already in hand before it". A caller who could set reviewed_at could
    -- move that boundary and resubmit rejected work.
    --
    -- So the client's values are DISCARDED here, unconditionally. The
    -- stamping branch below then sets them from now() and auth.uid() when a
    -- decision is actually taken. They are only ever server-written.
    new.reviewed_at := old.reviewed_at;
    new.reviewed_by := old.reviewed_by;
    new.reviewed_by_name := old.reviewed_by_name;
  end if;

  if tg_op = 'UPDATE' and new.status is distinct from old.status and new.status <> 'pending' then
    if v_actor is null then
      raise exception 'An HR review decision must be made by a signed-in HR user. An automated or service-role process cannot decide a review.'
        using errcode = '42501';
    end if;
    if not exists (select 1 from public.org_members om
                    where om.org_id = new.org_id and om.user_id = v_actor and public.is_hr_role(om.role)) then
      raise exception 'Only HR can decide an HR review' using errcode = '42501';
    end if;
    if v_actor = old.requested_by then
      raise exception 'You cannot decide an HR review that you submitted' using errcode = '42501';
    end if;
    if new.report_version_id is not null then
      select * into v_ver from public.investigation_report_versions where id = new.report_version_id;
      if v_ver.adopted_by = v_actor then
        raise exception 'You cannot decide an HR review of a report that you adopted' using errcode = '42501';
      end if;
    end if;
    new.reviewed_by := v_actor;
    new.reviewed_at := now();
    select name into v_actor_name from public.org_members
     where org_id = new.org_id and user_id = v_actor;
    new.reviewed_by_name := coalesce(v_actor_name, 'Unknown');

    -- NEW: asking for clarification records the question in the same
    -- statement, so one cannot exist without the other.
    if new.status = 'clarification_requested' then
      if coalesce(btrim(new.comments), '') = '' then
        raise exception 'Asking for clarification requires a written question, which is recorded on the review.'
          using errcode = 'check_violation';
      end if;
      select coalesce(max(round), 0) + 1 into v_next_round
        from public.hr_review_clarifications where review_id = new.id;
      insert into public.hr_review_clarifications
        (review_id, org_id, case_id, round, question, asked_by)
      values (new.id, new.org_id, new.case_id, v_next_round, btrim(new.comments), v_actor);
    end if;
  end if;

  -- NEW: returning to pending is a state transition, not a free edit.
  if tg_op = 'UPDATE' and new.status = 'pending' and old.status is distinct from 'pending' then
    if old.status is distinct from 'clarification_requested' then
      raise exception 'Only a review awaiting clarification can be reopened.' using errcode = 'check_violation';
    end if;
    select * into v_open_round from public.hr_review_clarifications
     where review_id = new.id and answered_at is null;
    if v_open_round.id is not null then
      raise exception 'Answer the outstanding clarification before this review returns to HR.'
        using errcode = 'check_violation';
    end if;
  end if;

  return new;
end;
$function$;

-- ── 4. SUBMISSION ─────────────────────────────────────────────────────────
create or replace function public.submit_adopted_report_for_hr_review(
  p_case_id    uuid,
  p_version_id uuid,
  p_hr_reason  text default null
)
returns public.hr_review_requests
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_case public.cases;
  v_ver public.investigation_report_versions;
  v_existing public.hr_review_requests;
  v_row public.hr_review_requests;
  v_is_investigator boolean;
  v_is_hr boolean;
  v_reason text := nullif(btrim(coalesce(p_hr_reason, '')), '');
  v_member record;
  v_blocking text;
  v_returned_at timestamptz;
begin
  if v_actor is null then
    raise exception
      'Submitting an investigation report for HR review must be done by a signed-in user. An automated or service-role process cannot submit a report.'
      using errcode = '42501';
  end if;

  select * into v_case from public.cases where id = p_case_id for update;
  if v_case.id is null then
    raise exception 'That case does not exist' using errcode = '23503';
  end if;

  select exists (
      select 1 from public.case_access ca
       where ca.case_id = p_case_id and ca.user_id = v_actor and ca.role = 'investigator'),
    exists (
      select 1 from public.org_members om
       where om.org_id = v_case.org_id and om.user_id = v_actor and public.is_hr_role(om.role))
    into v_is_investigator, v_is_hr;

  if not v_is_investigator then
    if not v_is_hr then
      raise exception
        'Only this case''s assigned investigator, or HR under a documented exception, can submit the investigation report for review'
        using errcode = '42501';
    end if;
    if v_reason is null then
      raise exception
        'Submitting the report as HR rather than the assigned investigator requires a written reason, which is recorded in the case audit trail'
        using errcode = 'check_violation';
    end if;
  end if;

  if v_case.report_regime is distinct from 'versioned' then
    raise exception
      'This case uses the existing investigation report route. Use the standard submission for it.'
      using errcode = 'check_violation';
  end if;

  select * into v_ver from public.investigation_report_versions where id = p_version_id;
  if v_ver.id is null then
    raise exception 'That report version does not exist' using errcode = '23503';
  end if;
  if v_ver.case_id is distinct from p_case_id then
    raise exception 'That report version belongs to a different case' using errcode = 'check_violation';
  end if;
  if v_ver.adopted_at is null then
    raise exception 'A report must be confirmed before it can be sent for HR review.' using errcode = 'check_violation';
  end if;
  if not v_ver.is_current then
    raise exception 'That report version has been superseded. Send the report that is currently confirmed.'
      using errcode = 'check_violation';
  end if;

  -- RETURN HISTORY. Fails closed: only an open review (reuse) and an open
  -- clarification permit this version to be submitted again.
  select r.status into v_blocking
    from public.hr_review_requests r
   where r.case_id = p_case_id
     and r.step = 'inv_report'
     and r.report_version_id = p_version_id
     and r.status not in ('pending', 'clarification_requested')
   order by r.reviewed_at desc nulls last
   limit 1;
  if v_blocking is not null then
    raise exception
      'This report has already been through HR review and was not accepted as it stands. Write a new version and confirm it before sending it again.'
      using errcode = 'check_violation';
  end if;

  -- AND the work must post-date the most recent formal return on this case.
  -- See the guard's own note: refusing only the returned version would still
  -- let "submit v1 → adopt v2 → HR returns v1 → submit v2" through, which
  -- answers a return with work written before HR said what was wrong.
  -- Both timestamps are server-written; adopted_at is additionally immutable.
  select r.reviewed_at into v_returned_at
    from public.hr_review_requests r
   where r.case_id = p_case_id
     and r.step = 'inv_report'
     and r.status = 'returned'
   order by r.reviewed_at desc nulls last
   limit 1;
  if v_returned_at is not null and v_ver.adopted_at <= v_returned_at then
    raise exception
      'HR returned this investigation for further work. Revise the report, confirm the new version, and send that.'
      using errcode = 'check_violation';
  end if;

  -- IDEMPOTENCY, on the natural key the partial unique index already
  -- enforces: one open inv_report review per case.
  select * into v_existing
    from public.hr_review_requests
   where case_id = p_case_id and step = 'inv_report' and status = 'pending';

  if v_existing.id is not null then
    if v_existing.report_version_id is distinct from p_version_id then
      raise exception
        'A different version of this report is already with HR. Wait for that review to finish before sending another.'
        using errcode = 'check_violation';
    end if;
    return v_existing;   -- exact replay: no second row, no second audit event
  end if;

  select * into v_member from public.org_members
   where org_id = v_case.org_id and user_id = v_actor;

  insert into public.hr_review_requests
    (org_id, case_id, step, requested_by, requested_by_name,
     case_employee_name, status, report_version_id)
  values
    (v_case.org_id, p_case_id, 'inv_report', v_actor,
     coalesce(v_member.name, 'Unknown'), v_case.employee_name, 'pending', p_version_id)
  returning * into v_row;

  insert into public.audit_log (org_id, user_id, user_name, action, detail, case_id)
  values (
    v_case.org_id, v_actor, coalesce(v_member.name, 'Unknown'),
    case when v_is_investigator
         then 'Investigation report submitted for HR review'
         else 'Investigation report submitted for HR review under HR exception' end,
    'Version ' || v_ver.version_no
      || case when v_is_investigator then ' — submitted by the assigned investigator'
              else ' — submitted by HR rather than the assigned investigator. Reason: ' || v_reason end,
    p_case_id);

  return v_row;
end;
$function$;

comment on function public.submit_adopted_report_for_hr_review(uuid, uuid, text) is
  'Sends a case''s currently adopted investigation report version to HR review, in one transaction behind the case lock. Requires the assigned investigator, or HR with a written reason. Refuses unadopted and superseded versions, versions belonging to another case, and any version whose review history shows it was not accepted as it stands. Idempotent on the existing open review, but refuses a retry naming a different version.';

revoke all on function public.submit_adopted_report_for_hr_review(uuid, uuid, text) from public;
revoke all on function public.submit_adopted_report_for_hr_review(uuid, uuid, text) from anon;
grant execute on function public.submit_adopted_report_for_hr_review(uuid, uuid, text) to authenticated;

-- ── 5. ANSWERING A CLARIFICATION ──────────────────────────────────────────
create or replace function public.answer_hr_review_clarification(
  p_review_id uuid,
  p_response  text
)
returns public.hr_review_requests
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_review public.hr_review_requests;
  v_round public.hr_review_clarifications;
  v_case public.cases;
  v_member record;
  v_response text := nullif(btrim(coalesce(p_response, '')), '');
  v_is_investigator boolean;
  v_is_hr boolean;
begin
  if v_actor is null then
    raise exception 'Answering a clarification must be done by a signed-in user.' using errcode = '42501';
  end if;
  if v_response is null then
    raise exception 'A clarification needs a written answer.' using errcode = 'check_violation';
  end if;

  select * into v_review from public.hr_review_requests where id = p_review_id;
  if v_review.id is null then
    raise exception 'That review request does not exist' using errcode = '23503';
  end if;

  -- Lock the CASE, not the review: adoption, submission and clarification all
  -- serialise on the same row, so they cannot interleave.
  select * into v_case from public.cases where id = v_review.case_id for update;

  select exists (
      select 1 from public.case_access ca
       where ca.case_id = v_review.case_id and ca.user_id = v_actor and ca.role = 'investigator'),
    exists (
      select 1 from public.org_members om
       where om.org_id = v_review.org_id and om.user_id = v_actor and public.is_hr_role(om.role))
    into v_is_investigator, v_is_hr;

  if not v_is_investigator and not v_is_hr then
    raise exception 'Only this case''s assigned investigator, or HR, can answer a clarification on it'
      using errcode = '42501';
  end if;

  if v_review.status is distinct from 'clarification_requested' then
    raise exception 'That review is not waiting for a clarification.' using errcode = 'check_violation';
  end if;

  -- The open round. The partial unique index guarantees at most one, and
  -- FOR UPDATE makes two simultaneous answers serialise: the second finds it
  -- already answered and is refused by the append-only guard.
  select * into v_round from public.hr_review_clarifications
   where review_id = p_review_id and answered_at is null
   for update;
  if v_round.id is null then
    raise exception 'There is no outstanding question on that review.' using errcode = 'check_violation';
  end if;

  update public.hr_review_clarifications
     set response = v_response, answered_by = v_actor, answered_at = now()
   where id = v_round.id;

  -- Same review row: same id, same requester, same requested_at, same
  -- report_version_id. Only the status moves.
  update public.hr_review_requests
     set status = 'pending'
   where id = p_review_id
  returning * into v_review;

  select * into v_member from public.org_members
   where org_id = v_review.org_id and user_id = v_actor;

  insert into public.audit_log (org_id, user_id, user_name, action, detail, case_id)
  values (
    v_review.org_id, v_actor, coalesce(v_member.name, 'Unknown'),
    'HR review clarification answered',
    'Round ' || v_round.round || ' — the review has returned to HR for a decision.',
    v_review.case_id);

  return v_review;
end;
$function$;

comment on function public.answer_hr_review_clarification(uuid, text) is
  'Completes the outstanding clarification round on an HR review and returns that same review to pending — same id, same requester, same requested_at, same report version. SECURITY DEFINER so the assigned investigator can answer without the HR-only UPDATE policy being widened. Refuses a second answer and serialises concurrent ones on the case lock.';

revoke all on function public.answer_hr_review_clarification(uuid, text) from public;
revoke all on function public.answer_hr_review_clarification(uuid, text) from anon;
grant execute on function public.answer_hr_review_clarification(uuid, text) to authenticated;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- NOT IN THIS MIGRATION
--
--   * The client change. finalizeInvestigationSubmission still does not await
--     requestHrReview and still ticks Step 7 regardless of the result, so a
--     submission this migration refuses will still look complete in the UI.
--     That is a client defect with a client fix and is specified separately.
--   * cases.investigation_report_date remains unguarded (A1b).
--   * The next-step banner reads stage='inv_report' as readiness to proceed,
--     which on a versioned case is true from ADOPTION rather than from
--     submission. No stage guard is added here: the stage legitimately means
--     "a report exists", and the submission signal is the review row.
--
-- ROLLBACK
--
--   drop function if exists public.answer_hr_review_clarification(uuid, text);
--   drop function if exists public.submit_adopted_report_for_hr_review(uuid, uuid, text);
--   drop trigger if exists hr_review_clarifications_append_only_trg on public.hr_review_clarifications;
--   drop function if exists public.hr_review_clarifications_append_only();
--   drop table if exists public.hr_review_clarifications;
--   -- and restore hr_review_report_integrity_guard to md5
--   -- 08dc6b8b8c83cbec0951f2f7371d9faf from
--   -- supabase/hr_review_report_integrity_2026-10-09.sql
--
-- Clean while no versioned case has been submitted. Once clarification rounds
-- exist, dropping the table destroys the questions and answers that are part
-- of the review record.
-- ════════════════════════════════════════════════════════════════════════════
