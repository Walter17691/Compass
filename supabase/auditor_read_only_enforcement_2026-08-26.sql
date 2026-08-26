-- ============================================================================
-- Phase 6.5 — Structural remediation (Prompt 14, Section 7)
-- AUDITOR READ-ONLY ENFORCEMENT — closes independent audit finding 2.4
-- (billing half fixed in api/billing/_manage.js; this is the RLS half)
-- ============================================================================
-- roles.js labels 'auditor' "Auditor (read-only)" — the UI never offers
-- them a write action. But role_expansion_2026-08-09.sql's own header
-- comment says so explicitly: "auditor's write access is unchanged from
-- any org member's today — true read-only enforcement would mean
-- splitting every existing FOR ALL policy by command, which is a bigger,
-- separate change and explicitly not what this migration does." Worse
-- than merely unchanged: that same migration's has_confidential_case_
-- oversight() and manager_enablement_case_access_2026-08-13.sql's
-- can_see_all_org_cases() both added 'auditor' to their role list to
-- grant org-wide READ visibility into confidential cases — but
-- can_see_all_org_cases() is ALSO one of the OR conditions gating
-- `cases`' own UPDATE/DELETE policies (conflating "can see all cases"
-- with "can write to all cases"). The practical result, confirmed live
-- below: an auditor can UPDATE or DELETE any case in the org, including
-- confidential ones, despite being presented everywhere as read-only.
--
-- WHY A TRIGGER, NOT AN RLS REWRITE: `cases` alone has 5 overlapping
-- permissive policies (one FOR ALL plus 4 narrower per-command ones);
-- allegations/case_signals/case_tasks each have their own FOR ALL policy
-- granting write access to any org member who can access the parent
-- case — a baseline every OTHER role (line_manager, investigator,
-- location_manager) genuinely needs for real case work, so narrowing
-- that shared condition would risk breaking legitimate workflows for
-- everyone, not just auditor. A BEFORE trigger that unconditionally
-- rejects a write from a caller whose role is 'auditor' is purely
-- additive — it cannot loosen anything an RLS policy already restricts,
-- only add a check no existing policy encodes — and matches the same
-- technique already proven safe in this engagement (case_access's own
-- protect_case_access_grant() trigger, Family 1 Part 7).
--
-- HOW TO APPLY: paste the whole file in one Supabase SQL Editor run. It
-- is idempotent (CREATE OR REPLACE FUNCTION, DROP TRIGGER IF EXISTS)
-- and safe to re-run.
--
-- STATUS (Prompt 14, 2026-08-26): LIVE on production (npeegfsoijhdnnvuqjin).
-- Adversarially verified with a real throwaway auditor-role member: 400
-- "Auditors have read-only access and cannot modify this record" on
-- UPDATE cases, INSERT allegations, INSERT case_signals, and INSERT
-- case_tasks; SELECT on cases still succeeded (read access intact).
-- Positive control: the real HR-director test account's UPDATE to cases
-- still succeeds. Billing portal access (the other half of finding 2.4)
-- is now HR-only — see api/billing/_manage.js.
-- ============================================================================

-- For tables with their own org_id column: cases, case_tasks.
create or replace function public.block_auditor_write_org_scoped()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org_id uuid;
  v_role text;
begin
  v_org_id := coalesce(new.org_id, old.org_id);
  select role into v_role from public.org_members where user_id = auth.uid() and org_id = v_org_id limit 1;
  if v_role = 'auditor' then
    raise exception 'Auditors have read-only access and cannot modify this record';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists block_auditor_write_cases on public.cases;
create trigger block_auditor_write_cases
before insert or update or delete on public.cases
for each row execute function public.block_auditor_write_org_scoped();

drop trigger if exists block_auditor_write_case_tasks on public.case_tasks;
create trigger block_auditor_write_case_tasks
before insert or update or delete on public.case_tasks
for each row execute function public.block_auditor_write_org_scoped();

-- For tables that resolve their org only via case_id: allegations, case_signals.
create or replace function public.block_auditor_write_via_case()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case_id uuid;
  v_org_id uuid;
  v_role text;
begin
  v_case_id := coalesce(new.case_id, old.case_id);
  select org_id into v_org_id from public.cases where id = v_case_id;
  select role into v_role from public.org_members where user_id = auth.uid() and org_id = v_org_id limit 1;
  if v_role = 'auditor' then
    raise exception 'Auditors have read-only access and cannot modify this record';
  end if;
  return coalesce(new, old);
end;
$$;

drop trigger if exists block_auditor_write_allegations on public.allegations;
create trigger block_auditor_write_allegations
before insert or update or delete on public.allegations
for each row execute function public.block_auditor_write_via_case();

drop trigger if exists block_auditor_write_case_signals on public.case_signals;
create trigger block_auditor_write_case_signals
before insert or update or delete on public.case_signals
for each row execute function public.block_auditor_write_via_case();
