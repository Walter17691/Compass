-- ============================================================================
-- Employee records — richer field set for HRIS sync — 2026-08-18
-- ============================================================================
-- Integrations & Workflow Automation (Phase 5, IP20, §14 cont.) —
-- employee data sync with historical accuracy. employee_records today
-- only holds name/job_title/start_date/location (see
-- baseline_schema_2026-08-06.sql) — this adds the rest of the canonical
-- HRIS field set lib/hrisAdapter.js already defines (IP19), so a real
-- sync (or the existing CSV import) has somewhere to actually write
-- employee_number/department/manager/status/working_pattern/
-- probation_end_date.
--
-- Purely additive and nullable — no existing row or query breaks.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

alter table public.employee_records
  add column if not exists employee_number text,
  add column if not exists department text,
  add column if not exists manager text,
  add column if not exists status text,
  add column if not exists working_pattern text,
  add column if not exists probation_end_date text;
