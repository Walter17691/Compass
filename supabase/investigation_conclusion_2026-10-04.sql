-- ============================================================================
-- STRUCTURED INVESTIGATION CONCLUSION — 2026-10-04  (ER Journey Slice 2)
-- ============================================================================
-- HOW TO APPLY: paste into the Supabase SQL Editor and run, as ONE unit.
--
-- ADDITIVE ONLY. Four new nullable columns on allegations, one new nullable
-- column on audit_log, two new functions, two new triggers, and two actions
-- added to log_audit_event's reserved list. No existing column is altered,
-- renamed or dropped. NO BACKFILL: not one historical row is written.
--
-- ┌─ WHAT THIS SEPARATES ───────────────────────────────────────────────────┐
-- │ Compass had two things fused together and called the result a finding:  │
-- │                                                                         │
-- │   "did the investigation establish enough to answer?"  (investigation)  │
-- │   "is the allegation substantiated?"                   (disciplinary)   │
-- │                                                                         │
-- │ allegations.status holds the second. This migration adds the first as a │
-- │ distinct, separately authorised, separately audited fact. The two are   │
-- │ never derived from each other — in either direction, in any migration.  │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- ┌─ THE AUTHORITY FAMILY THIS JOINS ───────────────────────────────────────┐
-- │ allegations already carries two column-protection triggers, each       │
-- │ pairing one decision with the one non-HR role entitled to make it:     │
-- │                                                                         │
-- │   protect_allegations_finding_columns           HR or disciplinary_officer │
-- │   protect_allegations_appeal_decision_columns   HR or appeal_manager    │
-- │   protect_allegations_investigation_conclusion  HR or investigator  ← new │
-- │                                                                         │
-- │ The three non-HR authorities are DISJOINT, which is the separation this │
-- │ slice exists to create: the person who investigates concludes whether  │
-- │ there is a case to answer, and a different person decides it.          │
-- │                                                                         │
-- │ A trigger — not a policy — because PostgreSQL has no column-level RLS. │
-- │ A restrictive UPDATE policy cannot say "these columns but not those";  │
-- │ it would block the whole row. That is why this family exists at all.   │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- PRE-MIGRATION BASELINE (production, read-only, immediately before applying).
-- Digest EXPRESSIONS are recorded, not just values, because a digest without
-- its expression can neither confirm nor deny drift:
--
--   cases 2,961 · allegations 949 · case_decisions 138 · audit_log 16,936 ·
--   public base tables 44 · policies on allegations 1 · triggers on
--   allegations 5 · functions in public 69 · allegations with appeal_outcome 37
--   status distribution: unreviewed 606, substantiated 343 (NULL: 0)
--   investigation_conclusion% columns present: 0 · audit_log.allegation_id: 0
--
--   D1 md5(string_agg(id||':'||coalesce(status,'-'), ',' order by id))
--      = 084dedd8581418aa232532a6ee95f063
--   D2 md5(string_agg(id||':'||coalesce(investigator_finding,'-'), ',' order by id))
--      = f15170f6c6d5c6c2ff195086e693ae4d
--   D3 md5(string_agg(id||':'||coalesce(decision_reasoning,'-'), ',' order by id))
--      = a5d4cc87b4ea8fcdea317082792ad303
--   D4 md5(string_agg(id||':'||coalesce(outstanding_uncertainty,'-'), ',' order by id))
--      = 31e9347216398638fe3fb3cdc648f6e2
--   D5 md5(string_agg(id||':'||coalesce(appeal_outcome,'-')||':'||coalesce(appeal_reasoning,'-'), ',' order by id))
--      = 315de7b7b97220ff3b4c75b3839a64e9
--   D6 md5(string_agg(id||':'||coalesce(title,'-')||':'||coalesce(description,'-'), ',' order by id))
--      = f6272ed49affc7202936afba77b9ae08
--   D7 md5(string_agg(id||':'||coalesce(decided_by::text,'-')||':'||coalesce(decided_at::text,'-'), ',' order by id))
--      = 72423e1c91a938ac4c0cbced6ab9e3b7
--   D8 md5(string_agg(id||':'||coalesce(outcome,'-'), ',' order by id)) ON case_decisions
--      = 57aea3348667427bafc5823a7c4317e9
--   D9 md5(string_agg(id||':'||coalesce(stage,'-')||':'||coalesce(outcome,'-'), ',' order by id)) ON cases
--      = e95c43cdeba53d37d136272e55f3d250
--
-- All nine must be IDENTICAL after applying. D1 in particular: the 343
-- substantiated rows are historical records made under the old ambiguous
-- workflow and are not reinterpreted by this or any later migration.
-- ============================================================================


