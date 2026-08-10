-- ============================================================================
-- Timeline overrides — 2026-08-10
-- ============================================================================
-- Phase 8 of the reasoning-layer build-out. buildCaseTimeline() (existing,
-- src/lib/caseTimeline.js) already merges meetings/letters/allegations/
-- audit log into one read-only view — nothing here is a new source of
-- truth for events themselves. This one small JSONB column holds the
-- three things a user can actually do to that derived view without
-- editing the underlying records: exclude an entry as noise, override its
-- description, and cache an AI-generated one-line relevance note per
-- entry (keyed by the entry's own stable key, so a regenerated timeline
-- still lines up with prior edits).
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

alter table public.cases
  add column if not exists timeline_overrides jsonb not null default '{}'::jsonb;
