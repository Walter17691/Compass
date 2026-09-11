-- ============================================================================
-- Release 1.0 P1 remediation — 2026-09-11 (revised after final security gate)
-- TEAM INVITATIONS (per-invitation records) + HR DIRECTOR PRIVILEGE BOUNDARY
-- ============================================================================
-- Three fixes, bundled because Phase 1B UAT and the invite architecture
-- investigation surfaced all three on the same surface. This file has not
-- yet been applied to production — safe to edit in place rather than
-- stacking a second migration on top of an unreleased one.
--
-- PART 1 — team_invites: every team-member invitation today shares one
-- permanent, org-wide organisations.invite_code — there is nowhere to
-- record an intended role/location for a specific invitation, no way to
-- revoke one invitation without rotating the code for everyone, and no
-- way to bind an invitation to a specific recipient email. Shaped after
-- employee_portal_invites (2026-07-25) — a real per-invitation row with
-- its own unique credential, expiry and acceptance timestamp.
--
-- Final security gate finding — TOKEN STORAGE: the raw token is a bearer
-- credential capable of granting organisation membership on its own; a
-- 122-bit UUID has more than enough entropy to resist brute force, but
-- storing it in plaintext means anyone who can read this table by any
-- means OTHER than the intended acceptance flow — a Supabase dashboard
-- SQL query, a database backup, a future support/debug session, a
-- misconfigured logging integration — gets a directly usable credential,
-- not just evidence one once existed. Since zero real invitations exist
-- anywhere yet (this migration has never been applied), switching to
-- hash storage costs nothing in migration complexity — there is nothing
-- to invalidate. Only a SHA-256 hash of the token is ever stored; the raw
-- value exists only in the invitation email/URL and the caller's
-- immediate request. This does not change the entropy or brute-force
-- resistance (both designs are equally infeasible to guess) — it changes
-- what a database-level read discloses.
--
-- PART 2 — accept_team_invite (rewritten): final security gate finding —
-- ACCEPT FUNCTION AUTH: the previous version took p_verified_email as a
-- plain parameter. The API layer correctly derived it from the Supabase
-- auth admin API rather than the client, but the SQL function itself —
-- SECURITY DEFINER, EXECUTE granted to authenticated — never verified
-- that parameter against anything; a caller invoking this RPC directly
-- (bypassing api/accept-team-invite.js entirely) could pass ANY email
-- string, including one they don't own, and accept someone else's
-- invitation as themselves. The function now derives the caller's
-- verified email itself from auth.jwt()->>'email' — the claim Supabase's
-- own auth system puts in the JWT it already validated to establish this
-- session — so there is no parameter left for a direct caller to lie
-- about. The API layer's own admin-lookup-and-compare step is removed as
-- redundant now that the database is the authoritative boundary, not a
-- second, separately-maintained copy of the same check.
--
-- PART 3 — legacy organisations.invite_code / join_org_with_invite_code:
-- final security gate finding — LEGACY BYPASS, CRITICAL. Traced every
-- caller: OrgSetup.jsx's handleCreate (founding member) never calls this
-- RPC at all — it inserts organisations/org_members directly, gated by
-- the org_members_insert_founding_member policy (role must be
-- hr_director, the org must have zero existing members, the caller must
-- be the org's own creator). handleJoin is the ONLY caller, and the RPC
-- itself (SECURITY DEFINER, EXECUTE granted to `authenticated`) requires
-- nothing beyond a valid session and a matching invite_code string — no
-- org-membership check on the caller, no recipient binding, no expiry,
-- no revocation, no per-invite audit. Any authenticated Compass user, in
-- any org, who obtains any other org's invite_code — a never-rotated,
-- never-expiring, previously-UI-displayed secret that may already be
-- sitting in old emails, chat messages, or browser history — can grant
-- themselves location_manager membership in that org through this RPC
-- directly, completely bypassing every property team_invites exists to
-- provide. This is a full, permanent, "anyone with the code" backdoor
-- around the entire remediation.
--
-- Founding-member org creation does not use this RPC at all, so revoking
-- its EXECUTE grant from authenticated has zero effect on legitimate org
-- creation. The only capability lost is an existing Compass user
-- self-joining an org (their own team, or — per OrgSetup's "Join another
-- organisation" — a second, unrelated org) purely by typing a shared
-- code, with none of team_invites' safeguards. That capability has no
-- way to distinguish legitimate use from the exact backdoor being
-- closed, so it is retired outright rather than narrowed — per instruction,
-- security takes priority over this cosmetic convenience. Any future
-- multi-org self-service join should be built on the same per-invitation
-- token model as team_invites, not resurrect a shared-secret RPC.
-- ============================================================================


-- ============================================================================
-- PART 1 — team_invites
-- ============================================================================

create table if not exists public.team_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references public.organisations(id) on delete cascade,
  name text not null,
  email text not null,
  -- SHA-256 hex digest of a 32-byte (256-bit) crypto.randomBytes() token —
  -- see api/invite-member.js/api/team-invites.js. The raw token itself is
  -- never persisted anywhere; only ever present in the invitation
  -- email/URL and the caller's own request to accept it.
  token_hash text not null unique,
  intended_role text not null check (intended_role in (
    'hr_manager', 'location_manager', 'line_manager', 'investigator', 'legal_reviewer', 'auditor'
    -- hr_director is deliberately never a valid intended_role here — see
    -- Part 2's own header comment and the org_members_insert_founding_member
    -- policy, which already restricts hr_director creation to an org's own
    -- founding member. Ordinary team invitations must never grant it.
  )),
  intended_location_ids uuid[] not null default '{}',
  created_by uuid references auth.users(id),
  status text not null default 'pending' check (status in ('pending', 'accepted', 'revoked')),
  expires_at timestamptz not null,
  accepted_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists team_invites_org_id_idx on public.team_invites (org_id);
-- Fast "is there already a pending invite for this email in this org"
-- lookup (api/invite-member.js uses this to avoid issuing a second,
-- ambiguous pending invitation to the same address).
create index if not exists team_invites_org_email_pending_idx on public.team_invites (org_id, lower(email)) where status = 'pending';

alter table public.team_invites enable row level security;
-- Intentionally no policies — same reasoning as employee_portal_invites
-- (supabase/employee_portal_2026-07-25.sql): every legitimate access path
-- (create, list, revoke, resend, accept) is a service-role API endpoint
-- that has already authorized the caller itself, or the SECURITY DEFINER
-- function below. No anon/authenticated client ever queries this table
-- directly, so there is nothing to enumerate — and even a direct read
-- (dashboard, backup, support tooling) discloses only a hash, never a
-- usable credential.


-- ----------------------------------------------------------------------------
-- accept_team_invite: atomic acceptance, identity derived from the
-- session's own verified JWT — never a caller-supplied parameter.
--
-- Race-safety: the UPDATE ... WHERE status = 'pending' ... RETURNING is
-- the atomicity boundary. Postgres row-level locking means at most one
-- concurrent call can ever see a row returned from it — a second,
-- simultaneous accept attempt (double-click, two tabs) finds status
-- already flipped to 'accepted' and gets zero rows back, so it fails
-- cleanly rather than racing into a duplicate membership. The
-- org_members(org_id, user_id) UNIQUE constraint is a second, independent
-- backstop even if that reasoning were ever wrong.
create or replace function public.accept_team_invite(p_token_hash text)
returns table (org_id uuid, org_name text, role text)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite record;
  v_org record;
  v_existing_member record;
  v_verified_email text;
begin
  if auth.uid() is null then
    raise exception 'Not authenticated';
  end if;

  -- The email claim in the JWT Supabase's own auth system already
  -- validated to establish this session — not a value the caller can
  -- supply or influence via any request parameter.
  v_verified_email := lower(trim(coalesce(auth.jwt()->>'email', '')));
  if v_verified_email = '' then
    raise exception 'Could not verify your account email';
  end if;

  if not check_rate_limit('accept_team_invite:' || auth.uid()::text, 10, 300) then
    raise exception 'Too many attempts — please wait a few minutes and try again.';
  end if;

  select * into v_invite from public.team_invites where token_hash = p_token_hash;
  if v_invite.id is null then
    raise exception 'Invitation not found';
  end if;

  if v_invite.status = 'revoked' then
    raise exception 'This invitation has been revoked';
  end if;
  if v_invite.status = 'accepted' then
    raise exception 'This invitation has already been used';
  end if;
  if v_invite.expires_at < now() then
    raise exception 'This invitation has expired';
  end if;
  if lower(trim(v_invite.email)) <> v_verified_email then
    raise exception 'This invitation was sent to a different email address';
  end if;

  -- Atomic claim: only one concurrent caller can ever flip this row.
  update public.team_invites
  set status = 'accepted', accepted_at = now()
  where id = v_invite.id and status = 'pending'
  returning * into v_invite;

  if v_invite.id is null then
    raise exception 'This invitation has already been used';
  end if;

  select id, name into v_org from public.organisations where id = v_invite.org_id;
  if v_org.id is null then
    raise exception 'Organisation not found';
  end if;

  -- A user re-opening an already-accepted invitation link (e.g. a stale
  -- browser tab) should not error once they're already correctly a
  -- member — but this branch is only reachable if they are ALREADY a
  -- member with the invite still (impossibly, given the check above)
  -- pending, so in practice this just guards against the FK/unique
  -- constraint being the thing that fails instead of a clean message.
  select * into v_existing_member from public.org_members
  where org_members.org_id = v_invite.org_id and org_members.user_id = auth.uid();
  if v_existing_member.id is not null then
    raise exception 'You are already a member of this organisation';
  end if;

  insert into org_members (org_id, user_id, role, name, location_ids)
  values (v_invite.org_id, auth.uid(), v_invite.intended_role, trim(v_invite.name), v_invite.intended_location_ids);

  return query select v_org.id, v_org.name, v_invite.intended_role;
end;
$$;

revoke all on function public.accept_team_invite(text) from public, anon;
grant execute on function public.accept_team_invite(text) to authenticated;


-- ============================================================================
-- PART 2 — HR Director privilege boundary (NEW-9)
-- ============================================================================
-- CREATE OR REPLACE on the existing function — the trigger that calls it
-- (protect_org_member_privilege_columns_trigger, 2026-08-04) is untouched,
-- since its name and firing condition (role or location_ids changing)
-- both stay correct; only the authorization check inside changes.
--
-- Final security gate — HR DIRECTOR GOVERNANCE: reviewed whether the
-- absence of a "last HR Director" safeguard creates a lockout risk (an
-- org's only hr_director demoting/removing themselves would leave no one
-- able to create a new one, since only an existing hr_director now can).
-- This requires a deliberate or accidental self-action by the org's most
-- privileged existing user, not an attacker or a normal workflow step; it
-- has a real if unpleasant recovery path (a service-role/support
-- intervention); and it causes no data corruption, cross-tenant exposure,
-- or incorrect automated HR action. Classified P2 — real, worth fixing,
-- but not a Release 1.0 customer-GO blocker — and tracked as backlog
-- rather than implemented here, since scope for this pass is the three
-- confirmed CHANGE REQUIRED items only.
create or replace function public.protect_org_member_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
begin
  if (new.role is distinct from old.role) or (new.location_ids is distinct from old.location_ids) then
    if auth.role() = 'service_role' then
      return new;
    end if;

    select role into v_caller_role from public.org_members
    where org_id = old.org_id and user_id = auth.uid();

    if v_caller_role is null or v_caller_role not in ('hr_director', 'hr_manager') then
      raise exception 'Only an HR Director or HR Manager can change a member''s role or location access';
    end if;

    -- Touching the hr_director tier in either direction — promoting a
    -- non-director into it, or demoting/moving an existing director out
    -- of it — is a step up from ordinary role management and stays
    -- restricted to an existing hr_director, mirroring the same
    -- privileged-founding-member boundary org_members_insert_founding_member
    -- already enforces for the very first hr_director an org ever gets.
    -- An hr_manager can still freely manage every other role (hr_manager,
    -- location_manager, line_manager, investigator, legal_reviewer,
    -- auditor) exactly as before this migration.
    if (new.role = 'hr_director' or old.role = 'hr_director') and v_caller_role <> 'hr_director' then
      raise exception 'Only an existing HR Director can grant or remove HR Director access';
    end if;
  end if;
  return new;
end;
$$;


-- ============================================================================
-- PART 3 — retire the legacy shared-code join path for ordinary use
-- ============================================================================
-- organisations.invite_code and join_org_with_invite_code are NOT dropped
-- — the column and function stay intact for forensic/historical reasons
-- and because dropping a SECURITY DEFINER function other code might still
-- reference is unnecessary risk for no benefit. What changes is who can
-- reach it: EXECUTE is revoked from authenticated (and, for completeness,
-- anon/public), so no client — through the UI or by calling the RPC
-- directly — can invoke it any longer. Founding-member org creation
-- (OrgSetup.jsx's handleCreate) never called this function and is
-- entirely unaffected. src/OrgSetup.jsx's "Join an existing team" mode,
-- which was this function's only caller, is removed in the same
-- remediation pass so the UI does not offer a control that would now
-- always fail with a permission error.
revoke all on function public.join_org_with_invite_code(text, text) from public, anon, authenticated;
