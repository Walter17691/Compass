-- ============================================================================
-- Protect cases.outcome — 2026-08-27 (closes Prompt 16 audit finding C1,
-- CRITICAL)
--
-- Live-verified during the audit: cases' own UPDATE RLS policy grants full
-- write access to the row if ANY case_access row exists for the caller on
-- that case, with no check on the case_access row's own role. Confirmed
-- live with a real test user granted only the "notetaker" case_access role
-- (explicitly read-only by the app's own canDecide logic,
-- CaseViewScreen.jsx: `isHR || myAccess?.role==="disciplinary_officer"`) —
-- they were able to directly UPDATE cases.outcome to an arbitrary value.
-- No trigger protected this column: protect_case_hr_only_columns only
-- covered investigation_paused; the other case triggers cover org_id/
-- created_by (immutable) and owner_id/employee_email/location_id/
-- confidential (protect_hr_or_immutable_columns) — outcome was the one
-- decision-relevant column with no column-level guard at all.
--
-- Fix: extend protect_case_hr_only_columns (already a BEFORE UPDATE
-- trigger on cases) to also require the caller be HR or this case's own
-- disciplinary_officer before outcome can change — the exact same
-- boundary CaseViewScreen's canDecide already enforces client-side, now
-- enforced where it actually matters. is_hr_role (hr_manager/hr_director
-- only), not the broader can_see_all_org_cases (which also includes
-- legal_reviewer/auditor) — canDecide only ever checks isHR, and an
-- auditor being able to set a live outcome would defeat the point of a
-- read-only oversight role.
-- ============================================================================

create or replace function public.protect_case_hr_only_columns()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if (new.investigation_paused is distinct from old.investigation_paused) then
    if auth.role() <> 'service_role' and not exists (
      select 1 from public.org_members
      where org_id = old.org_id and user_id = auth.uid() and public.can_see_all_org_cases(role)
    ) then
      raise exception 'Only HR can pause or resume an investigation';
    end if;
  end if;

  if (new.outcome is distinct from old.outcome) then
    if auth.role() <> 'service_role' and not (
      exists (
        select 1 from public.org_members
        where org_id = old.org_id and user_id = auth.uid() and public.is_hr_role(role)
      )
      or exists (
        select 1 from public.case_access
        where case_id = old.id and user_id = auth.uid() and role = 'disciplinary_officer'
      )
    ) then
      raise exception 'Only HR or this case''s disciplinary officer can set the case outcome';
    end if;
  end if;

  return new;
end;
$$;
