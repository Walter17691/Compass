-- ============================================================================
-- Manager Capability Insights — 2026-08-14
-- ============================================================================
-- Manager Enablement (Phase 4, MP21, §25) — Manager Learning Loop. One AI
-- call over MP20's own aggregated intervention data (HR guidance/question/
-- witness notes, investigations returned for rework, meeting-quality-gap
-- overrides, policy deviations — never full case/meeting content) produces
-- a small set of recurring capability categories plus a suggested
-- organisational response. Persisted (not recomputed on every page load)
-- so a history of past insights builds up over time — the whole point is
-- closing the loop from individual case delegation back to organisational
-- training decisions, which only means something if it's a record you can
-- look back over, not a single ephemeral result.
--
-- Same HR-only RLS shape as wellbeing_notes (supabase/wellbeing_notes_2026-08-09.sql):
-- this is org-wide analysis of every manager's intervention history, not
-- something any non-HR org member should see.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

create table if not exists public.manager_capability_insights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  generated_by uuid references auth.users(id),
  generated_by_name text,
  sample_size integer not null default 0,
  categories jsonb not null default '[]'::jsonb,
  suggested_response text,
  created_at timestamptz not null default now()
);
alter table public.manager_capability_insights enable row level security;

create policy "HR staff only can manage manager capability insights in their org"
on public.manager_capability_insights for all
using (
  exists (
    select 1 from public.org_members
    where org_members.org_id = manager_capability_insights.org_id
      and org_members.user_id = auth.uid()
      and org_members.role in ('hr_manager', 'hr_director')
  )
);
