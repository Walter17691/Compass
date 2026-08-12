-- ============================================================================
-- Manager self-service — concern referrals — 2026-08-12
-- ============================================================================
-- Phase 14 of the reasoning-layer build-out (first of the scale/
-- commercialisation wave: manager self-service, permissions, multi-site
-- analytics, consistency checking, integrations, organisational insights).
-- The `line_manager` role (role_expansion_2026-08-09.sql) has existed
-- since that migration but nothing has ever actually gated on it — this
-- is the first screen any org member, regardless of role, can reach to
-- raise a people concern without needing case-management access at all.
--
-- Any org member can INSERT (org-scoped via my_org_ids(), same helper
-- baseline_schema_2026-08-06.sql already defines). SELECT is the
-- submitter's own referrals, or any HR role's full org-wide triage view.
-- UPDATE (triage disposition) is HR-only.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

create table if not exists public.concern_referrals (
  id text primary key, -- client-generated, e.g. "ref_" + Date.now()
  org_id uuid not null references public.organisations(id) on delete cascade,
  employee_name text not null,
  concern_type text,
  description text not null,
  -- Structured Yes/No screening, answered by the reporting manager —
  -- helps HR triage without a back-and-forth just to find out basics.
  discussed_with_employee boolean,
  involves_safety_or_welfare boolean,
  may_need_formal_process boolean,
  submitted_by uuid references auth.users(id),
  submitted_by_name text,
  status text not null default 'new'
    check (status in ('new','more_info_requested','returned_to_manager','handled_informally','case_opened','closed')),
  hr_notes text,
  linked_case_id uuid references public.cases(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.concern_referrals enable row level security;

create policy "Any org member can submit a concern referral"
on public.concern_referrals for insert
with check (org_id in (select public.my_org_ids()));

create policy "Submitters see their own referrals; HR sees all in their org"
on public.concern_referrals for select
using (
  submitted_by = auth.uid()
  or exists (
    select 1 from public.org_members
    where org_members.org_id = concern_referrals.org_id
      and org_members.user_id = auth.uid()
      and public.is_hr_role(org_members.role)
  )
);

create policy "HR staff can triage referrals in their org"
on public.concern_referrals for update
using (
  exists (
    select 1 from public.org_members
    where org_members.org_id = concern_referrals.org_id
      and org_members.user_id = auth.uid()
      and public.is_hr_role(org_members.role)
  )
);

create index if not exists concern_referrals_org_id_idx on public.concern_referrals(org_id);
