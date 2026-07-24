-- ============================================================================
-- Employee Self-Service Portal — 2026-07-25
--
-- Adds two tables supporting a new, separate identity: an employee with a
-- restricted portal login, distinct from org_members (HR staff). Both
-- tables are service-role-only, same as calendar_connections/
-- calendar_synced_events from the Calendar integration — RLS enabled with
-- zero policies for anon/authenticated, so only server code using
-- SUPABASE_SERVICE_KEY can touch them.
--
-- Deliberately NOT adding any RLS policy to cases/employee_records/
-- case_access for portal employees. The existing "cases" policy is FOR ALL
-- with no separate with_check, so any policy granting a portal employee
-- row-level access would also grant them write/delete via the Supabase
-- client directly, regardless of what the Portal UI shows, and would
-- expose the entire `meetings` jsonb blob (including HR's private
-- investigation notes/transcripts) with no way to redact within a single
-- jsonb column via RLS. Portal data access instead goes entirely through
-- api/portal/*.js endpoints (service-role, curated responses) — see the
-- plan doc for the full reasoning.
--
-- HOW TO APPLY:
--   1. Read this whole file before running any of it.
--   2. Supabase dashboard -> SQL Editor -> paste and run.
--   3. Confirm both new tables show zero policies for anon/authenticated.
--   4. Sanity check from the browser console (signed in as any user):
--      `await supabase.from('employee_portal_accounts').select()` should
--      return empty/an RLS error, never real rows.
-- ============================================================================

create table if not exists public.employee_portal_accounts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  employee_name text not null, -- matches employee_records.name / cases.employee_name
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
alter table public.employee_portal_accounts enable row level security;
-- Intentionally no policies — see header comment.

create table if not exists public.employee_portal_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  employee_name text not null,
  email text not null,
  token text not null unique, -- crypto.randomUUID(), not the weak Date.now()
                               -- pattern used by signing_requests.sign_id
  created_by uuid references auth.users(id),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);
alter table public.employee_portal_invites enable row level security;
-- Intentionally no policies — see header comment.

-- ----------------------------------------------------------------------------
-- New-starter onboarding checklists were localStorage-only (never synced to
-- Supabase, see src/App.jsx:716 `useState(ls("compass_starters", []))`),
-- discovered while wiring the Portal's onboarding view — a portal employee
-- logging in from their own device had no way to read data that only ever
-- existed in the HR manager's browser. This table gives it real persistence.
--
-- Unlike the two tables above, this one uses the NORMAL org-scoped RLS
-- pattern (same shape as the existing "employee_records" policy) since HR
-- staff need ordinary client-side access to manage it, same as any other
-- org data. Portal employees still get zero direct grant on it — they read
-- their own onboarding tasks via api/portal/onboarding.js (service-role,
-- curated), same pattern as case-list.js/case-detail.js.
-- ----------------------------------------------------------------------------
create table if not exists public.starter_instances (
  id text primary key, -- client-generated Date.now().toString(), not a uuid
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  role text,
  department text,
  manager text,
  email text,
  start_date text,
  template_id text,
  template_name text,
  tasks jsonb not null default '[]'::jsonb,
  ai_customised boolean not null default false,
  created_by text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.starter_instances enable row level security;

create policy "Users can manage starter instances in their org"
on public.starter_instances for all
using (
  org_id = (
    select organisations.id from organisations
    join org_members on org_members.org_id = organisations.id
    where org_members.user_id = auth.uid()
    limit 1
  )
);
