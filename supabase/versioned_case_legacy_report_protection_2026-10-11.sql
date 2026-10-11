-- ════════════════════════════════════════════════════════════════════════════
-- B3 PHASE A3b — A VERSIONED CASE DOES NOT STORE A GENERATED REPORT
-- Candidate migration. NOT APPLIED.
--
-- A1 refuses a write to cases.investigation_report that is not the body of the
-- case's CURRENT ADOPTED version. That leaves a gap it was never meant to
-- cover: a case that has moved to versioned authoring but has not adopted
-- anything yet — no versions at all, or drafts saved and none adopted. For
-- those, A1 finds no adopted version, stands down, and the legacy generator
-- writes freely.
--
-- The gap matters because of WHERE the legacy generator commits.
-- concludeInvestigation persists the generated report in its OWN transaction
-- and only then calls requestHrReview. A rule on the HR Review insert would
-- always arrive after the report was already on the case. The refusal has to
-- happen at the write.
--
-- ── TWO GUARDS, MUTUALLY EXCLUSIVE BY CONDITION ─────────────────────────────
--
--   A1   acts when a current adopted version EXISTS   -> the write must equal
--        that version's body (its value-equality test is what lets the
--        adoption RPC mirror without being modified).
--   A3b  acts when the case is versioned and NO current adopted version
--        exists -> there is nothing legitimate to write, so refuse.
--
-- They cannot contend: each stands down exactly where the other acts. That is
-- why A1 needs no change, keeps its hash (85ba380f71d56ecf66daa2441d97dbdf),
-- and keeps its tests. Order between them is therefore cosmetic.
--
-- ── WHY INSERT IS GUARDED TOO, AND WHY ITS ORDER IS NOT COSMETIC ────────────
--
-- `authenticated` holds table-level INSERT on public.cases with no column
-- restrictions, so without this a case in an activated organisation could be
-- CREATED with a generated report already in it — never updated, so never
-- caught by an UPDATE-only guard.
--
-- The INSERT guard must run AFTER A3a's stamping trigger
-- (protect_zz_stamp_report_regime_trg), which is what sets new.report_regime.
-- Run before it, this guard would read NULL on a case that is about to become
-- versioned and wave the write through. PostgreSQL fires BEFORE triggers in
-- alphabetical order and `_` (0x5F) sorts before `a` (0x61), so
-- protect_zz_stamp… < protect_zza_… — verified against the live catalogue,
-- not assumed from the naming.
--
-- ── WHY SECURITY DEFINER, AND WHY NOT A MARKER ──────────────────────────────
--
-- This reads investigation_report_versions, whose RLS shows rows only to HR
-- or the case's current investigator. A non-definer trigger goes blind for
-- anybody else — a case owner, a reassigned investigator — and allows exactly
-- the overwrite it exists to prevent. That was demonstrated for A1 with a
-- control pair, not reasoned about.
--
-- No transaction-local GUC is used to recognise a "legitimate" writer. That
-- design was attacked during A3a and failed outright: set_config on a custom
-- GUC requires no privilege, and an HR Director forged one and landed a real
-- activation. A GUC is session state owned by the caller.
--
-- ── OLD.id, NOT new.id ──────────────────────────────────────────────────────
--
-- cases.id is immutable under NO trigger (protect_cases_identity_trigger
-- guards only org_id and created_by). An UPDATE changing id, report_regime
-- and investigation_report together must still be judged against the case
-- being updated, which is OLD. Likewise the regime is read from OLD: A3a
-- refuses any regime change on UPDATE and its trigger fires first, but this
-- guard must be correct on its own terms rather than on that ordering.
--
-- ── WHAT THIS DOES NOT TOUCH ────────────────────────────────────────────────
--
-- A1 and its trigger, A3a's table/column/functions/triggers, the adoption
-- RPC, the save RPC, the HR review guard, every policy, every existing grant,
-- every row, and cases.investigation_report_date — whose own integrity gap is
-- deliberately out of scope here and recorded for a separate A1b review.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── DRIFT GUARD ───────────────────────────────────────────────────────────
do $guard$
declare
  v_a1 text; v_adopt text; v_save text; v_stamp text; v_regime text;
  v_order_ins boolean; v_col int;
begin
  select md5(prosrc) into v_a1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'protect_adopted_investigation_report';
  select md5(prosrc) into v_adopt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'adopt_investigation_report_version';
  select md5(prosrc) into v_save from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'save_investigation_report_version';
  select md5(prosrc) into v_stamp from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'stamp_case_report_regime';
  select md5(prosrc) into v_regime from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'protect_case_report_regime';

  if v_a1 is distinct from '85ba380f71d56ecf66daa2441d97dbdf' then
    raise exception 'DRIFT: A1 protect_adopted_investigation_report has changed (found %). A3b divides responsibility with A1 by condition and must not be applied on top of a modified A1.', coalesce(v_a1, 'MISSING');
  end if;
  if v_adopt is distinct from 'fb45b6388323936ce8e405614ecc2882' then
    raise exception 'DRIFT: adopt_investigation_report_version has changed (found %)', coalesce(v_adopt, 'MISSING'); end if;
  if v_save is distinct from 'fb626a16d73a3470f48f02510a2df730' then
    raise exception 'DRIFT: save_investigation_report_version has changed (found %)', coalesce(v_save, 'MISSING'); end if;
  if v_stamp is distinct from '247284ee9eca33e72bc6d005f0e16830' then
    raise exception 'DRIFT: A3a stamp_case_report_regime has changed (found %). The INSERT guard below depends on it having already set report_regime.', coalesce(v_stamp, 'MISSING'); end if;
  if v_regime is distinct from '684666d4f922b92401c3e8ad556a9834' then
    raise exception 'DRIFT: A3a protect_case_report_regime has changed (found %)', coalesce(v_regime, 'MISSING'); end if;

  -- The column this guard reads must exist, or every case reads as legacy.
  select count(*) into v_col from pg_attribute
   where attrelid = 'public.cases'::regclass and attname = 'report_regime' and not attisdropped;
  if v_col <> 1 then
    raise exception 'DRIFT: cases.report_regime is missing. A3a must be applied before A3b.';
  end if;

  -- ORDERING, ASSERTED NOT ASSUMED. The INSERT guard is only correct if it
  -- fires after A3a's stamping trigger.
  select ('protect_zza_versioned_legacy_report_ins_trg' > tgname) into v_order_ins
    from pg_trigger where tgname = 'protect_zz_stamp_report_regime_trg';
  if v_order_ins is not true then
    raise exception 'DRIFT: the proposed INSERT trigger name would not sort after protect_zz_stamp_report_regime_trg, so it would read report_regime before A3a sets it.';
  end if;
