-- ============================================================================
-- Tribunal risk scoring: optional financial exposure fields — 2026-07-24
--
-- Both columns are nullable and entered manually by HR per-case when they
-- want an indicative tribunal exposure estimate (src/lib/tribunalEstimate.js)
-- shown next to the case's risk rating. Deliberately NOT part of the
-- employee_records CSV import/export (see supabase/compliance_nudges and
-- the HRIS CSV feature) — salary/age data is materially more sensitive
-- than the name/job-title/start-date/location fields that sync in bulk,
-- so it stays opt-in and scoped to one case at a time rather than being
-- pulled into the general employee sync pipeline.
--
-- No RLS changes needed — same "cases" table, same existing policy.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

alter table cases
  add column if not exists estimated_weekly_pay numeric,
  add column if not exists estimated_age_at_dismissal integer;
