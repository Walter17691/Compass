-- ============================================================================
-- IR-REPORT-01b / B2 review — investigator narrative write authority
--
-- WHAT THIS CLOSES. `allegations.investigator_finding`,
-- `allegations.outstanding_uncertainty` and `allegations.witness_evidence` have
-- NO column-level write rule. They were deliberately left out of
-- protect_allegations_finding_columns, and the reason is recorded in
-- destructive_decision_authorization_2026-09-13.sql:122-126:
--
--   "investigator_finding is deliberately NOT included — that is the
--    Investigator's own submitted finding text, ordinary investigation
--    material an Investigator legitimately edits, not HR's/the disciplinary
--    officer's decision on it (Section 9: no regression to collaborative
--    work)."
--
-- The intent was to avoid over-restricting the investigator. The effect was
-- that the ONLY rule became `allegations`' single FOR ALL policy, which
-- delegates to `cases` — so every role that can write to the case could write
-- the investigator's assessment: the disciplinary officer, the line manager,
-- the location manager and the legal/compliance reviewer among them.
--
-- MEASURED, NOT INFERRED. On branch qlgspfzzfjepwzaryeoi a user holding only
-- `case_access.role = 'disciplinary_officer'` successfully wrote
-- witness_evidence (probe M-03b) — and, because B2 captures revisions, created
-- revision history on a narrative they had no business authoring.
--
-- THE PRODUCT RULE. Investigator findings belong to the INVESTIGATION workflow.
-- A disciplinary officer works from the adopted investigation report and the
-- disclosed evidence, and records their own disciplinary reasoning separately.
-- That separate workflow is untouched by this file: status, decision_reasoning,
-- decided_by, decided_at (protect_allegations_finding_columns), the case
-- outcome (protect_case_outcome_2026-08-27.sql), outcome_notes and
-- case_decisions all remain theirs and all remain independently enforced.
--
-- ┌─ WHY THIS IS NOT "DO NOT REGRESS COLLABORATIVE WORK" BEING OVERTURNED ──┐
-- │ That comment protected the INVESTIGATOR from being locked out of their  │
-- │ own material by a rule aimed at HR's decision columns. This trigger     │
-- │ keeps the investigator in (case_access.role = 'investigator') and keeps │
-- │ HR in. It removes only the roles that were never named in the UI        │
-- │ predicate in the first place — so it narrows the DATABASE to what the   │
-- │ application already intended, rather than narrowing the product.        │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- SCOPE OF THE BEHAVIOUR CHANGE, STATED PLAINLY. After this file, exactly two
-- principals may write the three narrative columns: HR in the case's
-- organisation, and the case's assigned investigator. That is IDENTICAL to the
-- corrected `mayRecordInvestigationNarrative` predicate in
-- src/lib/investigationAuthority.js, so no control the UI offers can now be
-- refused, and no control the UI withholds can now succeed by another route.
-- Live production counts before this change: 55 investigator_finding, 14
-- outstanding_uncertainty, 1 witness_evidence populated across 950 allegations.
-- Existing rows are not touched; only future INSERTs and UPDATEs are policed,
-- and an INSERT is policed only when it carries narrative CONTENT — raising an
-- issue with the narrative left empty, which is what the UI does, is unaffected.
-- ============================================================================


-- ── The guard ──────────────────────────────────────────────────────────────
--
-- Shaped deliberately as a near-copy of
-- protect_allegations_investigation_conclusion_columns() rather than as
-- something new: same early exit for service_role, same "did any governed
-- column actually change" test, same authority test, same errcode. Two rules
-- that mean "investigation work" should not be two different pieces of code.
--
-- WHAT IT DOES NOT COPY, on purpose: the conclusion trigger also re-checks the
-- confidential-case WRITE boundary and stamps provenance columns. Neither
-- applies here. There is no provenance column on a narrative to stamp, and the
-- confidential re-check is the conclusion trigger's own business — adding it
-- here would change who may write a narrative on a confidential case, which is
-- a separate decision nobody has taken.
--
-- THE ORGANISATION IS DERIVED FROM THE PARENT CASE, on both paths: the
-- attribution a caller supplies is not evidence of anything. allegations.case_id
-- is itself frozen by protect_allegations_case_attribution_trg
-- (investigation_finding_revisions_2026-10-08.sql §7), so the case is a stable
-- anchor to derive from.
create or replace function public.protect_allegations_investigator_narrative_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_case_id uuid;
  v_org_id  uuid;
  v_touches boolean;