-- ── 1. The columns ─────────────────────────────────────────────────────────
--
-- Nullable with no default, and that is the whole fail-safe. NULL means "no
-- investigation conclusion has been recorded", which is what is true of all 949
-- existing allegations. It must never be read as either case_to_answer or
-- no_case_to_answer, and the rollup that drives progression treats it as
-- UNRESOLVED — blocking progression rather than permitting it.
alter table public.allegations
  add column if not exists investigation_conclusion text,
  add column if not exists investigation_conclusion_reasoning text,
  add column if not exists investigation_conclusion_by uuid references auth.users(id),
  add column if not exists investigation_conclusion_at timestamptz;

comment on column public.allegations.investigation_conclusion is
  'Structured conclusion of the INVESTIGATION for this allegation: case_to_answer, no_case_to_answer or further_investigation_required. NOT a disciplinary finding, sanction, outcome or appeal decision, and never expressed as substantiated/upheld. NULL means no conclusion has been recorded and must not be interpreted either way.';
comment on column public.allegations.investigation_conclusion_reasoning is
  'The investigator''s stated reasoning for the structured investigation conclusion. Required whenever a conclusion is recorded.';
comment on column public.allegations.investigation_conclusion_by is
  'Actor who recorded the current investigation conclusion. Assigned server-side from auth.uid() by protect_allegations_investigation_conclusion_columns; a client-supplied value is always discarded.';
comment on column public.allegations.investigation_conclusion_at is
  'When the current investigation conclusion was recorded. Assigned server-side from now(); a client-supplied value is always discarded.';

-- The vocabulary is closed, and NULL is explicitly permitted so that 949
-- historical rows satisfy the constraint without being touched.
alter table public.allegations
  drop constraint if exists allegations_investigation_conclusion_check;
alter table public.allegations
  add constraint allegations_investigation_conclusion_check
  check (
    investigation_conclusion is null
    or investigation_conclusion in ('case_to_answer', 'no_case_to_answer', 'further_investigation_required')
  );


-- ── 2. The audit trail can name the allegation ─────────────────────────────
--
-- Mirrors case_decision_id, employee_id, employment_event_id: a typed nullable
-- FK with ON DELETE SET NULL, which is the shape every other audit FK already
-- uses. Section I of the brief requires that the trail establish WHICH
-- allegation; a column makes that queryable instead of parseable out of prose.
--
-- TEXT, not uuid. allegations.id is a client-generated text key of the form
-- 'alg_<uuid>' — every sibling audit FK points at a uuid primary key, so writing
-- `uuid` here by analogy would have failed at apply time on a type mismatch.
alter table public.audit_log
  add column if not exists allegation_id text references public.allegations(id) on delete set null;

comment on column public.audit_log.allegation_id is
  'The allegation an audit event concerns, where it concerns one. Set by log_investigation_conclusion. audit_log remains a trail, never the authoritative store — the allegation row holds the authoritative conclusion.';


