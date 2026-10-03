-- ============================================================================
-- WAVE D4.2b — outcome write boundary: INSERT (NEW-48) — 2026-10-03
-- ============================================================================
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
--
-- ONE function created, ONE trigger added. No table, no column, no RLS change,
-- no data change. Historical rows are not touched and not repaired.
--
-- ┌─ THE DEFECT (NEW-48) ───────────────────────────────────────────────────┐
-- │ protect_case_hr_only_columns is BEFORE UPDATE only. So a case INSERT     │
-- │ carrying an outcome was unchecked at database level, and the historical  │
-- │ CSV importer did exactly that — writing cases.outcome with no HR         │
-- │ sign-off gate for dismissal-grade outcomes, no decision-quality check,   │
-- │ and no 'Outcome issued' audit coupling (it audits "Case history          │
-- │ imported", so log_audit_event's own outcome validation never applied).   │
-- │                                                                          │
-- │ The importer stopped writing outcomes in the same slice as this          │
-- │ migration. This is the half that does not depend on application code     │
-- │ being correct.                                                           │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ WHY INSERT ONLY, AND WHAT IS DELIBERATELY STILL OPEN ──────────────────┐
-- │ UPDATE is NOT hardened here, and that is a deployment-order fact rather  │
-- │ than an omission.                                                        │
-- │                                                                          │
-- │ OutcomeModal.finalizeOutcome is the only legitimate issuance path, and   │
-- │ it is an UPDATE: saveCaseToDB takes the conditional-update branch        │
-- │ (.eq('updated_at', …)) because the case already exists. Its authority is │
-- │ ALREADY enforced for all six protected columns by                       │
-- │ protect_case_hr_only_columns — HR in this case's org, or this case's     │
-- │ disciplinary officer. There is no authority gap on UPDATE.               │
-- │                                                                          │
-- │ A supabase-js client cannot set a transaction-local marker (SET LOCAL    │
-- │ must run in the same transaction; PostgREST wraps each .update() in its  │
-- │ own), so requiring one on UPDATE before the D4.3 RPC exists would break  │
-- │ the only way the product can issue a decision. Broadly exempting         │
-- │ authenticated clients was explicitly rejected as the alternative.        │
-- │                                                                          │
-- │ D4.3 OBLIGATION: the authoritative RPC and the removal of the direct     │
-- │ HR/disciplinary-officer UPDATE allowance must deploy as ONE unit. There  │
-- │ must never be a deployed state where the RPC exists AND direct UPDATE    │
-- │ remains an unintended second authoritative path, nor one where UPDATE is │
-- │ blocked before the RPC can issue.                                        │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- NO MARKER INFRASTRUCTURE IS ADDED HERE, deliberately. A transaction-local
-- marker is not authorization — it can only ever evidence that a write came
-- from the controlled operation, and the D4.3 RPC must independently establish
-- caller, organisation, case relationship, HR/disciplinary-officer authority,
-- confidential/case-access restrictions and concurrency BEFORE setting one.
-- Adding the plumbing now, with no RPC to set it and no behaviour to change,
-- would be speculative infrastructure whose only effect would be a second
-- accepted branch in a security-critical trigger. It is D4.3's to add, in the
-- same change that gives it meaning.
--
-- PRE-MIGRATION CENSUS (production, read-only, immediately before writing this):
--   cases                               2,960    outcome-bearing          137
--   outcome_issued_at populated             2    warning_duration         2
--   warning_expires_at populated            2    outcome_notes            0
--   disciplinary_decided_by populated       0    incomplete warnings     85
--   case_decisions                        137    legacy_unmapped          1
--   case_decisions digest   7efa20a4283a95b72a7f17e1103dec40
--   outcome-cases digest    60e4971bd6f6e0d717e9375c2ea566f2
--   triggers on public.cases                8
-- ============================================================================


-- ── The protected set, stated once ─────────────────────────────────────────
--
-- Exactly the six columns protect_case_hr_only_columns already guards on
-- UPDATE, read from the live function rather than restated from memory:
--   outcome, outcome_issued_at, outcome_notes,
--   warning_duration_months, warning_expires_at, disciplinary_decided_by
--
-- An INSERT may not populate ANY of them. Not "may not populate outcome" —
-- all six, because a row inserted with a warning_expires_at and no outcome is
-- still outcome state manufactured outside the controlled operation, and
-- because partial population is exactly how a guard gets worked around.
create or replace function public.protect_case_outcome_on_insert()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_attempted text[] := '{}';
begin
  -- ┌─ SERVICE ROLE ONLY, AND current_user WOULD HAVE BROKEN THIS ──────────┐
  -- │ The first draft of this guard also exempted                            │
  -- │ `current_user in ('postgres','supabase_admin')`. That is WRONG inside a │
  -- │ SECURITY DEFINER function: current_user is always the function OWNER,   │
  -- │ so the exemption is unconditionally true and the guard never fires.     │
  -- │ Proven against production before correcting it — with the caller        │
  -- │ switched to `authenticated`, a SECURITY DEFINER function still          │
  -- │ reported current_user=postgres while a SECURITY INVOKER one reported    │
  -- │ current_user=authenticated.                                            │
  -- │                                                                        │
  -- │ So this matches protect_case_hr_only_columns and protect_case_closure   │
  -- │ exactly: auth.role() and nothing else. A real client carries an         │
  -- │ anon/authenticated JWT and is guarded; a server-side api/* route        │
  -- │ holding the service key is exempt, as those two guards already allow.   │
  -- │                                                                        │
  -- │ A migration run from the SQL editor has auth.role() NULL and is         │
  -- │ therefore ALSO guarded. That is deliberate and costs nothing: no        │
  -- │ migration in this project inserts an outcome-bearing case. One that     │
  -- │ needed to would set the claim locally, the pattern already referenced   │
  -- │ in api/team/_accept-team-invite.js.                                     │
  -- └───────────────────────────────────────────────────────────────────────┘
  if coalesce(auth.role(), '') = 'service_role' then
    return new;
  end if;

  if nullif(trim(coalesce(new.outcome, '')), '') is not null then
    v_attempted := array_append(v_attempted, 'outcome');
  end if;
  if new.outcome_issued_at is not null then
    v_attempted := array_append(v_attempted, 'outcome_issued_at');
  end if;
  if nullif(trim(coalesce(new.outcome_notes, '')), '') is not null then
    v_attempted := array_append(v_attempted, 'outcome_notes');
  end if;
  if new.warning_duration_months is not null then
    v_attempted := array_append(v_attempted, 'warning_duration_months');
  end if;
  if new.warning_expires_at is not null then
    v_attempted := array_append(v_attempted, 'warning_expires_at');
  end if;
  if new.disciplinary_decided_by is not null then
    v_attempted := array_append(v_attempted, 'disciplinary_decided_by');
  end if;

  if array_length(v_attempted, 1) is null then
    return new;
  end if;

  -- Names the fields rather than saying "not allowed", because the person who
  -- hits this is most likely importing history and needs to know which column
  -- to drop.
  raise exception
    'A case cannot be created with an outcome already recorded (fields: %). A decision is recorded on an existing case through Compass''s decision process, so that it carries authority, sign-off where required, and a dated decision record.',
    array_to_string(v_attempted, ', ')
    using errcode = '42501';
end;
$$;

comment on function public.protect_case_outcome_on_insert() is
  'Wave D4.2b (NEW-48). Refuses any case INSERT that populates outcome, outcome_issued_at, outcome_notes, warning_duration_months, warning_expires_at or disciplinary_decided_by. Closes the gap left by protect_case_hr_only_columns being BEFORE UPDATE only, which the historical CSV importer used to manufacture outcomes with no sign-off, quality check or audit coupling. Service role and migration superuser exempt, matching the existing trigger architecture.';

create trigger protect_case_outcome_on_insert_trigger
  before insert on public.cases
  for each row execute function public.protect_case_outcome_on_insert();


-- ============================================================================
-- ROLLBACK (complete, and safe — nothing is altered, only refused)
-- ============================================================================
--   drop trigger if exists protect_case_outcome_on_insert_trigger on public.cases;
--   drop function if exists public.protect_case_outcome_on_insert();
--
-- Rolling back restores the NEW-48 bypass and nothing else. No row is read or
-- written by this migration, so there is no data to restore.
-- ============================================================================
