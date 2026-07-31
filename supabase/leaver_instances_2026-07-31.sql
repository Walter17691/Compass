-- ============================================================================
-- Leaver / offboarding instances — 2026-07-31
-- ============================================================================
-- Mirrors starter_instances (supabase/employee_portal_2026-07-25.sql) exactly
-- — same shape, same normal org-scoped RLS pattern — but for the leaver
-- ("Offboarding") side of the employee lifecycle: HR previously had no way
-- to track a leaver's checklist (access revocation, equipment return, final
-- pay, exit interview) at all, only the New Starter side.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

create table if not exists public.leaver_instances (
  id text primary key, -- client-generated Date.now().toString(), not a uuid
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  role text,
  department text,
  manager text,
  email text,
  last_working_day text,
  reason text,
  template_id text,
  template_name text,
  tasks jsonb not null default '[]'::jsonb,
  ai_customised boolean not null default false,
  exit_interview_notes text,
  exit_interview_date text,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.leaver_instances enable row level security;

create policy "Users can manage leaver instances in their org"
on public.leaver_instances for all
using (
  org_id = (
    select organisations.id from organisations
    join org_members on org_members.org_id = organisations.id
    where org_members.user_id = auth.uid()
    limit 1
  )
);