-- ── 3. Authority, provenance and the no-erasure rule ───────────────────────
--
-- Fires only when one of the four conclusion columns actually changes, so every
-- ordinary allegation UPDATE — editing the description, the investigator's
-- assessment, the outstanding uncertainty, or the disciplinary status — is
-- completely unaffected by it.
--
-- WHY THE DISCIPLINARY OFFICER IS DELIBERATELY EXCLUDED. They are the person
-- who will hear the case. Letting them also decide whether there is a case to
-- answer collapses the separation this slice exists to create. HR can always
-- record a conclusion, so no case can become stuck; and in production today
-- case_access holds 174 investigator rows and zero disciplinary_officer rows,
-- so excluding the role costs nothing operationally.
create or replace function public.protect_allegations_investigation_conclusion_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_case record;
begin
  -- Service role is the migration/admin path, exactly as the sibling triggers
  -- treat it. auth.role() is NOT rewritten inside SECURITY DEFINER (unlike
  -- current_user, which would always be the owner here — the NEW-49 trap).
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.investigation_conclusion is not distinct from old.investigation_conclusion
     and new.investigation_conclusion_reasoning is not distinct from old.investigation_conclusion_reasoning
     and new.investigation_conclusion_by is not distinct from old.investigation_conclusion_by
     and new.investigation_conclusion_at is not distinct from old.investigation_conclusion_at
  then
    return new;
  end if;

  -- A conclusion is never erased, and provenance or reasoning cannot be written
  -- without one. Both arms fail closed on a null conclusion.
  if new.investigation_conclusion is null then
    if old.investigation_conclusion is not null then
      raise exception 'An investigation conclusion cannot be removed once recorded. Record a different conclusion instead — that is kept as an amendment with its own audit trail.'
        using errcode = '42501';
    else
      raise exception 'An investigation conclusion must be recorded before its reasoning or provenance can be.'
        using errcode = '23514';
    end if;
  end if;

  -- AUTHORITY.
  if not (
    exists (
      select 1 from public.org_members om
      where om.org_id = old.org_id and om.user_id = auth.uid() and public.is_hr_role(om.role)
    )
    or exists (
      select 1 from public.case_access ca
      where ca.case_id = old.case_id and ca.user_id = auth.uid() and ca.role = 'investigator'
    )
  ) then
    raise exception 'Only HR or this case''s assigned investigator can record an investigation conclusion'
      using errcode = '42501';
  end if;

  -- CONFIDENTIAL CASES.
  --
  -- protect_confidential_case_write guards the CASES table, so it never fires
  -- for a write to an allegation. Confidentiality therefore has to be enforced
  -- here or it would not hold for this field at all. The test mirrors that
  -- function's: level-1 HR, the case creator, or someone with a case_access row.
  select * into v_case from public.cases where id = old.case_id;
  if v_case.id is null then
    raise exception 'This allegation does not reference a real case' using errcode = '23503';
  end if;
  if v_case.confidential is true
     and not exists (
       select 1 from public.org_members om
       where om.org_id = old.org_id and om.user_id = auth.uid() and om.case_access_level = 1
     )
     and v_case.created_by is distinct from auth.uid()
     and not exists (
       select 1 from public.case_access ca
       where ca.case_id = old.case_id and ca.user_id = auth.uid()
     )
  then
    raise exception 'You do not have access to modify this confidential case' using errcode = '42501';
  end if;

  -- A conclusion carries its reasoning.
  if coalesce(btrim(new.investigation_conclusion_reasoning), '') = '' then
    raise exception 'An investigation conclusion must record the reasoning for it' using errcode = '23514';
  end if;

  -- PROVENANCE IS SERVER-DERIVED, ALWAYS, AND WHATEVER THE CLIENT SENT IS
  -- DISCARDED. This is unconditional assignment rather than a validation, so
  -- there is no path — RPC, direct REST call, SQL, or a generic save that
  -- happens to carry the columns — by which a caller can attribute a conclusion
  -- to somebody else or backdate one.
  new.investigation_conclusion_by := auth.uid();
  new.investigation_conclusion_at := now();

  return new;
