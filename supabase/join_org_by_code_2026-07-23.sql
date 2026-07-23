-- ============================================================================
-- Close the invite-code bypass — 2026-07-23
--
-- The "join an existing org" flow (OrgSetup.jsx handleJoin) only checks the
-- invite code in the browser: it SELECTs organisations by invite_code, then
-- INSERTs an org_members row using that org's id. The org_members INSERT
-- policy from the previous migration only checked "are you inserting a row
-- for yourself" — nothing verified the invite code was ever actually
-- correct, because the insert payload never carries it. Anyone with any
-- Compass account, in any org, could skip the UI and call the API directly
-- to insert themselves into a DIFFERENT org as hr_director, as long as they
-- could find or guess that org's id.
--
-- Fix: move the join into a Postgres function that is the only way to
-- become a member of an org that already has members. It takes the invite
-- code as its only input, validates it server-side, and inserts the row
-- itself using auth.uid() (never a client-supplied user id, so you can't
-- insert membership on someone else's behalf either).
--
-- HOW TO APPLY: paste into the Supabase SQL Editor and run, same as the
-- previous migration. After running, the app's join-team flow needs the
-- matching code change in OrgSetup.jsx (already made in this commit) to
-- actually call this function instead of the old two-step insert.
-- ============================================================================


-- Replace the "insert yourself, no other checks" policy with one that only
-- allows self-insertion into an org that has ZERO existing members. That's
-- exactly the "I just created this org, make me its founding member" case
-- (handleCreate) — nothing else can succeed through this policy anymore.
drop policy if exists "org_members_insert_self" on public.org_members;

create policy "org_members_insert_founding_member"
  on public.org_members for insert
  to authenticated
  with check (
    user_id = auth.uid()
    and not exists (
      select 1 from public.org_members existing
      where existing.org_id = org_members.org_id
    )
  );


-- SECURITY DEFINER: runs with the privileges of the function's owner (which
-- has RLS-bypass rights in Supabase), so it can legitimately insert a member
-- into an org that already has other members — the one case the policy
-- above deliberately no longer allows directly. Everything inside is
-- trusted precisely because the invite code was checked first.
create or replace function public.join_org_with_invite_code(
  p_invite_code text,
  p_name text,
  p_role text default 'hr_manager'
)
returns table (org_id uuid, org_name text, org_invite_code text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_org record;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  if p_role not in ('hr_manager','hr_director','location_manager') then
    raise exception 'Invalid role';
  end if;

  select id, name, invite_code into v_org
  from organisations
  where invite_code = upper(trim(p_invite_code));

  if v_org.id is null then
    raise exception 'Invalid invite code';
  end if;

  if exists (
    select 1 from org_members
    where org_members.org_id = v_org.id and org_members.user_id = auth.uid()
  ) then
    raise exception 'You are already a member of this organisation';
  end if;

  insert into org_members (org_id, user_id, role, name)
  values (v_org.id, auth.uid(), p_role, trim(p_name));

  return query select v_org.id, v_org.name, v_org.invite_code;
end;
$$;

-- Lock the function down to logged-in users only, then explicitly grant it -
-- functions aren't covered by table RLS, so this is what actually gates it.
revoke all on function public.join_org_with_invite_code(text, text, text) from public;
grant execute on function public.join_org_with_invite_code(text, text, text) to authenticated;
