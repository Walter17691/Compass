-- ════════════════════════════════════════════════════════════════════════════
-- B3 PHASE A1 — AN ADOPTED REPORT CANNOT BE REPLACED BY A GENERATED ONE
-- Candidate migration. NOT APPLIED.
--
-- Adoption mirrors the authored report into cases.investigation_report, which
-- is the same single column the legacy "Conclude investigation & generate
-- report" route writes. Nothing stops the generator overwriting it. Today that
-- is harmless — production holds 0 report versions — and it stops being
-- harmless the moment the first organisation can save one.
--
-- A correction to an adopted report is a NEW SAVED VERSION AND A DELIBERATE
-- ADOPTION. There is deliberately no override: not a reason prompt, not a
-- force flag, not an HR exception. A reason-based override is how "you cannot
-- overwrite a human's report" becomes "you cannot overwrite a human's report
-- without typing something first", and the whole point of an immutable
-- version store is that the record of what was written survives disagreement
-- about it.
--
-- ── HOW THE GUARD TELLS MIRRORING FROM OVERWRITING ──────────────────────────
--
-- BY VALUE, NOT BY CALLER. The adoption RPC writes exactly the body of the
-- version it has just marked adopted and current:
--
--     update public.cases set investigation_report = v_row.body ...
--
-- and it does that AFTER setting adopted_at/is_current on that row. So when
-- this trigger fires, the current adopted version already exists and its body
-- is character-for-character what is being written. The RPC passes by
-- construction. Generated text differs, so it fails by construction.
--
-- This is why the RPC itself is NOT MODIFIED by this migration. The
-- alternative designs all require touching it: a transaction-local flag
-- (set_config) that the RPC sets and the guard reads, or caller detection via
-- pg_trigger_depth. Both mean another drop-and-recreate of an applied,
-- verified, hash-pinned function, and both authorise by WHO is writing rather
-- than WHAT is written — so a future caller that learns to set the flag gets
-- to overwrite an adopted report. Value equality has no such loophole.
--
-- COMPARISON IS EXACT. Not trimmed, not normalised, not case-folded. The
-- mirror writes the body verbatim; anything that differs by so much as a
-- trailing newline is not the adopted text, and a tolerance is a loophole
-- with a friendly name.
--
-- NULL IS A DIFFERENCE. investigation_report_versions.body is NOT NULL, so
-- the mirror can never write NULL. Setting an adopted report to NULL is
-- therefore always an overwrite — clearing the report is refused, which is
-- the intended reading of "cannot be replaced".
--
-- ── WHY SECURITY DEFINER IS NOT OPTIONAL ────────────────────────────────────
--
-- RLS is enabled on investigation_report_versions and its SELECT policy shows
-- rows only to HR or to the case's CURRENT assigned investigator. A trigger
-- running as the invoking user would therefore see NO ROW for anybody else —
-- a case owner, a line manager, a reassigned investigator — conclude "this
-- case has no adopted report", and allow exactly the overwrite it exists to
-- prevent. The guard must read the version store as the definer.
--
-- Being a trigger rather than a policy is also what makes it hold against
-- service_role and postgres, both of which have rolbypassrls.
--
-- ── WHY THE TRIGGER NAME STARTS protect_z_ ──────────────────────────────────
--
-- PostgreSQL fires BEFORE triggers in alphabetical order. The eight existing
-- BEFORE UPDATE triggers on cases sort from block_auditor_write_cases to
-- protect_confidential_case_write_trigger, and none of them mentions
-- investigation_report today. The _z_ infix puts this one LAST so it judges
-- the final NEW row — if a future column-protection trigger ever resets
-- investigation_report to its old value, that must happen before this guard
-- decides whether it changed. The same letter-infix convention already
-- controls order on audit_log (audit_log_a_capture_role_trg,
-- audit_log_b_append_only_trg).
--
-- ── WHAT THIS DOES NOT TOUCH ────────────────────────────────────────────────
--
-- The adoption RPC, the save RPC, the version immutability guard, the author
-- guard, the numbering trigger, log_audit_event, every policy, every grant,
-- the DSAR read, and investigation_report_date (see the residual-risk note in
-- the wave report: the date is metadata, and guarding it would refuse
-- legitimate edits for no integrity gain).
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── DRIFT GUARD ───────────────────────────────────────────────────────────
-- This design depends on the adoption RPC mirroring the adopted body
-- VERBATIM, and on the version store's immutability rules. If either has
-- changed, the equality test may no longer describe legitimate mirroring,
-- and the guard would start refusing adoptions.
do $guard$
declare
  v_adopt text; v_immut text; v_author text;
  v_existing int;
