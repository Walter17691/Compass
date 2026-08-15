-- ============================================================================
-- Gmail connector — 2026-08-15
-- ============================================================================
-- Integrations & Workflow Automation (Phase 5, IP2). graph_mail_connections
-- was designed from the start to hold this — its own header comment
-- (graph_mail_connections_2026-08-12.sql) says "provider is 'microsoft'
-- only for now; extend the check constraint when Gmail push support is
-- added later." This is that migration: widens the constraint to also
-- accept 'google', so a Gmail connection is just another row in the same
-- table (api/graph-mail/_gmail-oauth-callback.js upserts into it exactly
-- the way the Microsoft flow already does), not a second table with a
-- second RLS posture to keep in sync.
--
-- RLS is unchanged — this table has always had zero policies (server code
-- with SUPABASE_SERVICE_KEY only), and that's still correct here.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

ALTER TABLE public.graph_mail_connections DROP CONSTRAINT IF EXISTS graph_mail_connections_provider_check;
ALTER TABLE public.graph_mail_connections ADD CONSTRAINT graph_mail_connections_provider_check CHECK (provider IN ('microsoft', 'google'));
