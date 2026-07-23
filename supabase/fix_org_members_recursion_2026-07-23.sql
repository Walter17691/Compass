-- ============================================================================
-- URGENT FIX: infinite recursion in org_members policies — 2026-07-23
--
-- The previous migration (join_org_by_code_2026-07-23.sql) used this
-- pattern for the org_members SELECT/UPDATE policies and the founding-
-- member INSERT check:
--
--   org_id in (select org_id from org_members where user_id = auth.uid())
--
-- That's a policy on org_members that queries org_members from inside
-- itself. Postgres has to re-apply the org_members RLS policy to evaluate
-- the subquery, which requires evaluating the policy again, which queries
-- org_members again — infinite recursion (Postgres error 42P17). This
-- broke every read of org_members, which cascades into anything whose own
-- policy checks org membership through it (cases, org_roles, locations,
-- hr_review_requests) — i.e. it broke logging in for existing users.
--
-- Sorry — this should have been the pattern from the start. The fix is a
-- SECURITY DEFINER helper function: it runs with elevated privileges
-- internally, so calling it from within a policy does NOT re-trigger that
-- table's own RLS, breaking the cycle. This is the standard Supabase
-- pattern for "does the current user belong to org X" checks.
--
-- HOW TO APPLY: paste into the SQL Editor and run immediately - this
-- repairs the previous migration, it doesn't need to be run in any
-- particular order relative to it as long as it runs after.
-- ============================================================================


-- Returns the set of org_ids the calling user belongs to. SECURITY DEFINER
-- means this runs with the function owner's privileges internally, so it
-- does not re-trigger org_members' own RLS policies while running.
create or replace function public.my_org_ids()
returns setof uuid
language sql
security definer
stable
set search_path = public
as $$
  select org_id from public.org_members where user_id = auth.uid()
$$;

revoke all on function public.my_org_ids() from public;
grant execute on function public.my_org_ids() to authenticated;


-- Same idea for the founding-member INSERT check ("does this org already
-- have at least one member") - also self-referential, also needs to go
-- through a SECURITY DEFINER function rather than a direct subquery.
create or replace function public.org_has_members(p_org_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (select 1 from public.org_members where org_id = p_org_id)
$$;

revoke all on function public.org_has_members(uuid) from public;
grant execute on function public.org_has_members(uuid) to authenticated;


-- ── org_members: replace the recursive policies ────────────────────────
drop policy if exists "org_members_select_same_org" on public.org_members;
drop policy if exists "org_members_update_same_org" on public.org_members;
drop policy if exists "org_members_insert_founding_member" on public.org_members;

create policy "org_members_select_same_org"
  on public.org_members for select
  to authenticated
  using ( org_id in (select public.my_org_ids()) );

create policy "org_members_update_same_org"
  on public.org_members for update
  to authenticated
  using ( org_id in (select public.my_org_ids()) );

create policy "org_members_insert_founding_member"
  on public.org_members for insert
  to authenticated
  with check ( user_id = auth.uid() and not public.org_has_members(org_id) );


-- ── org_roles, locations, hr_review_requests ───────────────────────────
-- These reference org_members from a DIFFERENT table's policy, which is
-- not recursive on its own - but they'd still error out as long as
-- org_members' own policies were broken, since querying org_members would
-- always fail. Switching them to the same helper function is not strictly
-- required to fix the error, but keeps every policy consistent and a
-- little cheaper (a stable function call vs a fresh correlated subquery).
drop policy if exists "org_roles_same_org" on public.org_roles;
create policy "org_roles_same_org"
  on public.org_roles for all
  to authenticated
  using ( org_id in (select public.my_org_ids()) )
  with check ( org_id in (select public.my_org_ids()) );

drop policy if exists "locations_same_org" on public.locations;
create policy "locations_same_org"
  on public.locations for all
  to authenticated
  using ( org_id in (select public.my_org_ids()) )
  with check ( org_id in (select public.my_org_ids()) );

drop policy if exists "hr_review_requests_same_org" on public.hr_review_requests;
create policy "hr_review_requests_same_org"
  on public.hr_review_requests for all
  to authenticated
  using ( org_id in (select public.my_org_ids()) )
  with check ( org_id in (select public.my_org_ids()) );
