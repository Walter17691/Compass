-- ============================================================================
-- Decision Workspace — 2026-08-12
-- ============================================================================
-- Phase 16 of the reasoning-layer build-out (last of the "process
-- intelligence" wave: policy intelligence -> procedural guardrails ->
-- deadline engine -> decision workspace). allegations.status already holds
-- the four findings (substantiated / partially_substantiated /
-- not_substantiated / unable_to_determine) alongside the pre-decision
-- states (case_structure_2026-08-09.sql) — this only adds the HR
-- decision-maker's own reasoning for that finding, and who/when recorded
-- it, so a finding is never just a bare status flip with no accountability
-- trail. Cases without allegations keep OutcomeTab's existing single-
-- outcome flow completely unchanged; this only touches the allegation-based
-- path.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

alter table public.allegations
  add column if not exists decision_reasoning text,
  add column if not exists decided_by uuid references auth.users(id),
  add column if not exists decided_at timestamptz;