end;
$$;

comment on function public.protect_allegations_investigation_conclusion_columns() is
  'Column-protection trigger for the structured investigation conclusion. Restricts the write to HR or this case''s assigned investigator (deliberately NOT the disciplinary officer, who decides the case), enforces confidential-case access because protect_confidential_case_write only covers the cases table, refuses to erase a recorded conclusion, requires reasoning, and assigns investigation_conclusion_by/at server-side so client-supplied provenance is always discarded.';

drop trigger if exists protect_allegations_investigation_conclusion_trigger on public.allegations;
create trigger protect_allegations_investigation_conclusion_trigger
  before update on public.allegations
  for each row execute function public.protect_allegations_investigation_conclusion_columns();


-- ── 4. The conclusion is an audited event ──────────────────────────────────
--
-- Two actions, because recording a conclusion for the first time and changing
-- one afterwards are different events and the brief requires the trail to show
-- which happened. The from→to pair is captured in the detail.
--
-- WHAT THIS DELIBERATELY DOES NOT COPY INTO audit_log: the reasoning TEXT.
-- audit_log is a trail, not the domain store, and the reasoning is HR/
-- investigator working material whose disclosure treatment is decided once, on
-- the allegation. Duplicating it into a second table with different disclosure
-- rules would create a side door around that decision. The consequence is
-- stated plainly: an amendment records that the reasoning was revised, and the
-- superseded reasoning TEXT is not retained.
--
-- No audit row when there is no authenticated actor: audit_log.user_id and
-- user_name are both NOT NULL, and inventing an actor would be a lie. The
-- authority check in section 3 already makes an unauthenticated write
-- impossible, so this arm is reachable only by the service role.
create or replace function public.log_investigation_conclusion()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_member record;
  v_action text;
  v_detail text;
begin
  if new.investigation_conclusion is not distinct from old.investigation_conclusion
     and new.investigation_conclusion_reasoning is not distinct from old.investigation_conclusion_reasoning
  then
    return null;
  end if;

  if auth.uid() is null then
    return null;
  end if;

  select * into v_member from public.org_members
    where org_id = new.org_id and user_id = auth.uid();

  if old.investigation_conclusion is null then
    v_action := 'Investigation conclusion recorded';
    v_detail := format('allegation %s (%L): %s',
                       new.id, coalesce(new.title, '(untitled)'), new.investigation_conclusion);
  elsif new.investigation_conclusion is distinct from old.investigation_conclusion then
    v_action := 'Investigation conclusion amended';
    v_detail := format('allegation %s (%L): %s amended to %s',
                       new.id, coalesce(new.title, '(untitled)'),
                       old.investigation_conclusion, new.investigation_conclusion);
  else
    v_action := 'Investigation conclusion amended';
    v_detail := format('allegation %s (%L): %s retained, reasoning revised',
                       new.id, coalesce(new.title, '(untitled)'), new.investigation_conclusion);
  end if;

  insert into public.audit_log (org_id, user_id, user_name, action, detail, case_id, allegation_id)
  values (new.org_id, auth.uid(), coalesce(v_member.name, 'Unknown'),
          v_action, v_detail, new.case_id, new.id);
  return null;
end;
$$;

comment on function public.log_investigation_conclusion() is
  'Writes the Investigation conclusion recorded / amended audit event when an allegation''s structured conclusion or its reasoning changes. Actor derived server-side from auth.uid(). Records which allegation, which conclusion, and on an amendment the from→to pair; deliberately does not copy the reasoning text into audit_log, so the superseded reasoning text is not retained.';

drop trigger if exists log_investigation_conclusion_trigger on public.allegations;
create trigger log_investigation_conclusion_trigger
  after update on public.allegations
  for each row execute function public.log_investigation_conclusion();


