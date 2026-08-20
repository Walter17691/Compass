-- ============================================================================
-- Organisational ER Intelligence (Phase 6, OP7) — trend detection
-- ============================================================================
-- §2's own example is by case TYPE ("Grievance cases increased 31%
-- compared with the previous quarter... concentrated across three
-- locations"), which is what by_type_trend answers directly using data
-- every case already has. by_theme_trend answers the same question for
-- OP6's theme taxonomy, using case_themes — expect this to be sparse or
-- empty on any org that just adopted Phase 6, since themes only exist
-- once cases have actually been tagged; it fills in as OP6's tagging
-- gets used, not a bug in this query. Both compare the trailing
-- p_period_days window (default 90, i.e. roughly a quarter — the
-- spec's own "quarter-over-quarter" framing, but configurable) against
-- the immediately preceding window of the same length, anchored on
-- cases.created_at (when the case was actually opened — not
-- case_themes.confirmed_at, which records when a theme was TAGGED and
-- could happen well after the case opened, which would make "trend
-- period" mean something different from what the spec's example means).
--
-- Only case types/themes with at least one case in the CURRENT period
-- are included (previousCount defaults to 0 rather than a full outer
-- join bringing back types that vanished entirely) — matches the
-- spec's own framing, which is about growth worth flagging, not decline.
--
-- Per-location breakdown is the CURRENT period's location mix only
-- (matching "the increase is concentrated across three locations" —
-- a description of where the current elevated volume sits, not a
-- location-by-location current-vs-previous comparison, which client-
-- side code doesn't need SQL for once it has the raw counts).
--
-- Language constraint lives in the CLIENT (TrendsPanel.jsx), not here —
-- this RPC only returns numbers; it never writes or returns prose, so
-- there's no risk of it emitting causal language itself.
--
-- HOW TO APPLY: paste the whole block below.
-- ============================================================================

create or replace function public.org_trend_detection(p_period_days integer default 90)
returns jsonb
language sql
stable
as $$
  with my_cases as (
    select * from public.cases where org_id in (select my_org_ids())
  ),
  period_bounds as (
    select
      now() - (p_period_days || ' days')::interval as cur_start, now() as cur_end,
      now() - ((p_period_days*2) || ' days')::interval as prev_start,
      now() - (p_period_days || ' days')::interval as prev_end
  ),
  current_cases as (
    select c.* from my_cases c, period_bounds p where c.created_at >= p.cur_start and c.created_at < p.cur_end
  ),
  previous_cases as (
    select c.* from my_cases c, period_bounds p where c.created_at >= p.prev_start and c.created_at < p.prev_end
  ),
  type_current as (
    select case_type, count(*) as cnt from current_cases where case_type is not null and case_type <> '' group by case_type
  ),
  type_previous as (
    select case_type, count(*) as cnt from previous_cases where case_type is not null and case_type <> '' group by case_type
  ),
  type_location as (
    select c.case_type, coalesce(er.location, 'Not specified') as loc, count(*) as cnt
    from current_cases c
    left join public.employee_records er on er.org_id = c.org_id and er.name = c.employee_name
    where c.case_type is not null and c.case_type <> ''
    group by 1, 2
  ),
  by_type_trend as (
    select coalesce(jsonb_agg(jsonb_build_object(
        'caseType', tc.case_type,
        'currentCount', tc.cnt,
        'previousCount', coalesce(tp.cnt, 0),
        'byLocation', coalesce(loc.locs, '{}'::jsonb)
      ) order by tc.cnt desc), '[]'::jsonb) as v
    from type_current tc
    left join type_previous tp on tp.case_type = tc.case_type
    left join (select case_type, jsonb_object_agg(loc, cnt) as locs from type_location group by case_type) loc on loc.case_type = tc.case_type
  ),
  current_theme_cases as (
    select ct.theme_id, c.id as case_id, c.org_id, c.employee_name
    from public.case_themes ct
    join current_cases c on c.id = ct.case_id
  ),
  previous_theme_cases as (
    select ct.theme_id, c.id as case_id
    from public.case_themes ct
    join previous_cases c on c.id = ct.case_id
  ),
  theme_current as (select theme_id, count(distinct case_id) as cnt from current_theme_cases group by theme_id),
  theme_previous as (select theme_id, count(distinct case_id) as cnt from previous_theme_cases group by theme_id),
  theme_location as (
    select tc.theme_id, coalesce(er.location, 'Not specified') as loc, count(distinct tc.case_id) as cnt
    from current_theme_cases tc
    left join public.employee_records er on er.org_id = tc.org_id and er.name = tc.employee_name
    group by 1, 2
  ),
  by_theme_trend as (
    select coalesce(jsonb_agg(jsonb_build_object(
        'themeId', th.id, 'themeName', th.name,
        'currentCount', thc.cnt,
        'previousCount', coalesce(thp.cnt, 0),
        'byLocation', coalesce(loc.locs, '{}'::jsonb)
      ) order by thc.cnt desc), '[]'::jsonb) as v
    from theme_current thc
    join public.organisation_themes th on th.id = thc.theme_id
    left join theme_previous thp on thp.theme_id = thc.theme_id
    left join (select theme_id, jsonb_object_agg(loc, cnt) as locs from theme_location group by theme_id) loc on loc.theme_id = thc.theme_id
  )
  select jsonb_build_object(
    'period_days', p_period_days,
    'by_type_trend', (select v from by_type_trend),
    'by_theme_trend', (select v from by_theme_trend)
  );
$$;

revoke all on function public.org_trend_detection(integer) from public;
grant execute on function public.org_trend_detection(integer) to authenticated;
