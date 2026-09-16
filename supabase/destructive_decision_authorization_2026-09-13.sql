-- ============================================================================
-- Destructive & decision action authorization — 2026-09-13 (P1 hardening)
-- ============================================================================
-- Bounded follow-up to the three-level case permission model (deployed
-- earlier this session, FROZEN and unchanged by this file). That model
-- controls WHICH CASES a user can see (case_access_level). This file adds
-- a second, independent axis for exactly five destructive/decision
-- actions that were relying solely on case scope: WHETHER a user who can
-- already see a case may also perform one of these specific actions on
-- it. Ordinary collaborative case work (evidence, tasks, meetings, basic
-- case-detail edits) is completely untouched — an Investigator/Line
-- Manager/Location Manager with case_access keeps exactly the capability
-- they have today for that work.
--
-- Traced first, per instruction, rather than inferred from names:
--   - Case deletion: exactly one client entry point (OverviewTab.jsx's
--     "Delete case" button), no role gate anywhere, no documented or
--     comment-evidenced non-HR delete workflow found anywhere in the
--     codebase or docs/. DB-authoritative rule: HR only (hr_director,
--     hr_manager — is_hr_role()). No carve-out for disciplinary_officer,
--     case_owner, creator, or Level 1 alone — confirmed no such intent
--     exists.
--   - Case closure: three writers of cases.stage='closed'. One
--     (resolveInvestigationReview, via HrReviewGatePanel) is already
--     correctly isHR-gated in the UI. The other two (requestCloseCase,
--     bulkClose) have zero role gate — any case_access holder can close.
--     No documented non-HR closure intent found either. DB-authoritative
--     rule: HR only, same as deletion.
--   - Allegation finding: the UI's own canDecide flag
--     (isHR || myAccess?.role==='disciplinary_officer', CaseViewScreen.jsx)
--     already states the intended rule — the DB has never enforced it.
--     This migration makes enforcement match that already-decided intent
--     exactly, nothing more.
--   - Appeal outcome/action: traced exhaustively and NOT implemented here.
--     No independent, enforced "appeal officer" concept exists anywhere in
--     the codebase today — appeal_manager is a labelled case_access role
--     with a purely advisory, dismissible natural-justice warning
--     (checkAppealManagerConflict in guardrails.js) that is never read by
--     canDecide, the appeal-outcome UI, recordAppealOutcome, or
--     HandoffModal (which reuses the disciplinary_officer machinery
--     unconditionally, even when its own button reads "Appoint appeal
--     officer"). Building a hard gate here would invent new product
--     behaviour, not enforce existing intent — explicitly out of scope
--     per instruction, reported as a separate product-decision item.
--   - Audit log integrity: hardened via a new authoritative RPC — see its
--     own section below for the full design rationale.
-- ============================================================================


-- ============================================================================
-- PART 1 — case deletion: HR-only, DB-authoritative
-- ============================================================================
-- Additive RESTRICTIVE policy — ANDs with the existing scope-based delete
-- policy from the three-level migration (untouched, not edited). Legal
-- Reviewer is Level 1 (sees everything) but is_hr_role() is hr_director/
-- hr_manager only, so Legal Reviewer is correctly excluded from deletion
-- despite full read access — matching the instruction's "DENY unless
-- product intent proves otherwise," and none was found.
create policy "Only HR can delete a case" on public.cases
as restrictive for delete
using (
  exists (
    select 1 from public.org_members om
    where om.org_id = cases.org_id and om.user_id = auth.uid() and public.is_hr_role(om.role)
  )
);


-- ============================================================================
-- PART 2 — case closure: HR-only, DB-authoritative
-- ============================================================================
-- No column-level protection existed on cases.stage at all before this.
-- Scoped narrowly to the CLOSE transition only (old.stage is distinct from
-- 'closed' AND new.stage = 'closed') — this migration does not attempt to
-- protect every possible stage transition, only the one instruction asked
-- for. resolveInvestigationReview's existing isHR-gated UI path continues
-- to work unchanged (it was always going to satisfy this check); the two
-- previously-ungated paths (requestCloseCase, bulkClose) are now backed
-- by this trigger regardless of what the UI does — see the accompanying
-- code changes for the matching UI-side guard (Section 8/9 of the review:
-- UI should reflect the authoritative rule, but the DB is the real
-- boundary either way).
create or replace function public.protect_case_closure()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if new.stage = 'closed' and old.stage is distinct from 'closed' then
    if not exists (
      select 1 from public.org_members om
      where om.org_id = old.org_id and om.user_id = auth.uid() and public.is_hr_role(om.role)
    ) then
      raise exception 'Only HR can close a case' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger protect_case_closure_trigger
before update on public.cases
for each row execute function public.protect_case_closure();


-- ============================================================================
-- PART 3 — allegation finding: DB enforcement now matches the existing UI
-- intent (isHR OR this case's own disciplinary_officer) exactly
-- ============================================================================
-- Splits the single 6-column trigger (protect_allegations_decision_columns_
-- trigger, role_expansion_2026-08-09.sql) into two, so the finding columns
-- (in scope, broadened to match canDecide) and the appeal columns (out of
-- scope this phase, left byte-identical to today) can evolve independently
-- without the appeal-decision question being silently answered as a side
-- effect of fixing the finding-column gap.
--
-- decided_at is included alongside status/decided_by/decision_reasoning —
-- not named in the original instruction, but it is the timestamp of the
-- exact same action ("recording a finding"); leaving it unprotected while
-- protecting decided_by would let a non-qualifying user forge the decision
-- date even though they can't touch who decided or what was decided.
-- investigator_finding is deliberately NOT included — that is the
-- Investigator's own submitted finding text, ordinary investigation
-- material an Investigator legitimately edits, not HR's/the disciplinary
-- officer's decision on it (Section 9: no regression to collaborative
-- work).
drop trigger if exists protect_allegations_decision_columns_trigger on public.allegations;

create or replace function public.protect_allegations_finding_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  if (new.status is distinct from old.status)
     or (new.decided_by is distinct from old.decided_by)
     or (new.decision_reasoning is distinct from old.decision_reasoning)
     or (new.decided_at is distinct from old.decided_at)
  then
    if not (
      exists (
        select 1 from public.org_members om
        where om.org_id = old.org_id and om.user_id = auth.uid() and public.is_hr_role(om.role)
      )
      or exists (
        select 1 from public.case_access ca
        where ca.case_id = old.case_id and ca.user_id = auth.uid() and ca.role = 'disciplinary_officer'
      )
    ) then
      raise exception 'Only HR or this case''s disciplinary officer can record an allegation finding' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

create trigger protect_allegations_finding_columns_trigger
before update on public.allegations
for each row execute function public.protect_allegations_finding_columns();

-- Appeal columns — unchanged behaviour (HR-only), just re-declared as
-- their own trigger so PART 3 above can evolve without touching this.
-- Same function, same effective columns as before this migration.
create trigger protect_allegations_appeal_columns_trigger
before update on public.allegations
for each row execute function public.protect_hr_or_immutable_columns(
  'appeal_outcome', 'appeal_decided_by', 'appeal_reasoning'
);


-- ============================================================================
-- PART 4 — audit_log integrity
-- ============================================================================
-- BEFORE this migration: audit_log_insert_self (audit_log_cloud_sync_
-- 2026-07-25.sql) let any authenticated org member INSERT any row with any
-- action/detail/user_name/case_id text, constrained only to their own
-- org_id and user_id. user_id/org_id forgery was already impossible
-- (that policy's WITH CHECK already required both to match the caller);
-- the real gaps were: (1) user_name freely claimable as anyone's display
-- name, (2) case_id never verified to belong to org_id or be visible to
-- the caller at all, (3) action/detail completely free text.
--
-- Inventory performed before designing this (per instruction, not
-- inferred): exactly ONE client-side write path exists in the whole
-- codebase — the audit() closure in src/App.jsx (grep confirmed: a single
-- `supabase.from('audit_log').insert(...)` call site), called by ~60
-- sites across App.jsx and child components via prop-drilling (e.g.
-- OutcomeModal.jsx's "Outcome issued"). Converting that ONE line to call
-- this RPC covers every existing client-side audit call with zero
-- call-site changes elsewhere. Four SEPARATE server-side (service-role)
-- writers exist in api/team/* and api/delete-org-data.js — these already
-- write server-derived, non-client-forgeable identity/name values and are
-- UNCHANGED by this migration (service-role bypasses RLS regardless of
-- any policy here).
--
-- On a full action-string allow-list: enumerated every distinct action
-- string reachable from the client (~60, across App.jsx and child
-- components). Most are fixed literals, genuinely enumerable — but a
-- handful are composed at runtime from OTHER already-configurable label
-- sets (meeting-type labels, outcome free-text, case-role labels via
-- caseRoleLabel()). A rigid CHECK enum would need to import and stay in
-- lockstep with those separate JS constant lists — the exact "second,
-- independently-evolving predicate that drifts from the real source of
-- truth" failure mode this codebase has already been burned by once
-- (documented in api/_auth.js's own header, re: requireCaseAccess
-- replacing a hand-rolled JS predicate). Not implemented as a blanket
-- rule for that reason. Instead: identity/org/case-access are now
-- authoritatively server-derived for EVERY audit event (closes the two
-- real, broad gaps), and the three SPECIFIC high-stakes action strings
-- named in the review's own test matrix get targeted, structural
-- protection:
--   - 'Case deleted' — REJECTED if passed to this generic RPC at all; the
--     only way to produce this exact entry is delete_case() (Part 5
--     below), which writes it directly, hard-coded, atomically with the
--     real deletion, in the same transaction. Structurally unforgeable:
--     the entry can only exist if a case genuinely was just deleted by
--     someone this RPC itself verified is HR.
--   - 'Outcome issued' — requires the referenced case's own cases.outcome
--     to be non-null at the moment of logging. finalizeOutcome
--     (OutcomeModal.jsx) always sets cases.outcome immediately before
--     calling audit(), so this holds for every genuine call and fails for
--     a forged one where no outcome was actually set.
--   - 'Case access level changed' — requires the caller to currently hold
--     case_access_level = 1 or an HR role for that org, mirroring exactly
--     what protect_org_member_privilege_columns already requires to make
--     such a change for real. Doesn't retroactively prove a specific
--     change happened (there's no persisted "last changed by" column to
--     check against), but closes the most abusive case: someone with no
--     authority to ever make this change claiming they did.
-- Ordinary (non-flagged) action/detail text remains client-supplied and
-- trusted once identity/org/case-access are verified — an explicit,
-- reported limitation of this bounded phase, not a silent gap.
create or replace function public.log_audit_event(
  p_org_id uuid,
  p_action text,
  p_detail text default '',
  p_case_id uuid default null,
  p_ai_prepared boolean default false,
  p_approved_by text default null,
  p_data_used text default null
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

  if p_action = 'Case deleted' then
    raise exception 'This action can only be logged by the case deletion function itself';
  end if;

  select * into v_member from public.org_members where org_id = p_org_id and user_id = auth.uid();
  if v_member.id is null then
    raise exception 'Not a member of this organisation';
  end if;
  v_user_name := v_member.name;

  if p_case_id is not null then
    select * into v_case from public.cases where id = p_case_id and org_id = p_org_id;
    if v_case.id is null then
      -- errcode 42501, not the plain default (P0001) — src/lib/retryOnFkRace.js's
      -- withFkRetry wrapper (already used by every call to this function
      -- from App.jsx's audit() helper) retries once on exactly this code,
      -- because a freshly-created case's own row can still be mid-commit
      -- when its first audit event fires; that race predates this RPC and
      -- must keep working, not just the old raw INSERT it replaces.
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

grant execute on function public.log_audit_event(uuid, text, text, uuid, boolean, text, text) to authenticated;

-- Force every future authenticated write through log_audit_event (or the
-- dedicated delete_case() RPC): drop the direct-insert policy entirely.
-- Historical rows are untouched — this only changes future INSERTs.
-- Service-role writers (api/team/*, api/delete-org-data.js) are
-- unaffected: service-role bypasses RLS regardless of this policy's
-- existence.
drop policy if exists "audit_log_insert_self" on public.audit_log;


-- ============================================================================
-- PART 5 — case deletion RPC: atomic delete + forgery-proof audit entry
-- ============================================================================
-- Self-contained authorization check (does not rely solely on PART 1's
-- RLS policy, so this function's own guarantee doesn't depend on RLS
-- being correctly configured elsewhere) plus a real, structurally-
-- unforgeable 'Case deleted' audit entry written in the SAME transaction
-- as the actual delete — the entry can only exist if a genuine deletion,
-- by a caller this function itself verified is HR, just happened.
create or replace function public.delete_case(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_case record;
  v_user_name text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  select * into v_case from public.cases where id = p_case_id;
  if v_case.id is null then
    raise exception 'Case not found';
  end if;

  if not exists (
    select 1 from public.org_members om
    where om.org_id = v_case.org_id and om.user_id = auth.uid() and public.is_hr_role(om.role)
  ) then
    raise exception 'Only HR can delete a case' using errcode = '42501';
  end if;

  select name into v_user_name from public.org_members where org_id = v_case.org_id and user_id = auth.uid();

  insert into public.audit_log (org_id, user_id, user_name, action, detail, case_id)
  values (v_case.org_id, auth.uid(), coalesce(v_user_name, 'Unknown'), 'Case deleted', v_case.employee_name, v_case.id);

  delete from public.cases where id = p_case_id;
end;
$$;

grant execute on function public.delete_case(uuid) to authenticated;
