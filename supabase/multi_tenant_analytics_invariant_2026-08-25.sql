-- ============================================================================
-- Phase 6.5 — Structural remediation (Prompt 12, Family 2)
-- MULTI-TENANT ANALYTICS INVARIANT
-- ============================================================================
-- Independent audit (Prompt 11) found a CRITICAL bug: every Organisational
-- Intelligence RPC (org_insights_overview, org_trend_detection,
-- org_case_stats, org_theme_root_cause) aggregates using `org_id IN
-- (SELECT my_org_ids())` — every org the CALLING USER belongs to, not the
-- one org currently active in the UI. For a multi-org user (an explicitly
-- supported scenario — HR consultancies running cases for several
-- clients from one login), every Insights panel silently blends data
-- across all their orgs, and the AI-generated narrative gets WRITTEN into
-- er_executive_briefs/persisted tables tagged with only ONE org's id —
-- one client's real case data ends up durably stored inside a different
-- client's tenant record.
--
-- Live confirmation at the time of the follow-up sweep: one real user
-- belongs to 2 orgs and has already generated 20 executive briefs: the
-- mechanism is live and reachable today, masked only by the second org
-- currently having 0 cases.
--
-- Root cause and fix, from the follow-up sweep: `my_org_ids()` answers
-- "which orgs is this caller a MEMBER of" — correct as an RLS primitive,
-- wrong as an AGGREGATION SCOPE. Every org-scoped RPC needs an explicit,
-- validated p_org_id parameter instead. This migration:
--   1. Adds assert_org_access(p_org_id) — one shared guard, used as the
--      scoping expression itself (not a separate `if` a future edit could
--      forget to call) in every org-scoped RPC.
--   2. Adds assert_theme_in_org(p_theme_id, p_org_id) for
--      org_theme_root_cause's second, independent gap (p_theme_id itself
--      was never checked against any org).
--   3. Drops and recreates org_insights_overview, org_trend_detection,
--      org_case_stats, org_theme_root_cause with p_org_id as a REQUIRED
--      FIRST parameter (no default) — a client that forgets to pass it
--      gets a hard error, not a silently over-broad result set.
--
-- This is a DROP + CREATE, not a CREATE OR REPLACE, for each function:
-- Postgres identifies a function by name AND parameter signature, so
-- adding a new required first parameter is a different signature, not a
-- replacement of the old one — CREATE OR REPLACE would leave the OLD,
-- vulnerable 0/1-parameter version live alongside the new one. The DROP
-- is necessary for the fix to actually remove the vulnerable surface.
--
-- MIGRATION IMPLICATIONS — READ BEFORE APPLYING:
--   - This is a BREAKING change to the RPC signatures. It must be applied
--     in the SAME deploy as the application-code changes that pass
--     p_org_id at every call site (see the accompanying src/ changes in
--     this same commit) — applying the SQL alone will break every
--     Insights panel until the client catches up, since the old 1-arg
--     calls will 404/error against the new 2-arg-only functions.
--   - org_event_correlation is NOT touched — the sweep confirmed it
--     already derives org_id correctly from the event row itself.
--   - Existing er_executive_briefs / periodic-review rows generated
--     BEFORE this fix may already contain blended data from the live
--     exposure described above. This migration does not retroactively
--     clean those rows — that is a data-quality decision for a human to
--     make (flag, delete, or leave with a caveat), not something to do
--     silently inside a schema migration. Recommend reviewing
--     er_executive_briefs for any org with 2+-org members before treating
--     historical briefs as trustworthy.
--
-- HOW TO APPLY: paste the whole file in one Supabase SQL Editor run.
-- ============================================================================


-- ============================================================================
-- PART 1 — Shared guards
-- ============================================================================
-- assert_org_access(p_org_id): raises unless the calling user is a member
-- of p_org_id; returns p_org_id itself so it can be used INLINE as the
-- scoping expression in a query (`where org_id = assert_org_access(p_org_id)`)
-- rather than as a separate check a future edit could accidentally drop
-- while leaving the query itself unscoped. STABLE + SECURITY INVOKER
-- (deliberately NOT DEFINER) — it should see exactly what the calling
-- user's own RLS would show it, since it's re-deriving my_org_ids()'s own
-- membership check, not bypassing anything.
create or replace function public.assert_org_access(p_org_id uuid)
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  if p_org_id is null then
    raise exception 'org_id is required' using errcode = '22004';
  end if;
  if p_org_id not in (select my_org_ids()) then
    raise exception 'Not a member of this organisation' using errcode = '42501';
  end if;
  return p_org_id;
end;
$$;

revoke all on function public.assert_org_access(uuid) from anon, public;
grant execute on function public.assert_org_access(uuid) to authenticated, service_role;

