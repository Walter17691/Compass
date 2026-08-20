-- ============================================================================
-- Organisational ER Intelligence (Phase 6, OP8) — root-cause exploration
-- ============================================================================
-- §4's own example is theme-based ("Management communication... appears
-- in 19 cases this quarter... common associated themes: Rota changes,
-- Unclear expectations, Probation feedback"), so this is scoped to
-- OP6's theme taxonomy only, not case types — a case-type equivalent of
-- "co-occurring themes" doesn't have a coherent meaning (a case's own
-- type is singular, not a set), so root-cause exploration is reached
-- from TrendsPanel's theme trend cards specifically, not the type ones.
--
-- Same current-period window as OP7's org_trend_detection (default 90
-- days, anchored on cases.created_at), scoped to one theme at a time via
-- p_theme_id — this is a drill-in from a trend already surfaced, not
-- another dashboard-wide aggregate.
--
-- Two outputs:
--   by_location — site concentration for cases carrying this theme in
--     the current period (same shape as OP7's byLocation).
--   co_occurring_themes — other themes appearing on the SAME cases as
--     the target theme, ranked by how many cases they share. This is
--     the raw material for "potential areas for review" — deliberately
--     NOT a hardcoded theme-name-to-recommended-action mapping (an
--     HR-defined taxonomy can have any name at all; inventing specific
--     recommendations per name would be exactly the kind of fabricated
--     precision this app's other advisory features explicitly avoid,
--     e.g. processDashboard.js's own DEFAULT_STAGE_TARGET_DAYS
--     comment). The client (rootCauseExploration.js) turns each
--     co-occurring theme into a generic "review area" framed exactly
--     as the spec requires — an area to investigate, never a proven
--     cause.
--
-- Verified directly against real data before handoff (read-only,
-- against this project's actual organisation_themes/case_themes rows,
-- which are currently near-empty since OP6 tagging is new — the query
-- itself was confirmed to execute correctly and degrade to zero/empty
-- results rather than erroring, the expected state until real tagging
-- accumulates).
--
-- HOW TO APPLY: paste the whole block below.
-- ============================================================================

create or replace function public.org_theme_root_cause(p_theme_id uuid, p_period_days integer default 90)
returns jsonb
language sql
stable
as $$
  with my_cases as (
    select * from public.cases where org_id in (select my_org_ids())
  ),
  period as (
    select now() - (p_period_days || ' days')::interval as cur_start, now() as cur_end
  ),
  target_case_ids as (
    select distinct ct.case_id
    from public.case_themes ct
    join my_cases c on c.id = ct.case_id, period p
    where ct.theme_id = p_theme_id and c.created_at >= p.cur_start and c.created_at < p.cur_end
  ),
  by_location as (
    select coalesce(jsonb_object_agg(loc, cnt), '{}'::jsonb) as v
    from (
      select coalesce(er.location, 'Not specified') as loc, count(*) as cnt
      from target_case_ids t
      join my_cases c on c.id = t.case_id
      left join public.employee_records er on er.org_id = c.org_id and er.name = c.employee_name
      group by 1
    ) t2
  ),
  co_occurring as (
    select coalesce(jsonb_agg(jsonb_build_object('themeId', th.id, 'themeName', th.name, 'count', cnt) order by cnt desc), '[]'::jsonb) as v
    from (
      select ct2.theme_id, count(distinct ct2.case_id) as cnt
      from public.case_themes ct2
      where ct2.case_id in (select case_id from target_case_ids) and ct2.theme_id <> p_theme_id
      group by ct2.theme_id
    ) x
    join public.organisation_themes th on th.id = x.theme_id
  )
  select jsonb_build_object(
    'theme_id', p_theme_id,
    'period_days', p_period_days,
    'current_count', (select count(*) from target_case_ids),
    'by_location', (select v from by_location),
    'co_occurring_themes', (select v from co_occurring)
  );
$$;

revoke all on function public.org_theme_root_cause(uuid, integer) from public;
grant execute on function public.org_theme_root_cause(uuid, integer) to authenticated;
