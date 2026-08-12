-- ============================================================================
-- Advanced Appeal Workspace — 2026-08-12
-- ============================================================================
-- Phase 19 of the reasoning-layer build-out (scale/commercialisation wave,
-- after ER organisational intelligence). Builds on the existing appeal-
-- detection flow (appealLink.js, unchanged) and Phase 16's Decision
-- Workspace pattern exactly — same shape (an outcome + reasoning + who/
-- when), but for the appeal's own decision, which is separate from and
-- layered on top of the original finding (decision_reasoning/decided_by/
-- decided_at, decision_workspace_2026-08-12.sql). The chair records the
-- appeal outcome; Compass only ever assembles a neutral comparison
-- (grounds of appeal vs. the original finding vs. any new evidence) as a
-- case_signal, same substrate as everything else Compass "notices" —
-- never the outcome itself.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

alter table public.allegations
  add column if not exists appeal_outcome text
    check (appeal_outcome in ('upheld','partially_upheld','not_upheld','further_investigation_required')),
  add column if not exists appeal_reasoning text,
  add column if not exists appeal_decided_by uuid references auth.users(id),
  add column if not exists appeal_decided_at timestamptz;
