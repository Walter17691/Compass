-- ============================================================================
-- Close org_members privilege-escalation paths — 2026-08-04
--
-- Found via Supabase's own security advisor while auditing the fix for the
-- signing_requests bug. Three compounding issues, all in the same table:
--
-- 1. org_members_insert_self had with_check (user_id = auth.uid()) and
--    NOTHING else — any authenticated user could INSERT themselves into
--    ANY org_id with ANY role (including hr_director), with no invite
--    code, no membership check, nothing. This bypasses
--    join_org_with_invite_code entirely; you only need to know an org's
--    UUID, not its invite code.
--
-- 2. join_org_with_invite_code (SECURITY DEFINER RPC) validates the
--    invite code server-side, but accepts the caller's own p_role
--    ('hr_manager'|'hr_director'|'location_manager') with no check on
--    whether that's an appropriate role for a self-service join. The
--    join UI (OrgSetup.jsx) literally offers "HR Director" in a
--    dropdown on the invite-code screen. Since invite codes are treated
--    as bearer tokens, not secrets (see rls_fixes_2026-07-23.sql), this
--    means anyone who obtains one — which is expected to happen fairly
--    loosely — could grant themselves full admin access to that org.
--
-- 3. org_members_update_same_org allowed ANY existing member of an org,
--    regardless of their own role, to UPDATE any other member's row —
--    including their role and location_ids — with no check that the
--    caller is themselves an hr_director/hr_manager. A location_manager
--    could self-promote, or promote an accomplice, directly from the
--    client.
--
-- Fix: the only legitimate ways into org_members are (a) founding a
-- brand-new org as its creator (always hr_director), or (b) joining an
-- existing org via a validated invite code, always at the lowest
-- privilege (location_manager) — anyone needing more is promoted
-- afterward by an existing hr_director/hr_manager, the same
-- authorization api/invite-member.js and Settings' "Edit access" already
-- enforce server-side; this migration makes the database enforce it too,
-- not just the API layer.
-- ============================================================================

-- 1. Remove the unrestricted self-insert policy entirely — nothing
--    legitimate needs it once (2) covers joining.
drop policy if exists "org_members_insert_self" on public.org_members;

-- 2. Tighten founding-member insert: must be the org's own creator,
--    the org must genuinely have no members yet, and the role must be
--    hr_director (a founding member is always the director).
drop policy if exists "org_members_insert_founding_member" on public.org_members;
create policy "org_members_insert_founding_member"
  on public.org_members for insert
  with check (
    user_id = auth.uid()
    and role = 'hr_director'
    and not org_has_members(org_id)
    and org_id in (select id from public.organisations where created_by = auth.uid())
  );

-- 3. Column-level guard: role and location_ids (both privilege-bearing)
--    can only change via service_role or an existing hr_director/
--    hr_manager of that org — mirrors protect_billing_columns()'s
--    existing pattern for organisations. Other columns (name,
--    email_digest_opt_in) stay freely self-editable — a member updating
--    their own digest preference shouldn't need HR-level access.
create or replace function public.protect_org_member_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if (new.role is distinct from old.role) or (new.location_ids is distinct from old.location_ids) then
    if auth.role() <> 'service_role' and not exists (
      select 1 from public.org_members
      where org_id = old.org_id and user_id = auth.uid() and role in ('hr_director','hr_manager')
    ) then
      raise exception 'Only an HR Director or HR Manager can change a member''s role or location access';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists protect_org_member_privilege_columns_trigger on public.org_members;
create trigger protect_org_member_privilege_columns_trigger
  before update on public.org_members
  for each row execute function public.protect_org_member_privilege_columns();

-- 4. join_org_with_invite_code no longer accepts a caller-supplied role —
--    every invite-code join is a location_manager; promotion happens
--    afterward through the already-gated "Edit access" flow. Drop and
--    recreate rather than CREATE OR REPLACE since the parameter list
--    (and therefore the function's identity) is changing.
drop function if exists public.join_org_with_invite_code(text, text, text);

create function public.join_org_with_invite_code(p_invite_code text, p_name text)
returns table(org_id uuid, org_name text, org_invite_code text)
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
  values (v_org.id, auth.uid(), 'location_manager', trim(p_name));

  return query select v_org.id, v_org.name, v_org.invite_code;
end;
$$;
