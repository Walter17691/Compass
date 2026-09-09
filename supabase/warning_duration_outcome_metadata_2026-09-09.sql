-- ============================================================================
-- Structured outcome metadata — 2026-09-09 (closes Defects #12, #14)
--
-- cases.outcome has been the sole persisted outcome fact. OutcomeModal
-- already captured an issue timestamp and HR-entered notes at the moment
-- an outcome was recorded, but neither was ever persisted (no columns
-- existed for either — App.jsx's saveCaseToDB payload simply didn't
-- include them), and warning duration/expiry were never captured at all:
-- the only place a duration number ever existed was as free prose inside
-- whichever meeting record the AI happened to generate, with no
-- structured source for formal-letter grounding or validation to check
-- a generated letter's stated duration against.
--
-- Additive, nullable columns — every existing case remains valid with no
-- backfill, including cases that already have outcome != null recorded
-- before this migration. This deliberately does NOT infer or backfill
-- warning_duration_months/warning_expires_at for any existing outcome;
-- the application provides a separate "Complete outcome details" path
-- (distinct from re-issuing) for an authorised HR user to explicitly
-- confirm those values for a case decided before this migration existed.
-- ============================================================================

alter table public.cases
  add column if not exists outcome_issued_at timestamptz null,
  add column if not exists outcome_notes text null,
  add column if not exists warning_duration_months integer null,
  add column if not exists warning_expires_at date null;

-- Not an employment-policy default (no fixed "first warning = 6 months"
-- assumption anywhere) — purely a fat-finger safety ceiling. 60 months
-- (5 years) is comfortably above any real UK disciplinary warning
-- duration ever discussed in this codebase's own letter-drafting
-- instructions (6-24 months) while still catching an obviously-wrong
-- entry (e.g. a stray extra digit). Existing rows with no outcome
-- recorded, or a non-warning outcome, are unaffected — the column stays
-- null for them, which this constraint always allows.
alter table public.cases
  add constraint cases_warning_duration_months_check
  check (warning_duration_months is null or (warning_duration_months > 0 and warning_duration_months <= 60));

comment on column public.cases.outcome_issued_at is
  'When cases.outcome was actually decided/recorded — the authoritative timestamp formal letters and appeal-window logic should ground on. Null for cases decided before this column existed; see the app''s "Complete outcome details" path for backfilling an explicit, HR-confirmed value rather than inventing one.';
comment on column public.cases.outcome_notes is
  'HR-entered rationale for the outcome, captured by OutcomeModal at issue time. Subject to the same access boundary as cases.outcome (protect_case_hr_only_columns) — never more widely readable than the case/outcome itself already is.';
comment on column public.cases.warning_duration_months is
  'Only meaningful when outcome is a warning type (First written warning / Final written warning). Null for every other outcome and for warnings decided before this column existed. Never inferred from meeting text or defaulted — always an explicit HR entry.';
comment on column public.cases.warning_expires_at is
  'Always application-derived from outcome_issued_at + warning_duration_months (see lib/dateMath.js''s addCalendarMonths) — never independently entered by a user, and never asked of the AI letter-drafting pipeline.';

-- Extends the existing outcome-change guard (protect_case_outcome_
-- 2026-08-27.sql) to the four new outcome-metadata columns with the
-- exact same authorization boundary already enforced for outcome itself
-- — they only ever change together, as one atomic "issue/complete
-- outcome" write, so one combined condition is correct here rather than
-- four separately-maintained ones that could drift from each other or
-- from cases.outcome's own boundary over time. investigation_paused's
-- own branch, and every other trigger on this table, is untouched.
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

  if (
    new.outcome is distinct from old.outcome
    or new.outcome_issued_at is distinct from old.outcome_issued_at
    or new.outcome_notes is distinct from old.outcome_notes
    or new.warning_duration_months is distinct from old.warning_duration_months
    or new.warning_expires_at is distinct from old.warning_expires_at
  ) then
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