begin
  -- The platform's own escape hatch, matching every other guard in this schema.
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- ── INSERT AND UPDATE, for a reason found by review ─────────────────────
  --
  -- The first cut of this file was BEFORE UPDATE only. The UI could not exploit
  -- that (addAllegation defaults all three columns to '' and createAllegation
  -- carries only title/description/period/peopleInvolved), but a hand-crafted
  -- PostgREST INSERT could set narrative text AT BIRTH — bypassing the entire
  -- invariant this file exists to create. An authority rule that only governs
  -- the second write is not an authority rule.
  --
  -- CREATING AN ISSUE IS NOT RESTRICTED, and must not become so: raising an
  -- issue is open to whoever can write to the case, and narrowing that would be
  -- a product change nobody asked for. What requires authority is INITIALISING
  -- NARRATIVE CONTENT. An absent, null or whitespace-only value is not content,
  -- so the ordinary creation path passes untouched.
  if tg_op = 'INSERT' then
    v_touches :=
         coalesce(btrim(new.investigator_finding), '') <> ''
      or coalesce(btrim(new.outstanding_uncertainty), '') <> ''
      or coalesce(btrim(new.witness_evidence), '') <> '';
    v_case_id := new.case_id;
  else
    -- Nothing governed changed -> nothing to authorise. This matters more than
    -- it looks: src/App.jsx's saveAllegationToDB sends the WHOLE row on every
    -- save, so a disciplinary officer legitimately editing `status` also
    -- re-sends all three narrative columns with their unchanged values.
    -- Comparing with `is distinct from` is what keeps that legitimate write
    -- working.
    v_touches :=
         new.investigator_finding    is distinct from old.investigator_finding
      or new.outstanding_uncertainty is distinct from old.outstanding_uncertainty
      or new.witness_evidence        is distinct from old.witness_evidence;
    v_case_id := old.case_id;
  end if;

  if not v_touches then
    return new;
  end if;

  -- ORGANISATION ATTRIBUTION IS DERIVED, NEVER ACCEPTED ───────────────────
  --
  -- Read from the parent case rather than from the row. On INSERT this is
  -- load-bearing: sync_allegations_org_id_trigger sorts AFTER this trigger
  -- alphabetically, so new.org_id is still whatever the caller sent. Trusting
  -- it would let a crafted INSERT nominate an organisation in which the caller
  -- happens to be HR and be measured against the wrong membership.
  --
  -- On UPDATE this replaces the previous `old.org_id` test. Equivalent today
  -- (org_id is synced from the case, and case_id is frozen by
  -- protect_allegations_case_attribution_trg) and strictly stronger: one code
  -- path, and no reliance on a column staying in step.
  select org_id into v_org_id from public.cases where id = v_case_id;
  if v_org_id is null then
    raise exception 'This allegation does not reference a real case'
      using errcode = '23503';
  end if;

  if not (
    exists (
      select 1 from public.org_members om
      where om.org_id = v_org_id
        and om.user_id = auth.uid()
        and public.is_hr_role(om.role)
    )
    or exists (
      select 1 from public.case_access ca
      where ca.case_id = v_case_id
        and ca.user_id = auth.uid()
        and ca.role = 'investigator'
    )
  ) then
    raise exception 'Only HR or this case''s assigned investigator can record investigator findings'
      using errcode = '42501';
  end if;

  return new;
end;
$$;

revoke all on function public.protect_allegations_investigator_narrative_columns() from anon, authenticated, public;

comment on function public.protect_allegations_investigator_narrative_columns() is
  'IR-REPORT-01b/B2 review. Restricts writes to allegations.investigator_finding, outstanding_uncertainty and witness_evidence to HR in the case org or the case''s assigned investigator. Mirrors mayRecordInvestigationNarrative() in src/lib/investigationAuthority.js exactly. Disciplinary officers read these fields (outcome letter, hearing pack, evidence matrix) and record their disciplinary reasoning separately.';

-- BEFORE INSERT OR UPDATE. Triggers fire alphabetically within an event, and
-- the resulting BEFORE-UPDATE order on allegations after both B2 migrations is:
--
--   1 block_auditor_write_allegations
--   2 log_investigation_conclusion_trigger
--   3 protect_allegations_appeal_decision_columns_trigger
--   4 protect_allegations_case_attribution_trg
--   5 protect_allegations_finding_columns_trigger
--   6 protect_allegations_investigation_conclusion_trigger
--   7 protect_allegations_investigator_narrative_trg      <-- this one
--   8 stamp_allegations_created_by_trigger
--   9 sync_allegations_org_id_trigger
--
-- An earlier draft of this comment claimed it "lands between the appeal-decision
-- and the case-attribution guards" — positions 3 and 4. That was simply wrong:
-- 'investigator_narrative' sorts after 'investigation_conclusion', so it is last
-- of the protect_* group. Corrected because a reader checking an ordering
-- argument against a false position would reach a false conclusion.
--
-- Nothing depends on the position. The function derives org_id from the PARENT
-- CASE rather than from new.org_id, so it does not care that
-- sync_allegations_org_id_trigger (9) has not run yet — which is exactly why
-- deriving rather than trusting the row was the right choice.
create trigger protect_allegations_investigator_narrative_trg
  before insert or update on public.allegations
  for each row
  execute function public.protect_allegations_investigator_narrative_columns();
