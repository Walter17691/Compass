-- Manager Enablement & Delegation (Phase 4, MP5, §3) — Compass's own
-- structured triage summary, generated automatically once a concern
-- referral is submitted (never a manual trigger, and never a decision —
-- HR's own 5-action disposition is completely untouched by this). Column
-- names are prefixed ai_ to make clear at the schema level that this is
-- Compass's own extraction from the manager's free-text account, not a
-- second set of manager-entered fields.
ALTER TABLE public.concern_referrals
  ADD COLUMN IF NOT EXISTS ai_category text,
  ADD COLUMN IF NOT EXISTS ai_summary text,
  ADD COLUMN IF NOT EXISTS ai_witnesses_count integer,
  ADD COLUMN IF NOT EXISTS ai_evidence_mentioned jsonb NOT NULL DEFAULT '[]',
  ADD COLUMN IF NOT EXISTS ai_immediate_action text,
  ADD COLUMN IF NOT EXISTS ai_considerations text,
  ADD COLUMN IF NOT EXISTS ai_urgency text;
