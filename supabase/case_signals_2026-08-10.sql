-- ============================================================================
-- Case signals — 2026-08-10
-- ============================================================================
-- Shared substrate for the AI-copilot enhancement build-out. Four separate
-- spec items (Next Best Action, Contradiction Detection, Unanswered
-- Question Tracker, Procedural Guardrails) are the same interaction shape
-- — Compass notices something, shows what and why, the user accepts /
-- dismisses / marks not relevant / marks resolved / asks why — so this is
-- one table and one RLS policy reused by all four, instead of four
-- near-identical ones. Every row also carries source_refs, which is what
-- makes "ask why" / explainability (spec item 24) possible without a
-- separate mechanism later.
--
-- Same case-access + confidential-case-aware RLS shape as allegations and
-- case_tasks (case_structure_2026-08-09.sql), reusing the capability
-- functions from role_expansion_2026-08-09.sql rather than inlining
-- role checks again.
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run.
-- ============================================================================

create table if not exists public.case_signals (
  id text primary key, -- client-generated, e.g. "sig_" + Date.now()
  case_id uuid not null references public.cases(id) on delete cascade,
  org_id uuid not null references public.organisations(id) on delete cascade,
  type text not null check (type in ('next_action','inconsistency','unanswered_question','process_risk')),
  title text not null,
  reasoning text,
  status text not null default 'open'
    check (status in ('open','accepted','dismissed','not_relevant','resolved','explained')),
  source_refs jsonb not null default '[]'::jsonb, -- [{kind, id, label}], kind in meeting|evidence|allegation|document
  source text not null default 'ai' check (source in ('ai','user')),
  created_by uuid references auth.users(id), -- set when source = 'user'; null for ai-authored signals
  resolved_by uuid references auth.users(id),
  resolved_at timestamptz,
  resolved_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.case_signals enable row level security;

create policy "Users can manage signals for cases they can access"
on public.case_signals for all
using (
  exists (
    select 1 from public.cases c
    where c.id = case_signals.case_id
      and (
        (c.org_id in (select my_org_ids()) and public.can_access_case_location(c.org_id, c.location_id))
        or c.id in (select case_access.case_id from public.case_access where case_access.user_id = auth.uid())
      )
      and (
        c.confidential = false
        or c.created_by = auth.uid()
        or exists (select 1 from public.case_access ca where ca.case_id = c.id and ca.user_id = auth.uid())
        or exists (select 1 from public.org_members om where om.org_id = c.org_id and om.user_id = auth.uid() and public.has_confidential_case_oversight(om.role))
      )
  )
);

create index if not exists case_signals_case_id_idx on public.case_signals(case_id);
create index if not exists case_signals_org_id_idx on public.case_signals(org_id);
