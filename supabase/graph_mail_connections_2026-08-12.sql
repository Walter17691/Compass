-- ============================================================================
-- Outlook mail integration (Microsoft Graph) — 2026-08-12
--
-- Phase 24 follow-up: replaces the "paste an email" manual-only flow with a
-- real, on-demand connection to the signed-in user's own Outlook inbox, using
-- the exact same delegated-OAuth architecture as calendar_integration_2026-07-25.sql
-- (per-user connection row, tokens never exposed to the client, RLS locked
-- to zero policies — only server code with SUPABASE_SERVICE_KEY can touch
-- this table). No mail is ever pulled or saved automatically: a connected
-- user can list their recent inbox messages and pick one, which feeds the
-- existing extractEmailDetails()/saveEmailToCase() review-then-confirm
-- pipeline in App.jsx exactly as pasted text already does.
--
-- HOW TO APPLY:
--   1. Read this whole file before running any of it.
--   2. Supabase dashboard -> SQL Editor -> paste and run.
--   3. After running, go to Database -> Policies and confirm the new table
--      shows zero policies for anon/authenticated roles.
--   4. Sanity check from the browser console (with the app open, signed
--      in): `await supabase.from('graph_mail_connections').select()` should
--      return an empty result or an RLS error — never real rows.
-- ============================================================================

-- provider is 'microsoft' only for now; extend the check constraint when
-- Gmail push support is added later.
create table if not exists public.graph_mail_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  provider text not null check (provider in ('microsoft')),
  mailbox_email text,
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);
alter table public.graph_mail_connections enable row level security;
-- Intentionally no policies — see header comment.
