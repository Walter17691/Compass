-- ============================================================================
-- Organisational ER Intelligence (Phase 6, OP15) — organisational change
-- correlation
-- ============================================================================
-- New entity (org_events) — an HR-logged record of a significant
-- organisational event (restructure, new rota system, new policy, site
-- open/close, leadership change, pay review, new operating model),
-- plus a real RPC (org_event_correlation) comparing ER case volume in
-- the window before vs after the event's date. affected_locations is
-- text[] matching employee_records.location's own free-text values —
-- the same field OP4/OP7/OP13 already established as the real,
-- populated location signal in this project (not the formal
-- public.locations table / cases.location_id, which OP4's migration
-- found to be 0% populated in this project's real data).
--
-- Language constraint lives in the CLIENT (orgEvents.js), not here —
-- this RPC only returns before/after counts; it never generates prose,
-- so it can't itself emit a causal claim. §11 explicitly requires
-- "temporal correlation worth reviewing" framing, never "X caused Y".
--
-- RLS: any org member can view logged events (context useful to anyone
-- looking at case trends); only HR can log/edit one — same
-- is_hr_role()-gated pattern organisation_themes_2026-08-19.sql already
-- established for curated, org-wide data.
--
-- HOW TO APPLY: paste the whole block below.
-- ============================================================================

create table if not exists public.org_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  event_date date not null,
  event_type text not null check (event_type in (
    'restructure','new_rota_system','new_policy','site_opening','site_closure',
    'leadership_change','pay_review','new_operating_model','other'
  )),
  description text not null,
  affected_locations text[] not null default '{}',
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now()
);

alter table public.org_events enable row level security;

create policy "org members can view org_events"
on public.org_events for select
using (org_id in (select my_org_ids()));

create policy "hr can manage org_events"
on public.org_events for insert
with check (
  org_id in (select my_org_ids())
  and exists (select 1 from public.org_members om where om.org_id = org_events.org_id and om.user_id = auth.uid() and public.is_hr_role(om.role))
);

create policy "hr can update org_events"
on public.org_events for update
using (
  org_id in (select my_org_ids())
  and exists (select 1 from public.org_members om where om.org_id = org_events.org_id and om.user_id = auth.uid() and public.is_hr_role(om.role))
);

create policy "hr can delete org_events"
on public.org_events for delete
using (
  org_id in (select my_org_ids())
  and exists (select 1 from public.org_members om where om.org_id = org_events.org_id and om.user_id = auth.uid() and public.is_hr_role(om.role))
);

create index if not exists org_events_org_id_idx on public.org_events(org_id);

create or replace function public.org_event_correlation(p_event_id uuid, p_window_days integer default 42)
returns jsonb
language sql
stable
as $$
  with ev as (
    select * from public.org_events where id = p_event_id and org_id in (select my_org_ids())
  ),
  my_cases as (
    select c.* from public.cases c, ev where c.org_id = ev.org_id
  ),
  scoped_cases as (
    select c.* from my_cases c, ev
    where (array_length(ev.affected_locations, 1) is null)
       or exists (
         select 1 from public.employee_records er
         where er.org_id = c.org_id and er.name = c.employee_name and er.location = any(ev.affected_locations)
       )
  )
  select jsonb_build_object(
    'event_id', p_event_id,
    'window_days', p_window_days,
    'before_count', (select count(*) from scoped_cases c, ev where c.created_at >= ev.event_date - (p_window_days || ' days')::interval and c.created_at < ev.event_date),
    'after_count', (select count(*) from scoped_cases c, ev where c.created_at >= ev.event_date and c.created_at < ev.event_date + (p_window_days || ' days')::interval)
  );
$$;

revoke all on function public.org_event_correlation(uuid, integer) from public;
grant execute on function public.org_event_correlation(uuid, integer) to authenticated;
