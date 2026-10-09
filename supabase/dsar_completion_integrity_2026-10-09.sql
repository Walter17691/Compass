-- ============================================================================
-- DSAR COMPLETION INTEGRITY
--
-- Separately deployable. Independent of IR-REPORT-01b/B2 and of the
-- over-disclosure containment slice. Nothing here touches investigator
-- narratives, revisions, or the export boundary.
--
-- WHAT THIS CLOSES. `dsar_requests.reviewed_flagged_sections` is the one field
-- that records a human having reviewed the flagged third-party mentions before
-- an official DSAR response went out. Nothing enforced it:
--
--   * `status` is bare `text not null default 'received'` — no CHECK, no
--     trigger, no policy clause. Measured against production 2026-10-08: of
--     the 13 public tables carrying a `status` column, TEN have
--     `check (status in (...))`. dsar_requests is one of only three without.
--     So `status` could be set to 'completed', 'Completed', or anything at all.
--   * `reviewed_flagged_sections` is referenced by no constraint, trigger or
--     policy anywhere in the schema.
--   * The ONLY gate was an <option> filter in src/screens/DsarScreen.jsx,
--     which omits "Completed" from the dropdown until the box is ticked. That
--     is bypassed by a direct updateDsarRequest call, by DevTools, or by
--     ticking the box, selecting Completed, and then unticking it.
--   * No audit row is written for a status change OR for the attestation, and
--     there is no record of WHO attested or WHEN.
--
-- ┌─ WHY A TRIGGER AND NOT THE OBVIOUS CHECK CONSTRAINT ────────────────────┐
-- │ The obvious fix is                                                      │
-- │   check (status <> 'completed' or reviewed_flagged_sections)             │
-- │ and it CANNOT BE APPLIED. ALTER TABLE ADD CONSTRAINT validates existing │
-- │ rows, and production holds 41 rows with status='completed' and          │
-- │ reviewed_flagged_sections=false. The statement would simply fail.       │
-- │                                                                         │
-- │ Those 41 rows are E2E test debris, not a real control failure — 138 of  │
-- │ the 140 dsar_requests rows have subject names of the form               │
-- │ 'E2E DSAR 1785…', and the number of NON-E2E rows completed without a    │
-- │ recorded review is ZERO. That is the honest finding, and it is why this │
-- │ file does NOT backfill the flag: writing `true` onto a historical row   │
-- │ would assert that a human review happened when none is recorded, which  │
-- │ is the one thing a compliance control must never do.                    │
-- │                                                                         │
-- │ NOT VALID was the other candidate and is worse here: it skips the       │
-- │ initial validation but still enforces on UPDATE, so editing the notes   │
-- │ on any of those 41 legacy rows would start failing.                     │
-- │                                                                         │
-- │ So the rule guards the TRANSITION rather than the row. Legacy rows may  │
-- │ exist and may be edited; what cannot happen is a new completion, or a   │
-- │ new withdrawal of an attestation that a completion relies on.           │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- WHAT THIS DOES NOT DO, STATED PLAINLY. It does not stop the browser writing a
-- file. compileSubjectData is pure client-side and downloadJson is an in-memory
-- blob, so no database rule can gate the download — the package is assembled
-- from rows the HR user already holds under RLS. This file makes the COMPLETION
-- RECORD truthful and the attestation accountable. The companion client change
-- stops the export being presented as an approved response while review is
-- outstanding. Those are different guarantees and conflating them would
-- overstate both.
-- ============================================================================


-- ── 1. The status vocabulary ────────────────────────────────────────────────
--
-- Applied as a normal validated constraint, because it CAN be: production holds
-- exactly two values, 'completed' (75) and 'received' (65), both in the
-- vocabulary the UI offers (src/screens/DsarScreen.jsx STATUS_LABEL).
--
-- This must land WITH the rule below, not after it. Without a closed
-- vocabulary, `status = 'Completed'` walks straight around any completion rule.
alter table public.dsar_requests
  add constraint dsar_requests_status_valid
  check (status in ('received', 'in_progress', 'ready_to_send', 'completed'));

