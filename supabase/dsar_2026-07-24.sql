-- ============================================================================
-- DSAR (Data Subject Access Request) tracking — 2026-07-24
--
-- HR-internal tracker for UK GDPR/DPA 2018 subject access requests. Normal
-- org-scoped RLS (same pattern as starter_instances), reusing the
-- my_org_ids() helper already defined in
-- fix_org_members_recursion_2026-07-23.sql. No employee-portal exposure in
-- v1 — this is purely an HR workflow tool, not something the data subject
-- interacts with directly (they receive the response by whatever channel
-- HR normally uses, outside the app).
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

create table if not exists dsar_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organisations(id) on delete cascade,
  employee_name text not null,
  requested_by text,
  received_date date not null,
  due_date date not null,
  status text not null default 'received',
  completed_date date,
  notes text,
  reviewed_flagged_sections boolean not null default false,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table dsar_requests enable row level security;

create policy "dsar_requests_same_org"
  on dsar_requests for all
  to authenticated
  using (org_id in (select public.my_org_ids()))
  with check (org_id in (select public.my_org_ids()));
