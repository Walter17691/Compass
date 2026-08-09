-- ============================================================================
-- Wellbeing notes — cloud sync with HR-only RLS — 2026-08-09
-- ============================================================================
-- WellbeingScreen.jsx has always told HR "these notes are confidential...
-- access should be restricted to HR only" and treated Compass as the shared,
-- cloud-synced system of record it is everywhere else (see cases,
-- starter_instances, leaver_instances). In reality wellbeingNotes lived only
-- in the browser's localStorage (App.jsx: useState(ls("compass_wellbeing",
-- [])), saveWellbeingNotes only ever calling lsSet). Notes never synced
-- across HR staff or devices — a second HR manager, or the same one on a
-- different laptop, would see none of a colleague's notes and could
-- reasonably conclude none existed, including disability-disclosure or
-- crisis-flag notes relevant to Equality Act 2010 reasonable-adjustment
-- obligations. This gives wellbeing notes their own org-scoped table and
-- migrates them onto the same cloud-sync pattern as everything else.
--
-- Unlike cases/starter_instances/leaver_instances (any org member), this
-- table's RLS restricts access to hr_manager/hr_director org members only —
-- a real, non-HR role already exists (location_manager, see
-- TeamAccessSection.jsx), and the screen's own confidentiality claim was
-- never actually enforced anywhere: the "Wellbeing" nav item and screen
-- were reachable by every org member regardless of role. That UI gate is
-- fixed alongside this migration, but the RLS policy here is the real
-- boundary — it holds even if a future UI change forgets the client-side
-- check.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

create table if not exists public.wellbeing_notes (
  id text primary key, -- client-generated Date.now().toString(), not a uuid
  org_id uuid not null references public.organisations(id) on delete cascade,
  employee_name text not null,
  type text not null default 'chat',
  date text,
  manager text,
  content text not null,
  support_offered text,
  follow_up_date text,
  follow_up_done boolean not null default false,
  confidential boolean not null default true,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.wellbeing_notes enable row level security;

create policy "HR staff only can manage wellbeing notes in their org"
on public.wellbeing_notes for all
using (
  exists (
    select 1 from public.org_members
    where org_members.org_id = wellbeing_notes.org_id
      and org_members.user_id = auth.uid()
      and org_members.role in ('hr_manager', 'hr_director')
  )
);