comment on constraint dsar_requests_status_valid on public.dsar_requests is
  'The four statuses the product actually offers. Added because this table was one of only three status-bearing tables in the schema with no vocabulary constraint, which made any rule about a particular status trivially avoidable.';


-- ── 2. Reviewer identity and timestamp ─────────────────────────────────────
--
-- The attestation previously recorded only a boolean. "A named human reviewed
-- the flagged sections on this date" is the fact a DSAR regime has to be able
-- to evidence, and it was not recorded anywhere — not on the row, not in
-- audit_log.
--
-- Both columns are STAMPED BY THE TRIGGER, never accepted from the client, so
-- they cannot be backdated or attributed to someone else.
alter table public.dsar_requests
  add column if not exists reviewed_by uuid references auth.users(id),
  add column if not exists reviewed_at timestamptz;

comment on column public.dsar_requests.reviewed_by is
  'Who attested that the flagged sections were reviewed. Assigned from auth.uid() by dsar_requests_completion_integrity_guard(); never accepted from the client.';
comment on column public.dsar_requests.reviewed_at is
  'When that attestation was made. Assigned by the trigger; a client value is overwritten.';


-- ── 3. The guard ───────────────────────────────────────────────────────────
--
-- Four rules, in the order they matter:
--
--   (a) A request cannot BECOME completed without the attestation. Guards the
--       transition, so the 41 legacy rows are untouched and remain editable.
--   (b) The attestation cannot be WITHDRAWN from a completed request. Without
--       this, tick -> complete -> untick leaves a completed response with no
--       recorded review, which is the exact bypass the UI allowed.
--   (c) An attestation requires an IDENTIFIABLE HUMAN actor.
--   (d) Attesting stamps who and when. Un-attesting clears both, so the pair
--       never describes a state that is no longer true.
--
-- ┌─ WHY (c) EXISTS — found by behavioural testing, not by reading ─────────┐
-- │ The first draft of this guard did `new.reviewed_by := auth.uid()` with  │
-- │ no check on HOW the caller was authenticated. Proven on an isolated     │
-- │ branch (test T6b): a SERVICE-ROLE connection presenting a JWT whose     │
-- │ `sub` is a real HR Director produced a completed request, flagged as    │
-- │ reviewed, attributed to a Director who had reviewed nothing. RLS does   │
-- │ not stop this — service_role bypasses it — and triggers still fire, so  │
-- │ the guard was the only thing standing there, and it credited the human. │
-- │                                                                         │
-- │ This is the same defect this codebase already fixed once, in            │
-- │ investigation_finding_revisions_2026-10-08.sql (probe AT-03): privilege │
-- │ must be tested BEFORE the subject claim is trusted, because `sub` is    │
-- │ attacker-controlled in a privileged context while `auth.role()` is not. │
-- │                                                                         │
-- │ Forcing reviewed_by to NULL for a privileged caller is NOT sufficient   │
-- │ on its own: `reviewed_flagged_sections = true` with a NULL reviewer is  │
-- │ indistinguishable from the legacy rows, so an automated process could   │
-- │ still manufacture something that reads as approved. Hence the refusal.  │
-- │                                                                         │
-- │ One condition covers every case: v_actor is NULL for a privileged       │
-- │ caller AND for any caller with no subject at all, so service_role,      │
-- │ anon, and a maintenance session without a JWT are all refused, while    │
-- │ the signed-in Director path is untouched (regression-tested).           │
-- └─────────────────────────────────────────────────────────────────────────┘
--
-- SECURITY DEFINER with a pinned search_path, and EXECUTE revoked, matching the
-- other guards in this schema. It is placed alongside the existing
-- dsar_requests_employee_parentage_trg rather than replacing it; the two govern
-- different columns and both must run.
create or replace function public.dsar_requests_completion_integrity_guard()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  -- Privilege is read BEFORE the subject claim, and the subject claim is only
  -- trusted when the caller is not privileged. auth.role() comes from the JWT
  -- and survives SECURITY DEFINER; current_user would not, it is always the
  -- function owner here.
  v_privileged      boolean := coalesce(auth.role(), '') = 'service_role';
  v_actor           uuid    := case when v_privileged then null else auth.uid() end;
  v_was_completed   boolean := tg_op = 'UPDATE' and old.status = 'completed';
  v_is_completed    boolean := new.status = 'completed';
  v_was_reviewed    boolean := tg_op = 'UPDATE' and coalesce(old.reviewed_flagged_sections, false);
  v_is_reviewed     boolean := coalesce(new.reviewed_flagged_sections, false);
  v_new_attestation boolean := v_is_reviewed and not (tg_op = 'UPDATE' and coalesce(old.reviewed_flagged_sections, false));
