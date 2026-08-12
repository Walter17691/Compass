-- ============================================================================
-- Global Compass AI — org-wide case stats RPC — 2026-08-12
-- ============================================================================
-- Phase 22 of the reasoning-layer build-out. Global Compass AI needs to
-- answer aggregate questions ("how many open cases", "what's the mix of
-- case types") without the client having to ship every case it can see
-- just to count rows in JS — that only gets more expensive as an org's
-- case history grows (this session's own saveCases investigation showed
-- exactly how a shared org's accumulated scale turns "just loop over
-- cases client-side" into a real liability). SQL counts rows far more
-- cheaply and reliably than a client-side loop ever could.
--
-- SECURITY: deliberately NOT security definer (Postgres functions default
-- to SECURITY INVOKER) — this function runs as the calling user, so the
-- existing RLS policies on public.cases (org scoping AND the confidential-
-- cases restrictive policy, confidential_cases_2026-07-26.sql) apply to
-- every SELECT inside it exactly as if the caller had queried the table
-- directly. A confidential case the caller has no case_access grant for,
-- and isn't the creator or an hr_director for, is excluded from these
-- counts the same way it's excluded from their case list today. Verified
-- directly (not just assumed) by simulating an authenticated session for
-- a user with no org membership at all and confirming every count comes
-- back zero, run right after this migration lands.
--
-- Deliberately does NOT attempt to replicate this app's client-side
-- procedural logic (getCaseStage/getNextStep/computeDueSoon — all pure
-- JS over the meetings/next_steps JSONB, not plain columns) in SQL. That
-- logic already exists, is already tested, and duplicating it here would
-- just be two implementations of the same rules drifting apart over
-- time. This RPC only answers what plain columns can answer accurately;
-- Global Compass AI still uses the already-loaded, already RLS-scoped
-- `cases` array via the existing JS helpers for anything nuanced.
--
-- HOW TO APPLY: paste each of the three statements below separately.
-- ============================================================================

create or replace function public.org_case_stats()
returns jsonb
language sql
stable
as $$
  with my_cases as (
    select * from public.cases where org_id in (select my_org_ids())
  ),
  by_type as (
    select coalesce(jsonb_object_agg(case_type, cnt), '{}'::jsonb) as v
    from (select case_type, count(*) as cnt from my_cases where case_type is not null and case_type <> '' group by case_type) t
  ),
  by_stage as (
    select coalesce(jsonb_object_agg(stage, cnt), '{}'::jsonb) as v
    from (select stage, count(*) as cnt from my_cases where stage is not null group by stage) t
  )
  select jsonb_build_object(
    'total_cases', (select count(*) from my_cases),
    'active_cases', (select count(*) from my_cases where stage <> 'closed'),
    'closed_cases', (select count(*) from my_cases where stage = 'closed'),
    'high_priority_active', (select count(*) from my_cases where priority = 'high' and stage <> 'closed'),
    'cases_by_type', (select v from by_type),
    'cases_by_stage', (select v from by_stage)
  );
$$;