-- ── 5. Both actions become unforgeable ─────────────────────────────────────
--
-- THE DEPLOYED DEFINITION EDITS ITSELF. In D4.3 this same section was
-- transcribed by hand, a column name was mistyped, `create or replace function`
-- reported success anyway (plpgsql bodies are not name-resolved until first
-- execution), and the generic audit RPC was briefly broken in production.
--
-- So nothing is retyped here. This block reads the live definition with
-- pg_get_functiondef, inserts two elements into the reserved list by string
-- replacement, and executes the result. It is idempotent, and it FAILS CLOSED:
-- if the anchor is not found — because someone has since edited the function —
-- it raises rather than guessing where the list is.
do $outer$
declare
  v_def text;
  v_new text;
  v_anchor text := '    ''Employee created''' || E'\n' || '  ) then';
  v_replacement text := '    ''Employee created'',' || E'\n'
                     || '    ''Investigation conclusion recorded'',' || E'\n'
                     || '    ''Investigation conclusion amended''' || E'\n' || '  ) then';
begin
  select pg_get_functiondef(p.oid) into v_def
  from pg_proc p join pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public' and p.proname = 'log_audit_event';

  if v_def is null then
    raise exception 'log_audit_event does not exist — refusing to invent it';
  end if;

  if position('''Investigation conclusion recorded''' in v_def) > 0 then
    raise notice 'log_audit_event already reserves the investigation-conclusion actions; nothing to do';
    return;
  end if;

  if position(v_anchor in v_def) = 0 then
    raise exception 'The reserved-action list anchor was not found in the deployed log_audit_event. Refusing to guess where the list is — inspect the function and update this block.';
  end if;

  v_new := replace(v_def, v_anchor, v_replacement);
  if v_new = v_def then
    raise exception 'The reserved-list edit produced no change';
  end if;

  execute v_new;
  raise notice 'log_audit_event: 2 actions added to the reserved list';
end
$outer$;


-- ============================================================================
-- WHAT THIS MIGRATION DELIBERATELY DOES NOT DO
-- ============================================================================
-- * NO BACKFILL. investigation_conclusion is NULL on all 949 existing rows and
--   is not derived from status, investigator_finding, stage, cases.outcome,
--   meetings or case_decisions. The 343 substantiated rows were recorded under
--   the old ambiguous workflow; "substantiated" does not mean "there was a case
--   to answer", and inferring it would manufacture a decision no human made.
--   Unknown stays unknown.
-- * It does not touch allegations.status, its CHECK constraint, or
--   protect_allegations_finding_columns. The disciplinary side is Slice 3.
-- * It does not rename investigator_finding. The UI wording becomes
--   "Investigator's assessment" while persistence stays as it is; a cosmetic
--   column rename would be a breaking change for no benefit.
-- * It does not touch appeals, case_decisions, the D4.3 architecture, closure
--   authorisation, or any RLS policy.
-- * It adds no stored stage projection. Progression is derived.
--
-- ============================================================================
-- ROLLBACK (complete; no data to restore, because nothing was backfilled)
-- ============================================================================
--   drop trigger if exists log_investigation_conclusion_trigger on public.allegations;
--   drop trigger if exists protect_allegations_investigation_conclusion_trigger on public.allegations;
--   drop function if exists public.log_investigation_conclusion();
--   drop function if exists public.protect_allegations_investigation_conclusion_columns();
--   alter table public.allegations drop constraint if exists allegations_investigation_conclusion_check;
--   alter table public.allegations
--     drop column if exists investigation_conclusion,
--     drop column if exists investigation_conclusion_reasoning,
--     drop column if exists investigation_conclusion_by,
--     drop column if exists investigation_conclusion_at;
--   alter table public.audit_log drop column if exists allegation_id;
--   -- and remove the two actions from log_audit_event's reserved list.
--
-- Dropping the columns discards any conclusion recorded after this migration,
-- which is real data loss — export before rolling back. Rolling back does not
-- alter a single pre-migration value.
-- ============================================================================
