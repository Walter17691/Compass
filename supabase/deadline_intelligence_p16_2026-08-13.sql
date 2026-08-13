-- ============================================================================
-- Deadline Intelligence expansion (Process Intelligence Phase 3, P16) — 2026-08-13
-- ============================================================================
-- Adds the dated fields computeDueSoon needs for the spec's remaining
-- deadline sources — fit notes, probation review, OH referral, suspension
-- review — none of which had any structured field to read before now
-- (see lib/caseStage.js's and lib/processTimeline.js's own forward-
-- reference comments to "P16" for exactly this).
--
-- oh_report_received_date is the "resolved" counterpart to
-- oh_referral_date — once set, the OH-report-chase deadline stops firing,
-- same pattern as wellbeing_notes.follow_up_done for wellbeing follow-ups.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

alter table public.cases
  add column if not exists fit_note_end_date date,
  add column if not exists probation_review_date date,
  add column if not exists oh_referral_date date,
  add column if not exists oh_report_received_date date,
  add column if not exists suspension_review_date date;
