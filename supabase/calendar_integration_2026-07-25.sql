-- ============================================================================
-- Calendar integration (Google Calendar) — 2026-07-25
--
-- Adds two tables to support syncing ACAS/statutory deadlines to a
-- connected Google Calendar. Both tables store OAuth tokens or data
-- derived from them, so they must NEVER be readable by the client's
-- anon key. RLS is enabled with zero policies granted to anon/authenticated
-- — only server code using SUPABASE_SERVICE_KEY (already used in
-- api/delete-member.js) can read or write these tables. The service key
-- bypasses RLS entirely, so "no policies" means "no client access at all",
-- not "no access" — that's the point.
--
-- HOW TO APPLY:
--   1. Read this whole file before running any of it.
--   2. Supabase dashboard -> SQL Editor -> paste and run.
--   3. After running, go to Database -> Policies and confirm both new
--      tables show zero policies for anon/authenticated roles.
--   4. Sanity check from the browser console (with the app open, signed
--      in): `await supabase.from('calendar_connections').select()` should
--      return an empty result or an RLS error — never real rows.
-- ============================================================================

create table if not exists public.calendar_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  provider text not null check (provider in ('google')), -- extend when Outlook lands
  access_token text not null,
  refresh_token text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, provider)
);
alter table public.calendar_connections enable row level security;
-- Intentionally no policies — see header comment.

create table if not exists public.calendar_synced_events (
  id uuid primary key default gen_random_uuid(),
  connection_id uuid not null references public.calendar_connections(id) on delete cascade,
  deadline_key text not null,        -- stable key from src/App.jsx's dueSoon computation
  calendar_event_id text not null,   -- Google's event id, used for update/delete
  updated_at timestamptz not null default now(),
  unique (connection_id, deadline_key)
);
alter table public.calendar_synced_events enable row level security;
-- Intentionally no policies — see header comment.
