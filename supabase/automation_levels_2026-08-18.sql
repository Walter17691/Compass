-- ============================================================================
-- Automation levels + signing request recipient email — 2026-08-18
-- ============================================================================
-- Integrations & Workflow Automation (Phase 5, IP28, §22-23) — Prepare
-- (Compass drafts, HR approves) and Automate (Compass performs an
-- approved low-risk administrative action automatically) execution
-- modes on top of IP5's read-only Suggest-level rule engine
-- (lib/automationRules.js). automation_levels is a simple {ruleId:
-- "suggest"|"prepare"|"automate"} map — one JSONB column, same
-- precedent as notification_webhook_url/type already on this table,
-- rather than a new table for what's genuinely just per-org config.
-- Which rule ids are even ELIGIBLE for prepare/automate (i.e. actually
-- have a real, safe administrative action behind them) is enforced in
-- code (lib/automationLevels.js's AUTOMATABLE_RULE_IDS), not by this
-- column — an org can't elevate a rule with no real action just by
-- editing this JSONB.
--
-- employee_email on signing_requests: the one automatable action this
-- phase wires up (resending a stale signature reminder) needs to know
-- who to email — that address was collected once at send time
-- (App.jsx's signEmail modal) but never actually persisted anywhere
-- retrievable, so a resend had no way to know the recipient. Additive,
-- and only populated going forward.
--
-- Purely additive and nullable — no existing row or query breaks.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

alter table public.organisations
  add column if not exists automation_levels jsonb default '{}'::jsonb;

alter table public.signing_requests
  add column if not exists employee_email text;
