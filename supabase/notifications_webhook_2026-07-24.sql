-- ============================================================================
-- Slack/Teams deadline notifications — 2026-07-24
--
-- Rides the existing daily digest cron (api/cron/_digest.js) rather than
-- adding a new schedule/endpoint — the same "urgent" deadline set already
-- computed per org for the email digest is also posted to the org's chat
-- webhook if one is configured.
--
-- No RLS change needed — same "organisations" table, same existing policy.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

alter table organisations
  add column if not exists notification_webhook_url text,
  add column if not exists notification_webhook_type text;
