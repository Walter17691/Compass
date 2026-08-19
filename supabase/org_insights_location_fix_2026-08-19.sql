-- ============================================================================
-- Organisational ER Intelligence (Phase 6, OP4) — correct + extend the
-- location breakdown in org_insights_overview()
-- ============================================================================
-- Correction found while building OP4 (site/location intelligence), not
-- guessed: org_insights_overview_2026-08-19.sql's original
-- "cases_by_location" joined public.locations via cases.location_id — the
-- formal location entity used by location_manager role scoping and the
-- Settings > Locations list. Checked against this project's own real
-- Supabase data: 0 of 1,841 case rows have location_id set at all. The
-- signal that's actually populated is employee_records.location (the
-- same field ErReportScreen.jsx's own "Cases by site" breakdown already
-- reads via employeeRecordsMap[cs.employeeName]?.location — cases never
-- carry a location NAME of their own client-side, only a locationId, so
-- that existing client code was always falling through to this exact
-- join, just done in JS instead of SQL). This migration switches
-- cases_by_location to the join that's actually populated, matching the
-- app's own established, working pattern, and adds the two nested
-- breakdowns OP4's site view needs (type mix and avg duration per site) —
-- both new, not requested/verified for anything else yet.
--
-- SCOPE NOTE — two §5 site-intelligence items are NOT in this RPC:
--   - "Region" comparison: no region concept exists anywhere in this
--     schema (locations only has id/org_id/name/created_at). Not
--     invented here; site-vs-company-average is what OP4 ships.
--   - "vs previous period" per site: org_insights_overview already
--     reports one point-in-time snapshot; a real previous-period
--     comparison per site needs a second parameterised call this
--     migration doesn't add. Left for a later phase if it proves
--     valuable, not guessed at now.
--
-- Verified directly against real data before handoff (read-only SELECT,
-- no schema change): the nested duration/type aggregates below were
-- run standalone first and cross-checked against employee_records'
-- actual location values (Manchester/London/Glasgow — sparse but real —
-- this org's own E2E test data is otherwise almost entirely unlocated,
-- which is expected and not a bug in this query).
--
-- HOW TO APPLY: this is a single CREATE OR REPLACE — paste the whole
-- block below. It supersedes the org_insights_overview() function body
-- from org_insights_overview_2026-08-19.sql; _safe_ts and the grants
-- from that migration are untouched and don't need to be re-run.
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
  -- Corrected: employee_records.location, not cases.location_id (see
  -- header note — location_id is 0% populated in this project's own data).
  by_location as (
    select coalesce(jsonb_object_agg(loc, cnt), '{}'::jsonb) as v
    from (
      select coalesce(er.location, 'Not specified') as loc, count(*) as cnt
      from my_cases c
      left join public.employee_records er on er.org_id = c.org_id and er.name = c.employee_name
      group by 1
    ) t
  ),
  -- New for OP4: per-site case-type mix, {location: {type: count}}.
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
  -- New for OP4: per-site avg case duration + sample size, so the site
  -- view can show both the number and whether it's reliable
  -- (OP1's DataQualityCaveat threshold check happens client-side on
  -- the "count" here, same as the org-wide figure already does).
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
    'avg_duration_by_location', (select v from by_location_duration)
  );
$$;
