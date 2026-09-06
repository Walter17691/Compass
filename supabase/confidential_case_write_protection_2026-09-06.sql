-- ============================================================================
-- CONFIDENTIAL CASE WRITE PARITY + AUDITOR case_themes READ-ONLY ENFORCEMENT
-- (P0 security remediation, 2026-09-06 — closes both findings from the
-- read-only "CASES UPDATE / CONFIDENTIALITY + AUDITOR MUTATION CAPABILITY"
-- audit run the same day)
-- ============================================================================
-- FINDING 1 — HR MANAGER BLIND WRITE ON CONFIDENTIAL CASES
--
-- `cases`' own RESTRICTIVE policies are, confirmed live immediately before
-- drafting this fix:
--   SELECT  (confidentiality): confidential=false OR created_by=auth.uid()
--           OR case_access OR has_confidential_case_oversight(role)
--   UPDATE/DELETE (ownership): can_see_all_org_cases(role) OR created_by
--           OR owner_id OR case_access
-- can_see_all_org_cases() includes 'hr_manager'; has_confidential_case_
-- oversight() deliberately does not. Because the UPDATE/DELETE policy has
-- no confidentiality term at all, an hr_manager with no created_by/
-- case_access relationship to a confidential case fails the SELECT policy
-- (cannot read the row) but passes the UPDATE/DELETE policy (can blind-
-- write or blind-delete it), purely because can_see_all_org_cases('hr_
-- manager')=true. api/_auth.js's own requireCaseAccess comment documents
-- this identical asymmetry as something already fixed for that one API
-- helper — this migration closes the same gap where it actually lives,
-- at the RLS/trigger layer, for every caller (browser included).
--
-- NOTE ON owner_id: the live confidentiality SELECT policy does NOT
-- include owner_id as an exemption term (only created_by, case_access,
-- and confidential-oversight roles do). Re-confirmed live immediately
-- before writing this migration (byte-identical to the audit report).
-- The write-exemption set below deliberately mirrors that SELECT policy
-- exactly — owner_id is NOT included — so WRITE AUTHORITY stays a subset
-- of AUTHORITATIVE (confidentiality) VISIBILITY. An owner-only hr_manager
-- who cannot SELECT a confidential case must not be able to write it
-- either; this migration does not change that they still cannot.
--
-- MECHANISM: an additive BEFORE UPDATE OR DELETE trigger on `cases`,
-- following the exact technique already proven safe in this codebase for
-- Auditor (auditor_read_only_enforcement_2026-08-26.sql's own header
-- explains why a trigger, not an RLS rewrite, was chosen there — the same
-- reasoning applies here unchanged: cases' permissive ALL/ownership
-- policies are shared by every role that needs ordinary case write access,
-- so narrowing them risks legitimate workflows; a BEFORE trigger is purely
-- additive and can only add a check no existing policy encodes, never
-- loosen one). Only fires when OLD.confidential = true, so ordinary-case
-- workflows (OLD.confidential = false) are completely untouched — covers
-- confidential->confidential, confidential->ordinary (blind declassify),
-- and DELETE of a confidential row. Marking an ordinary case confidential
-- (ordinary->confidential) is unaffected by this trigger and remains
-- gated exactly as before by the pre-existing protect_cases_hr_columns_
-- trigger (which already restricts the `confidential` column itself to
-- is_hr_role — hr_manager/hr_director), so a caller who can already fully
-- edit a non-confidential row (nothing hidden from them) is not newly
-- restricted by this migration.
--
-- Auditor is already unconditionally blocked from writing `cases` at all
-- by the pre-existing block_auditor_write_cases trigger (confirmed still
-- live) — that trigger fires independently of this one (either raising
-- an exception aborts the statement), so this new trigger does not need
-- to special-case auditor, and does not accidentally re-open auditor
-- write access even though has_confidential_case_oversight('auditor')
-- is true (which is otherwise sufficient to pass THIS trigger's own
-- check — auditor never reaches that point because the older trigger
-- fires and blocks first).
--
-- TRIGGER INVENTORY ON `cases` (read live immediately before drafting):
--   block_auditor_write_cases          BEFORE INS/UPD/DEL  block_auditor_write_org_scoped()
--   protect_case_hr_only_columns_trigger BEFORE UPDATE     protect_case_hr_only_columns()
--   protect_cases_hr_columns_trigger   BEFORE UPDATE       protect_hr_or_immutable_columns('owner_id','employee_email','location_id','confidential')
--   protect_cases_identity_trigger     BEFORE UPDATE       protect_immutable_columns('org_id','created_by')
-- None fire on DELETE except block_auditor_write_cases — this migration's
-- new trigger is the first general confidentiality protection to cover
-- DELETE at all. All four existing triggers are pure validators (each
-- either returns the row unchanged or raises) with no interdependency;
-- adding a fifth validator in the same style cannot produce a conflicting
-- result — whichever trigger's condition is violated raises first and
-- aborts the whole statement, and Postgres's alphabetical BEFORE-trigger
-- ordering among validators-only triggers has no observable effect here.
--
-- service_role is bypassed explicitly (matching protect_hr_or_immutable_
-- columns/protect_immutable_columns' own convention) so
-- api/delete-org-data.js's existing hr_director-gated bulk erasure
-- (the only service-role path that writes `cases`, confirmed via repo-
-- wide grep before this migration) continues to work unchanged.
--
-- RECURSION: this function queries case_access and org_members only,
-- neither of which reference `cases` in any policy that would recurse
-- back into this trigger. Same one-directional shape already used by
-- block_auditor_write_org_scoped.
-- ============================================================================

create or replace function public.protect_confidential_case_write()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_role text;
begin
  if auth.role() = 'service_role' then
    return coalesce(new, old);
  end if;

  -- Only the OLD row's confidentiality matters: this gate exists to stop
  -- a caller from touching a confidential row they cannot SELECT, not to
  -- restrict who may mark an already-editable ordinary case confidential
  -- (that remains protect_cases_hr_columns_trigger's job, unchanged).
  if old.confidential is distinct from true then
    return coalesce(new, old);
  end if;

  if old.created_by = auth.uid() then
    return coalesce(new, old);
  end if;

  if exists (
    select 1 from public.case_access ca
    where ca.case_id = old.id and ca.user_id = auth.uid()
  ) then
    return coalesce(new, old);
  end if;

  select role into v_role
  from public.org_members
  where org_id = old.org_id and user_id = auth.uid()
  limit 1;

  if public.has_confidential_case_oversight(v_role) then
    return coalesce(new, old);
  end if;

  raise exception 'You do not have access to modify this confidential case'
    using errcode = '42501';
end;
$$;

drop trigger if exists protect_confidential_case_write_trigger on public.cases;
create trigger protect_confidential_case_write_trigger
before update or delete on public.cases
for each row execute function public.protect_confidential_case_write();

-- ============================================================================
-- FINDING 2 — AUDITOR CAN MUTATE case_themes
--
-- auditor_read_only_enforcement_2026-08-26.sql added block_auditor_write_
-- via_case() and wired it to allegations/case_signals; case_themes did not
-- exist as an EXISTS-delegated, trigger-eligible target at that time in the
-- same form (its RLS policy was only rewritten to the current EXISTS-only
-- shape by case_themes_case_signals_authoritative_case_access_2026-09-05.sql)
-- and nobody added the matching trigger for it afterwards. Confirmed live
-- immediately before this migration: case_themes carries only
-- sync_case_themes_org_id_trigger (BEFORE INSERT/UPDATE, org_id sync,
-- unrelated) — no auditor-write trigger. case_themes.case_id is NOT NULL
-- (confirmed via information_schema), matching block_auditor_write_via_
-- case()'s existing assumption exactly (same precondition case_signals
-- already relies on) — the existing helper is reused as-is, no second
-- implementation of the same concept.
-- ============================================================================

drop trigger if exists block_auditor_write_case_themes on public.case_themes;
create trigger block_auditor_write_case_themes
before insert or update or delete on public.case_themes
for each row execute function public.block_auditor_write_via_case();
