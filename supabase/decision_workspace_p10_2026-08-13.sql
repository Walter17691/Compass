-- ============================================================================
-- Decision Workspace enhancement (Process Intelligence Phase 3, P10) — 2026-08-13
-- ============================================================================
-- Adds two allegation-level fields the Decision-Maker Workspace spec (§7)
-- asks for, distinct from what decision_workspace_2026-08-12.sql already
-- added (decision_reasoning is the decision-maker's own finding; these are
-- separate: the investigator's own finding, recorded before the decision-
-- maker's, and any uncertainty the investigator flagged as still open).
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

alter table public.allegations
  add column if not exists investigator_finding text,
  add column if not exists outstanding_uncertainty text;
