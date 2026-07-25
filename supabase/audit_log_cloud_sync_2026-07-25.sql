-- ============================================================================
-- Cloud-sync the audit trail — 2026-07-25
--
-- audit() (App.jsx) has only ever written to localStorage. For a product
-- whose value proposition is tribunal-readiness, that's a real problem:
-- the trail resets if you clear browser data or switch devices, and two
-- team members working the same org each only see the entries logged in
-- their OWN browser — there is no single shared, authoritative record of
-- who did what. This fixes that by making audit_log a proper org-scoped,
-- shared, append-only table.
--
-- An audit_log table already existed in this schema (see
-- rls_fixes_2026-07-23.sql, which noted it was "not queried anywhere in
-- the app" and left it RLS-locked-with-no-policies). Since nothing reads
-- or writes it today, it's dropped and recreated here with the shape this
-- feature actually needs, rather than guessing at its old columns.
--
-- Deliberately no UPDATE policy (entries are append-only/immutable once
-- written) and no client-facing DELETE policy either — full-org erasure
-- goes through api/delete-org-data.js (service role), not a direct client
-- delete, so a single compromised session can't quietly erase the trail
-- that would otherwise implicate it.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

drop table if exists public.audit_log cascade;

create table public.audit_log (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  user_id uuid not null,
  user_name text not null,
  action text not null,
  detail text default '',
  created_at timestamptz not null default now()
);

create index audit_log_org_id_created_at_idx on public.audit_log (org_id, created_at desc);

alter table public.audit_log enable row level security;

create policy "audit_log_select_org_member"
  on public.audit_log for select
  to authenticated
  using (org_id in (select public.my_org_ids()));

create policy "audit_log_insert_self"
  on public.audit_log for insert
  to authenticated
  with check (
    org_id in (select public.my_org_ids())
    and user_id = auth.uid()
  );
