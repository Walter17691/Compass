-- ============================================================================
-- Organisational ER Intelligence (Phase 6, OP2) — org-aggregate insights RPC
-- ============================================================================
-- Foundation for the new Insights dashboard (OP3) and every later OP phase
-- that needs a metric correct across ALL of an org's cases, not just
-- whatever loadCasesFromDB() happened to load client-side. That matters
-- here specifically: this org's own `cases` table already has 1,840 rows,
-- past Supabase's ~1000-row default page size — loadCasesFromDB() has no
-- .order()/.limit() and silently truncates, a pre-existing bug this
-- session's own E2E history already hit (documented, not fixed, out of
-- scope here). Client-side aggregation over that same truncated array
-- would quietly under-count every metric on this new dashboard, which
-- defeats the entire point of a phase whose value is "trust these
-- numbers enough to act on them." This RPC computes over the real table
-- instead, following org_case_stats()'s own template exactly
-- (global_ai_stats_2026-08-12.sql): SECURITY INVOKER (the default —
-- deliberately not overridden), so the caller's existing RLS (org
-- scoping + the confidential-cases restrictive policy) applies to every
-- row exactly as if they'd queried public.cases directly.
--
-- SCOPE NOTE — three §1 dashboard metrics are deliberately NOT computed
-- here, matching org_case_stats()'s own established reasoning for
-- excluding getCaseStage/getNextStep/computeDueSoon: they are genuinely
-- branching procedural logic, not a plain aggregate, and duplicating
-- branching logic in SQL is how two implementations quietly drift apart:
--   - "Overdue cases": computeDueSoon (deadlines.js) does working-day
--     arithmetic across five different deadline categories (tasks,
--     DSARs, wellbeing, leavers, redundancy). Stays client-side; OP3
--     reads the app's existing `dueSoon` state directly.
--   - "Avg investigation duration": processDashboard.js's
--     computeStageBottlenecks already derives this correctly from
--     getCaseStage + per-stage timelineOverrides. OP3 reuses that
--     existing, already-tested function rather than re-deriving stage
--     entry/exit in SQL.
--   - "Informal vs formal resolution": a case's meetings[].type is
--     free-text (matches MEETING_TYPES' `label`, e.g. "Investigation",
--     "Informal / 1-1", not a fixed enum), so classifying it in SQL
--     would silently break the moment a label changes in constants.js.
--     Stays client-side for now (same imprecision it already has today
--     at this org's scale — not a new regression this phase introduces).
-- "avg_case_duration_days" IS computed here: it's pure date arithmetic
-- (min/max of a closed case's meeting dates, mirroring ErReportScreen's
-- own avgResolution formula exactly), not branching business logic, so
-- porting it to SQL doesn't carry the same drift risk.
--
-- "closed_in_period" uses updated_at as a closed-timestamp proxy — there
-- is no dedicated closed_at column on public.cases, and updated_at is
-- the closest real signal to "when did this row last change," same
-- imprecision ErReportScreen already accepts for month-over-month deltas.
--
-- "cases_by_department" joins employee_records by (org_id, name =
-- employee_name) — cases has no direct FK to employee_records, so this
-- mirrors the exact text-match ErReportScreen.jsx already does
-- client-side (employeeRecordsMap[cs.employeeName]?.location), just
-- server-side and across the full table now.
--
-- Verified directly against real data before being handed off: ran the
-- durations CTE's formula against this project's own Supabase project
-- (read-only SELECT, no schema change) and cross-checked a handful of
-- rows' meetings[].savedAt against the RPC's span calculation by hand.
--
-- HOW TO APPLY: paste each statement below separately (helper function,
-- then the RPC, then the two grant statements).
-- ============================================================================

-- Mirrors the client's own defensive date parsing (new Date(x) -> NaN,
-- filtered out via isNaN(d) throughout ErReportScreen.jsx) rather than
-- letting a malformed meetings[].savedAt/date value abort the whole
-- aggregate query with a cast error.
create or replace function public._safe_ts(p_text text)
returns timestamptz
language plpgsql
immutable
as $$
begin
  if p_text is null or p_text = '' then
    return null;
  end if;
  return p_text::timestamptz;
exception when others then
  return null;
end;
$$;

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
      select coalesce(l.name, 'Not specified') as loc, count(*) as cnt
      from my_cases c
      left join public.locations l on l.id = c.location_id
      group by 1
    ) t
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
      c.id,
      (select max(public._safe_ts(coalesce(m->>'savedAt', m->>'date')))
         - min(public._safe_ts(coalesce(m->>'savedAt', m->>'date')))
       from jsonb_array_elements(coalesce(c.meetings,'[]'::jsonb)) m) as span
    from my_cases c
    where c.stage = 'closed' and jsonb_array_length(coalesce(c.meetings,'[]'::jsonb)) >= 2
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
    'cases_by_department', (select v from by_department),
    'avg_case_duration_days', (select round(avg(extract(epoch from span) / 86400.0)::numeric, 1) from durations where span is not null),
    'closed_cases_with_duration', (select count(*) from durations where span is not null)
  );
$$;

revoke all on function public._safe_ts(text) from public;
grant execute on function public._safe_ts(text) to authenticated;

revoke all on function public.org_insights_overview(integer) from public;
grant execute on function public.org_insights_overview(integer) to authenticated;
