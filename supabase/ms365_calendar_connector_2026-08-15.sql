-- ============================================================================
-- Microsoft 365 Calendar connector — 2026-08-15
-- ============================================================================
-- Integrations & Workflow Automation (Phase 5, IP3). calendar_connections
-- has only ever accepted provider = 'google' (baseline_schema_2026-08-06.sql's
-- own CHECK constraint). This widens it to also accept 'microsoft', so a
-- Microsoft 365 Calendar connection is just another row in the same table
-- (api/calendar/_ms365-oauth-callback.js upserts into it exactly the way
-- the Google flow already does), not a second table with a second RLS
-- posture to keep in sync — same reasoning IP2 already applied to Gmail
-- and graph_mail_connections.
--
-- RLS is unchanged — this table has always had zero policies (server code
-- with SUPABASE_SERVICE_KEY only), and that's still correct here.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

ALTER TABLE public.calendar_connections DROP CONSTRAINT IF EXISTS calendar_connections_provider_check;
ALTER TABLE public.calendar_connections ADD CONSTRAINT calendar_connections_provider_check CHECK (provider IN ('google', 'microsoft'));
