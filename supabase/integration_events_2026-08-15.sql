-- ============================================================================
-- Integration events / health — 2026-08-15
-- ============================================================================
-- Integrations & Workflow Automation (Phase 5, IP4, §30). A generic,
-- provider-agnostic log every OAuth-based integration action writes to —
-- connect, disconnect, sync, create/update/delete a calendar event — so
-- "never silently assume an action occurred if an integration failed"
-- (the spec's own §30 principle) has something real to read from,
-- instead of failures only ever reaching a server console.error nobody
-- in the org ever sees.
--
-- Unlike graph_mail_connections/calendar_connections (zero RLS policies,
-- server-only — those hold OAuth tokens), this table is meant to be read
-- directly by the client: a user sees their own connection history, HR
-- sees everyone's, matching the spec's "Administrators should see
-- [integration health]" framing. Writes still only ever come from server
-- code using SUPABASE_SERVICE_KEY (no INSERT policy needed for that —
-- the service role bypasses RLS entirely).
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

create table if not exists public.integration_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid references auth.users(id) on delete cascade,
  provider text not null check (provider in ('outlook_mail', 'gmail', 'google_calendar', 'ms365_calendar')),
  event_type text not null check (event_type in ('connect', 'disconnect', 'sync', 'create_event', 'update_event', 'delete_event')),
  status text not null check (status in ('success', 'error')),
  detail text,
  created_at timestamptz not null default now()
);
create index if not exists integration_events_org_id_created_at_idx on public.integration_events (org_id, created_at desc);

alter table public.integration_events enable row level security;

create policy "Users see their own integration events, HR sees all in their org"
on public.integration_events for select
using (
  user_id = auth.uid()
  or exists (
    select 1 from public.org_members
    where org_members.org_id = integration_events.org_id
      and org_members.user_id = auth.uid()
      and public.is_hr_role(org_members.role)
  )
);
