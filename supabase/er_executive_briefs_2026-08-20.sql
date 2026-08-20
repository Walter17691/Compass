-- ============================================================================
-- Organisational ER Intelligence (Phase 6, OP18) — ER Executive Brief
-- ============================================================================
-- Persisted (not recomputed on every page load) so a real history of
-- past briefs builds up over time — same reasoning
-- manager_capability_insights_2026-08-14.sql already established for
-- this exact "AI call over aggregated org data, worth keeping a
-- record of" shape, and the same HR-only RLS pattern (is_hr_role()).
--
-- supporting_data is a deterministic snapshot of the real inputs fed
-- into the prompt (totals, significant trends included, period) — the
-- "drill-down" the spec asks for is this literal, honest listing of
-- what grounded the brief, not AI-parsed per-sentence links into other
-- screens (which would be guessed, not real).
--
-- HOW TO APPLY: paste the whole block below.
-- ============================================================================

create table if not exists public.er_executive_briefs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  generated_by uuid references auth.users(id),
  generated_by_name text,
  narrative text not null,
  supporting_data jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.er_executive_briefs enable row level security;

create policy "hr can manage er_executive_briefs"
on public.er_executive_briefs for all
using (
  exists (
    select 1 from public.org_members
    where org_members.org_id = er_executive_briefs.org_id
      and org_members.user_id = auth.uid()
      and public.is_hr_role(org_members.role)
  )
);

create index if not exists er_executive_briefs_org_id_idx on public.er_executive_briefs(org_id);
