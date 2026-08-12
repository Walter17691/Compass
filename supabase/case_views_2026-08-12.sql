-- ============================================================================
-- What Changed Since Last View — 2026-08-12
-- ============================================================================
-- Phase 13 of the reasoning-layer build-out. One row per (case, user):
-- last_viewed_at is upserted every time that user opens the case, and read
-- BEFORE the upsert to diff the case's audit log / open signals against
-- it — see src/lib/caseViews.js (pure diff) and App.jsx's recordCaseView/
-- generateChangesSummary. Same one-row-per-user-per-case shape as
-- case_access (baseline_schema_2026-08-06.sql), scoped to the viewing
-- user only (not shared across the org — "since I last looked", not
-- "since anyone last looked").
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

create table if not exists public.case_views (
  id uuid not null default gen_random_uuid(),
  case_id uuid not null,
  user_id uuid not null,
  org_id uuid not null,
  last_viewed_at timestamptz not null default now(),
  constraint case_views_pkey primary key (id),
  constraint case_views_case_id_user_id_key unique (case_id, user_id)
);

alter table public.case_views enable row level security;

create policy "Users can view their own case views" on public.case_views for select
  using (user_id = auth.uid() and org_id in (select my_org_ids()));
create policy "Users can create their own case views" on public.case_views for insert
  with check (user_id = auth.uid() and org_id in (select my_org_ids()));
create policy "Users can update their own case views" on public.case_views for update
  using (user_id = auth.uid() and org_id in (select my_org_ids()));