end;
$guard$;

create or replace function public.protect_versioned_case_legacy_report()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_regime text;
  v_case_id uuid;
  v_has_adopted boolean;
begin
  -- On INSERT the row is new, so NEW is the only state there is — and by this
  -- point A3a's stamping trigger has already set report_regime. On UPDATE the
  -- subject is the row as it stands: OLD, never NEW. cases.id is immutable
  -- under no trigger, so an UPDATE changing id and the report together must
  -- still be judged against the case being updated.
  if tg_op = 'INSERT' then
    v_regime := new.report_regime;
    v_case_id := new.id;
  else
    v_regime := old.report_regime;
    v_case_id := old.id;
  end if;

  -- Every case created before activation, and every case in an organisation
  -- that was never activated. All 2963 of them today.
  if v_regime is distinct from 'versioned' then
    return new;
  end if;

  -- A newly inserted case cannot already have an adopted version, so this
  -- resolves false on INSERT and the refusal below is reached directly.
  select exists (
    select 1 from public.investigation_report_versions v
     where v.case_id = v_case_id
       and v.is_current
       and v.adopted_at is not null
  ) into v_has_adopted;

  -- A1's territory: it decides whether this write is the adoption RPC's
  -- mirror of the adopted body, or an overwrite of it. Not ours to re-judge.
  if v_has_adopted then
    return new;
  end if;

  -- Neutral and stable: no table, column, trigger or function names, nothing
  -- about versions or adoption internals. It says what is true and what to do
  -- instead, and the application can match on the SQLSTATE rather than parse
  -- the text.
  raise exception
    'This case records its investigation report as a written document that is saved and confirmed by hand. A generated report cannot be stored on it.'
    using errcode = 'check_violation';
end;
$function$;

comment on function public.protect_versioned_case_legacy_report() is
  'Refuses a legacy-generated investigation report on a case whose report_regime is ''versioned'' and which has no current adopted version. Where one does exist, it stands down and leaves the body-equality decision to protect_adopted_investigation_report (A1), so the two guards never contend. SECURITY DEFINER because it reads the RLS-protected version store, which is invisible to anyone who is neither HR nor the case''s current investigator.';

revoke all on function public.protect_versioned_case_legacy_report() from public;
revoke all on function public.protect_versioned_case_legacy_report() from anon;
revoke all on function public.protect_versioned_case_legacy_report() from authenticated;

-- ── INSERT: a case cannot be BORN holding a generated report ──────────────
-- Fires after protect_zz_stamp_report_regime_trg, which is what sets the
-- regime this guard reads. Asserted in the drift guard above.
drop trigger if exists protect_zza_versioned_legacy_report_ins_trg on public.cases;
create trigger protect_zza_versioned_legacy_report_ins_trg
  before insert on public.cases
  for each row
  when (coalesce(btrim(new.investigation_report), '') <> '')
  execute function public.protect_versioned_case_legacy_report();

-- ── UPDATE: and it cannot acquire one later ───────────────────────────────
drop trigger if exists protect_zza_versioned_legacy_report_upd_trg on public.cases;
create trigger protect_zza_versioned_legacy_report_upd_trg
  before update on public.cases
  for each row
  when (new.investigation_report is distinct from old.investigation_report)
  execute function public.protect_versioned_case_legacy_report();

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- OUT OF SCOPE, RECORDED FOR A SEPARATE A1b REVIEW
--
-- cases.investigation_report_date is still unguarded, by A1 and by this
-- migration. The adoption RPC writes it alongside the mirrored body, but
-- nothing stops it being changed afterwards — so the date beside an adopted
-- report can be made to disagree with when that report was actually adopted.
-- It is metadata rather than content, which is why it has been left alone
-- twice now; it should be closed deliberately rather than by accident.
--
-- ROLLBACK
--
--   drop trigger if exists protect_zza_versioned_legacy_report_upd_trg on public.cases;
--   drop trigger if exists protect_zza_versioned_legacy_report_ins_trg on public.cases;
--   drop function if exists public.protect_versioned_case_legacy_report();
--
-- Clean at any time and any data volume: this migration adds no column, no
-- table and no row, and changes no existing object. Dropping it restores the
-- prior behaviour exactly — and re-opens the gap, which after activation
-- means a generated report can again land on a versioned case that has not
-- adopted anything.
-- ════════════════════════════════════════════════════════════════════════════