begin
  -- (a) becoming completed requires the attestation
  if v_is_completed and not v_was_completed and not v_is_reviewed then
    raise exception
      'A subject access request cannot be completed until the flagged sections have been reviewed. Compile the response, review each flagged item, then record the review.'
      using errcode = 'check_violation';
  end if;

  -- (b) a completed request cannot have its attestation withdrawn
  if v_was_completed and v_is_completed and v_was_reviewed and not v_is_reviewed then
    raise exception
      'The review record cannot be withdrawn from a completed subject access request. Reopen the request first if the review needs to be redone.'
      using errcode = 'check_violation';
  end if;

  -- (c) an attestation is a human act, and must carry a name
  if v_new_attestation and v_actor is null then
    raise exception
      'A subject access review must be recorded by a signed-in HR Director. An automated or service-role process cannot attest that a human reviewed the flagged sections.'
      using errcode = 'check_violation';
  end if;

  -- (d) provenance is ASSIGNED, not accepted
  if v_new_attestation then
    new.reviewed_by := v_actor;
    new.reviewed_at := now();
  elsif not v_is_reviewed then
    new.reviewed_by := null;
    new.reviewed_at := null;
  else
    -- unchanged attestation: preserve the original provenance, so a later edit
    -- to any other column cannot quietly re-date the review
    new.reviewed_by := old.reviewed_by;
    new.reviewed_at := old.reviewed_at;
  end if;

  return new;
end;
$$;

revoke all on function public.dsar_requests_completion_integrity_guard() from anon, authenticated, public;

comment on function public.dsar_requests_completion_integrity_guard() is
  'Completion integrity for subject access requests: a request cannot become completed without a recorded review, the review cannot be withdrawn from a completed request, and reviewer identity/timestamp are stamped from auth.uid() rather than accepted. Guards the TRANSITION, not the row, so historical rows predating the rule remain valid and editable.';

create trigger dsar_requests_completion_integrity_trg
  before insert or update on public.dsar_requests
  for each row
  execute function public.dsar_requests_completion_integrity_guard();


-- ── 4. What is NOT here ────────────────────────────────────────────────────
--
-- NO BACKFILL. The 41 legacy completed-without-review rows are left exactly as
-- they are. See the header: asserting a review that is not recorded would be
-- the worst possible outcome for a control whose whole purpose is evidence.
--
-- NO CLEANUP of the 138 E2E rows. Deleting production rows is a separate,
-- separately authorised act. Worth noting that if they were removed, the
-- simpler `check (status <> 'completed' or reviewed_flagged_sections)` would
-- become applicable as a validated constraint and this trigger's rule (a)
-- could be retired in its favour.
--
-- NO DOWNLOAD GATE. It cannot live here — see the header.
--
-- NO completed_date ENFORCEMENT. The column exists and is populated on 0 of
-- 140 rows, so there is no behaviour to preserve and no evidence of what it was
-- intended to mean. Left alone rather than given a meaning by this file.
