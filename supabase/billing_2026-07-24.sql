-- ============================================================================
-- Stripe billing (test mode) — 2026-07-24
--
-- plan gating: 'free' = 1 active case at a time, no Portal/Calendar/DSAR/
-- compliance-digest access. 'pro' = unlimited cases + full feature set.
-- Enforced client-side via src/lib/plan.js's canUseFeature(), not RLS —
-- these are UX gates on a feature an org has or hasn't paid for, not a
-- security boundary between different people's data.
--
-- No RLS change needed — same "organisations" table, same existing policy.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

alter table organisations
  add column if not exists plan text not null default 'free',
  add column if not exists stripe_customer_id text,
  add column if not exists stripe_subscription_id text,
  add column if not exists stripe_subscription_status text;
