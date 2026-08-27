-- ============================================================================
-- Redundancy cases — cloud sync with HR-only RLS — 2026-08-27
-- ============================================================================
-- Phase 6.5 hardening (closes Prompt 16 audit finding H1, HIGH).
--
-- Same bug class as wellbeing_notes_2026-08-09.sql, found again:
-- redundancyCases lived only in the browser's localStorage
-- (App.jsx: useState(orgLs("compass_redundancy", [])), saveRedundancyCases
-- only ever calling orgLsSet). This is genuinely sensitive personal data —
-- selection-criteria scores, at-risk employee names, and redundancy pay
-- figures for people who, in many cases, don't yet know they're at risk —
-- and it never synced across HR staff or devices, was invisible to the
-- audit log, and had no RLS boundary at all: the "Redundancy" nav item was
-- reachable by EVERY org member regardless of role (AppSidebar.jsx had no
-- gate on it, unlike Onboarding/Offboarding/Wellbeing/DSAR right next to
-- it). Both problems are fixed together: this table gives redundancy cases
-- the same cloud-sync + HR-only RLS pattern wellbeing_notes already has,
-- and the UI gate is added alongside it in AppSidebar.jsx — the RLS policy
-- here is the real boundary either way.
--
-- selection_criteria/at_risk_employees/collective_info are stored as jsonb
-- rather than normalised — they're always read and written as one whole
-- object per redundancy case (never queried by an individual employee's
-- score from SQL), the same reasoning starter_instances/leaver_instances
-- already store their own `tasks` array as jsonb.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

create table if not exists public.redundancy_cases (
  id text primary key, -- client-generated (newId("redundancy")), not a bare uuid
  org_id uuid not null references public.organisations(id) on delete cascade,
  type text not null,
  reason text,
  pool_description text,
  selection_criteria jsonb not null default '[]'::jsonb,
  at_risk_employees jsonb not null default '[]'::jsonb,
  collective_info jsonb,
  status text not null default 'setup',
  ai_advice text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.redundancy_cases enable row level security;

create policy "HR staff only can manage redundancy cases in their org"
on public.redundancy_cases for all
using (
  exists (
    select 1 from public.org_members
    where org_members.org_id = redundancy_cases.org_id
      and org_members.user_id = auth.uid()
      and org_members.role in ('hr_manager', 'hr_director')
  )
);
