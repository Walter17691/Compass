-- ============================================================================
-- Organisational ER Intelligence (Phase 6, OP22, §18) — Improvement
-- Initiatives
-- ============================================================================
-- New entity tracking a real HR-owned response to a pattern surfaced
-- elsewhere in Insights: the problem identified, which insight(s)
-- prompted it, an owner, milestones, a target completion date, and
-- (once implemented) an outcome. supporting_insights is text[] free
-- text, not a foreign key — there is no shared insight-id space across
-- the panels this could reference (a trend row, a risk-map flag, a
-- root-cause exploration each have their own shape), same reasoning
-- org_events.affected_locations and case_tasks.insight_ref
-- (org_insight_actions_2026-08-20.sql, OP21) already used. milestones
-- is jsonb (an ordered array of {id, label, targetDate, done}) — no
-- separate table, since milestones only ever need to be read/written as
-- a whole alongside their own initiative, never queried independently.
--
-- case_tasks gains a nullable improvement_initiative_id so an action
-- created from an insight card (OP21) can optionally be linked to the
-- initiative it supports — the "Link to Improvement Initiative"
-- capability OP21 deferred until this table existed.
--
-- RLS: same is_hr_role()-gated write / org-wide read pattern
-- org_events_2026-08-20.sql already established for curated, org-wide
-- ER content — any org member can see what initiatives are underway,
-- only HR can create/edit/delete one.
--
-- HOW TO APPLY: paste the whole block below.
-- ============================================================================

create table if not exists public.improvement_initiatives (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  title text not null,
  problem_identified text not null,
  supporting_insights text[] not null default '{}',
  owner text,
  target_completion date,
  status text not null default 'active' check (status in ('active', 'completed', 'abandoned')),
  milestones jsonb not null default '[]',
  outcome text,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.improvement_initiatives enable row level security;

create policy "org members can view improvement_initiatives"
on public.improvement_initiatives for select
using (org_id in (select my_org_ids()));

create policy "hr can create improvement_initiatives"
on public.improvement_initiatives for insert
with check (
  org_id in (select my_org_ids())
  and exists (select 1 from public.org_members om where om.org_id = improvement_initiatives.org_id and om.user_id = auth.uid() and public.is_hr_role(om.role))
);

create policy "hr can update improvement_initiatives"
on public.improvement_initiatives for update
using (
  org_id in (select my_org_ids())
  and exists (select 1 from public.org_members om where om.org_id = improvement_initiatives.org_id and om.user_id = auth.uid() and public.is_hr_role(om.role))
);

create policy "hr can delete improvement_initiatives"
on public.improvement_initiatives for delete
using (
  org_id in (select my_org_ids())
  and exists (select 1 from public.org_members om where om.org_id = improvement_initiatives.org_id and om.user_id = auth.uid() and public.is_hr_role(om.role))
);

create index if not exists improvement_initiatives_org_id_idx on public.improvement_initiatives(org_id);

alter table public.case_tasks add column if not exists improvement_initiative_id uuid references public.improvement_initiatives(id) on delete set null;