begin
  select md5(prosrc) into v_adopt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'adopt_investigation_report_version';
  select md5(prosrc) into v_immut from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'investigation_report_versions_immutability_guard';
  select md5(prosrc) into v_author from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'investigation_report_versions_author_guard';

  if v_adopt is distinct from 'fb45b6388323936ce8e405614ecc2882' then
    raise exception 'DRIFT: adopt_investigation_report_version is not the version this guard was designed against (found %). Its legacy mirror is what this trigger permits by value — re-verify before applying.', coalesce(v_adopt, 'MISSING');
  end if;
  if v_immut is distinct from 'd72e56ce2bf9eb945f3977a6b1892503' then
    raise exception 'DRIFT: investigation_report_versions_immutability_guard has changed (found %)', coalesce(v_immut, 'MISSING');
  end if;
  if v_author is distinct from 'c25056999f07a5d789a1ec0034e9204e' then
    raise exception 'DRIFT: investigation_report_versions_author_guard has changed (found %)', coalesce(v_author, 'MISSING');
  end if;

  -- The lookup below assumes AT MOST ONE current version per case. That is an
  -- index, not a convention, and the guard is wrong without it.
  select count(*) into v_existing from pg_indexes
   where schemaname = 'public'
     and indexname = 'investigation_report_versions_one_current';
  if v_existing <> 1 then
    raise exception 'DRIFT: the unique partial index investigation_report_versions_one_current is missing; this guard relies on there being at most one current version per case';
  end if;
end;
$guard$;

create or replace function public.protect_adopted_investigation_report()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_adopted_body text;
  v_version_no integer;
begin
  -- The trigger's WHEN clause already establishes that investigation_report
  -- is genuinely changing, so an unrelated case update never reaches here.
  -- Re-asserted anyway: a WHEN clause is easy to drop by accident, and this
  -- function must be correct on its own terms.
  if new.investigation_report is not distinct from old.investigation_report then
    return new;
  end if;

  -- OLD.id, NOT new.id. The row being updated is identified by its old
  -- primary key, and that is the case the adopted version belongs to.
  --
  -- This is not pedantry. protect_cases_identity_trigger freezes only
  -- org_id and created_by — cases.id is immutable under NO trigger, and
  -- protect_immutable_columns returns early for service_role in any case. An
  -- UPDATE that changed id and investigation_report together would, keyed on
  -- new.id, look up a case that has no adopted version, find nothing, and
  -- allow the very overwrite this guard exists to refuse.
  --
  -- Today the foreign key would abort that statement anyway
  -- (investigation_report_versions_case_same_org_fkey is ON UPDATE NO
  -- ACTION, so a case with an adopted version cannot change its id). But
  -- that is the foreign key rescuing the guard, not the guard being right,
  -- and a later schema change could remove the rescue without anyone
  -- noticing this depended on it.
  select v.body, v.version_no
    into v_adopted_body, v_version_no
    from public.investigation_report_versions v
   where v.case_id = old.id
     and v.is_current
     and v.adopted_at is not null;

  -- No adopted version: this case has never used versioned authoring, or has
  -- saved drafts but adopted none. The legacy route is untouched for it —
  -- which is every one of the 2963 cases in production today.
  if v_adopted_body is null then
    return new;
  end if;

  -- The adoption RPC's own mirror, writing the body it has just adopted.
  if new.investigation_report is not distinct from v_adopted_body then
    return new;
  end if;

  raise exception
    'This case has an adopted investigation report (version %), written by a person. It cannot be replaced or cleared by a generated report. To correct it, save a new version and adopt it.',
    v_version_no
    using errcode = 'check_violation';
end;
$function$;

comment on function public.protect_adopted_investigation_report() is
  'Refuses any change to cases.investigation_report that is not the body of the case''s current adopted report version. Permits the adoption RPC''s mirror by value equality, permits every case with no adopted version, and has no override: a correction is a new saved version and a deliberate adoption.';

-- ── EXECUTE IS NOT FOR CALLERS ────────────────────────────────────────────
-- Supabase's default privileges grant EXECUTE on every new function in this
-- schema to anon, authenticated and service_role. A trigger function has no
-- caller — invoking one directly raises 0A000 "trigger functions can only be
-- called as triggers" — so nothing legitimate is lost by taking that away,
-- and the five comparable guards in this schema
-- (investigation_report_versions_immutability_guard, …_author_guard,
-- hr_review_report_integrity_guard, assign_investigation_report_version_no,
-- protect_immutable_columns) all carry exactly postgres + service_role.
-- Landing a new SECURITY DEFINER guard wider than its siblings is how a
-- posture erodes one function at a time.
revoke all on function public.protect_adopted_investigation_report() from public;
revoke all on function public.protect_adopted_investigation_report() from anon;
revoke all on function public.protect_adopted_investigation_report() from authenticated;

drop trigger if exists protect_z_adopted_investigation_report_trg on public.cases;

create trigger protect_z_adopted_investigation_report_trg
  before update on public.cases
  for each row
  when (new.investigation_report is distinct from old.investigation_report)
  execute function public.protect_adopted_investigation_report();

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- ROLLBACK
--
--   drop trigger if exists protect_z_adopted_investigation_report_trg on public.cases;
--   drop function if exists public.protect_adopted_investigation_report();
--
-- Clean at any time and at any data volume: this migration adds no column,
-- writes no row and changes no existing object, so dropping it restores the
-- prior behaviour exactly. What it does NOT restore is the protection — after
-- the first organisation is activated, rolling this back re-opens the path by
-- which a generated report silently replaces an adopted one.
-- ════════════════════════════════════════════════════════════════════════════
