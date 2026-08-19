-- ============================================================================
-- Organisational ER Intelligence (Phase 6, OP5) — department benchmarking
-- ============================================================================
-- §14's own example benchmarks by REGION ("Region A — 8 days, Region B —
-- 17 days, Company average — 11 days"). As established in OP4's own
-- migration, no region concept exists anywhere in this schema (locations
-- only has id/org_id/name/created_at, and cases.location_id itself is 0%
-- populated in this project's real data) — department is the real,
-- populated grouping this org actually has (employee_records.department,
-- the same join cases_by_department already uses). This adds the one
-- new field OP5's benchmarking view needs beyond what OP2/OP4 already
-- expose: avg case duration per department, same shape as OP4's
-- avg_duration_by_location so the client-side rendering code is a direct
-- reuse of the same pattern, not a new one.
--
-- The other half of OP5 (sanction-distribution benchmarking per case
-- type) needs no new SQL at all — it reuses outcomeConsistency.js's
-- existing computeSanctionDistribution(cases, caseType) client-side,
-- called without an excludeCaseId (its own existing, optional param) to
-- get an org-wide distribution instead of "all OTHER cases of this
-- type" — the exact reuse-not-rebuild the plan called for.
--
-- Verified directly against real data before handoff (read-only SELECT).
--
-- HOW TO APPLY: single CREATE OR REPLACE, paste the whole block below.
-- ============================================================================

create or replace function public.org_insights_overview(p_period_days integer default 30)
returns jsonb
language sql
stable
as $$
  with my_cases as (
    select * from public.cases where org_id in (select my_org_ids())
  ),
  period as (
    select now() - (p_period_days || ' days')::interval as cutoff
  ),
  by_type as (
    select coalesce(jsonb_object_agg(case_type, cnt), '{}'::jsonb) as v
    from (select case_type, count(*) as cnt from my_cases where case_type is not null and case_type <> '' group by case_type) t
  ),
  by_stage as (
    select coalesce(jsonb_object_agg(stage, cnt), '{}'::jsonb) as v
    from (select stage, count(*) as cnt from my_cases where stage is not null group by stage) t
  ),
  by_outcome as (
    select coalesce(jsonb_object_agg(outcome, cnt), '{}'::jsonb) as v
    from (select outcome, count(*) as cnt from my_cases where outcome is not null and outcome <> '' group by outcome) t
  ),
  by_manager as (
    select coalesce(jsonb_object_agg(mgr, cnt), '{}'::jsonb) as v
    from (select coalesce(nullif(manager,''),'Not specified') as mgr, count(*) as cnt from my_cases group by 1) t
  ),
  by_location as (
    select coalesce(jsonb_object_agg(loc, cnt), '{}'::jsonb) as v
    from (
      select coalesce(er.location, 'Not specified') as loc, count(*) as cnt
      from my_cases c
      left join public.employee_records er on er.org_id = c.org_id and er.name = c.employee_name
      group by 1
    ) t
  ),
  by_location_type as (
    select coalesce(jsonb_object_agg(loc, types), '{}'::jsonb) as v
    from (
      select loc, jsonb_object_agg(case_type, cnt) as types
      from (
        select coalesce(er.location, 'Not specified') as loc,
               coalesce(nullif(c.case_type,''), 'Unspecified') as case_type,
               count(*) as cnt
        from my_cases c
        left join public.employee_records er on er.org_id = c.org_id and er.name = c.employee_name
        group by 1, 2
      ) t
      group by loc
    ) t2
  ),
  by_department as (
    select coalesce(jsonb_object_agg(dept, cnt), '{}'::jsonb) as v
    from (
      select coalesce(er.department, 'Not specified') as dept, count(*) as cnt
      from my_cases c
      left join public.employee_records er on er.org_id = c.org_id and er.name = c.employee_name
      group by 1
    ) t
  ),
  durations as (
    select
      c.id, c.employee_name,
      (select max(public._safe_ts(coalesce(m->>'savedAt', m->>'date')))
         - min(public._safe_ts(coalesce(m->>'savedAt', m->>'date')))
       from jsonb_array_elements(coalesce(c.meetings,'[]'::jsonb)) m) as span
    from my_cases c
    where c.stage = 'closed' and jsonb_array_length(coalesce(c.meetings,'[]'::jsonb)) >= 2
  ),
  by_location_duration as (
    select coalesce(jsonb_object_agg(loc, jsonb_build_object('avg_days', avg_days, 'count', cnt)), '{}'::jsonb) as v
    from (
      select coalesce(er.location, 'Not specified') as loc,
             round(avg(extract(epoch from d.span) / 86400.0)::numeric, 1) as avg_days,
             count(*) as cnt
      from durations d
      join my_cases c on c.id = d.id
      left join public.employee_records er on er.org_id = c.org_id and er.name = d.employee_name
      where d.span is not null
      group by 1
    ) t
  ),
  -- New for OP5: same shape as by_location_duration, grouped by
  -- department instead of site.
  by_department_duration as (
    select coalesce(jsonb_object_agg(dept, jsonb_build_object('avg_days', avg_days, 'count', cnt)), '{}'::jsonb) as v
    from (
      select coalesce(er.department, 'Not specified') as dept,
             round(avg(extract(epoch from d.span) / 86400.0)::numeric, 1) as avg_days,
             count(*) as cnt
      from durations d
      join my_cases c on c.id = d.id
      left join public.employee_records er on er.org_id = c.org_id and er.name = d.employee_name
      where d.span is not null
      group by 1
    ) t
  )
  select jsonb_build_object(
    'period_days', p_period_days,
    'total_cases', (select count(*) from my_cases),
    'open_cases', (select count(*) from my_cases where stage <> 'closed'),
    'opened_in_period', (select count(*) from my_cases, period where created_at >= period.cutoff),
    'closed_in_period', (select count(*) from my_cases, period where stage = 'closed' and updated_at >= period.cutoff),
    'cases_by_type', (select v from by_type),
    'cases_by_stage', (select v from by_stage),
    'cases_by_outcome', (select v from by_outcome),
    'cases_by_manager', (select v from by_manager),
    'cases_by_location', (select v from by_location),
    'cases_by_location_type', (select v from by_location_type),
    'cases_by_department', (select v from by_department),
    'avg_case_duration_days', (select round(avg(extract(epoch from span) / 86400.0)::numeric, 1) from durations where span is not null),
    'closed_cases_with_duration', (select count(*) from durations where span is not null),
    'avg_duration_by_location', (select v from by_location_duration),
    'avg_duration_by_department', (select v from by_department_duration)
  );
$$;