-- assert_theme_in_org: org_theme_root_cause's own p_theme_id was never
-- validated against any org at all — fixing only the my_org_ids() CTE
-- would leave this second, independent gap open (a theme id from Org B,
-- passed while Org A is the caller's active org, would return Org B's
-- real cases as if they were Org A's).
create or replace function public.assert_theme_in_org(p_theme_id uuid, p_org_id uuid)
returns uuid
language plpgsql
stable
security invoker
set search_path = public
as $$
begin
  perform public.assert_org_access(p_org_id);
  if not exists (select 1 from public.organisation_themes where id = p_theme_id and org_id = p_org_id) then
    raise exception 'Theme does not belong to this organisation' using errcode = '42501';
  end if;
  return p_theme_id;
end;
$$;

revoke all on function public.assert_theme_in_org(uuid, uuid) from anon, public;
grant execute on function public.assert_theme_in_org(uuid, uuid) to authenticated, service_role;


-- ============================================================================
-- PART 2 — org_insights_overview: drop the (p_period_days) overload,
-- recreate as (p_org_id, p_period_days)
-- ============================================================================
drop function if exists public.org_insights_overview(integer);

create function public.org_insights_overview(p_org_id uuid, p_period_days integer default 30)
returns jsonb
language sql
stable
as $$
  with my_cases as (
    select * from public.cases where org_id = public.assert_org_access(p_org_id)
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
    'org_id', p_org_id,
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

revoke all on function public.org_insights_overview(uuid, integer) from public, anon;
grant execute on function public.org_insights_overview(uuid, integer) to authenticated;


-- ============================================================================
-- PART 3 — org_trend_detection: drop the (p_period_days) overload,
-- recreate as (p_org_id, p_period_days)
-- ============================================================================
drop function if exists public.org_trend_detection(integer);

create function public.org_trend_detection(p_org_id uuid, p_period_days integer default 90)
returns jsonb
language sql
stable
as $$
  with my_cases as (
    select * from public.cases where org_id = public.assert_org_access(p_org_id)
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
    'org_id', p_org_id,
    'period_days', p_period_days,
    'by_type_trend', (select v from by_type_trend),
    'by_theme_trend', (select v from by_theme_trend)
  );
$$;

revoke all on function public.org_trend_detection(uuid, integer) from public, anon;
grant execute on function public.org_trend_detection(uuid, integer) to authenticated;


-- ============================================================================
-- PART 4 — org_case_stats: drop the 0-arg overload, recreate as (p_org_id)
-- ============================================================================
drop function if exists public.org_case_stats();

create function public.org_case_stats(p_org_id uuid)
returns jsonb
language sql
stable
as $$
  with my_cases as (
    select * from public.cases where org_id = public.assert_org_access(p_org_id)
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
    'org_id', p_org_id,
    'total_cases', (select count(*) from my_cases),
    'active_cases', (select count(*) from my_cases where stage <> 'closed'),
    'closed_cases', (select count(*) from my_cases where stage = 'closed'),
    'high_priority_active', (select count(*) from my_cases where priority = 'high' and stage <> 'closed'),
    'cases_by_type', (select v from by_type),
    'cases_by_stage', (select v from by_stage)
  );
$$;

revoke all on function public.org_case_stats(uuid) from public, anon;
grant execute on function public.org_case_stats(uuid) to authenticated;


-- ============================================================================
-- PART 5 — org_theme_root_cause: drop the (p_theme_id, p_period_days)
-- overload, recreate as (p_org_id, p_theme_id, p_period_days) with the
-- theme itself now validated against that org too (Shape B from the sweep)
-- ============================================================================
drop function if exists public.org_theme_root_cause(uuid, integer);

create function public.org_theme_root_cause(p_org_id uuid, p_theme_id uuid, p_period_days integer default 90)
returns jsonb
language sql
stable
as $$
  with validated as (
    select public.assert_theme_in_org(p_theme_id, p_org_id) as theme_id
  ),
  my_cases as (
    select * from public.cases where org_id = public.assert_org_access(p_org_id)
  ),
  period as (
    select now() - (p_period_days || ' days')::interval as cur_start, now() as cur_end
  ),
  target_case_ids as (
    select distinct ct.case_id
    from public.case_themes ct
    join my_cases c on c.id = ct.case_id
    cross join period p
    cross join validated
    where ct.theme_id = validated.theme_id and c.created_at >= p.cur_start and c.created_at < p.cur_end
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
      cross join validated
      where ct2.case_id in (select case_id from target_case_ids) and ct2.theme_id <> validated.theme_id
      group by ct2.theme_id
    ) x
    join public.organisation_themes th on th.id = x.theme_id and th.org_id = p_org_id
  )
  select jsonb_build_object(
    'org_id', p_org_id,
    'theme_id', p_theme_id,
    'period_days', p_period_days,
    'current_count', (select count(*) from target_case_ids),
    'by_location', (select v from by_location),
    'co_occurring_themes', (select v from co_occurring)
  );
$$;

revoke all on function public.org_theme_root_cause(uuid, uuid, integer) from public, anon;
grant execute on function public.org_theme_root_cause(uuid, uuid, integer) to authenticated;


-- ============================================================================
-- PART 6 — er_executive_briefs: normalise its RLS to match its three
-- persisted-insight siblings (org_events, improvement_initiatives,
-- manager_capability_insights all already use this exact shape)
-- ============================================================================
-- Not a tenant-scoping fix on its own (this table's rows are already
-- correctly org_id-tagged at write time by the client, per Part 2's own
-- caveat above about relying on client .eq() calls for reads) — this is
-- the "defence in depth for Shape C" the sweep recommended: giving all
-- four persisted-insight tables one reviewable RLS shape instead of three
-- matching and one different, so a future table modelled on "whichever of
-- these four I copied" doesn't inherit the odd one out.
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'er_executive_briefs'
  loop
    execute format('drop policy %I on public.er_executive_briefs', pol.policyname);
  end loop;
end $$;

create policy "er_executive_briefs_select_hr" on public.er_executive_briefs
for select using (
  org_id in (select my_org_ids())
  and exists (
    select 1 from public.org_members om
    where om.org_id = er_executive_briefs.org_id and om.user_id = auth.uid() and public.is_hr_role(om.role)
  )
);
create policy "er_executive_briefs_insert_hr" on public.er_executive_briefs
for insert with check (
  org_id in (select my_org_ids())
  and exists (
    select 1 from public.org_members om
    where om.org_id = er_executive_briefs.org_id and om.user_id = auth.uid() and public.is_hr_role(om.role)
  )
);
