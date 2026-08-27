-- ============================================================================
-- RLS remediation — 2026-07-23
--
-- Found via the Supabase dashboard policy list: several tables had a
-- properly-scoped policy sitting alongside a permissive "allow all" /
-- "Allow all" policy. Postgres RLS OR's multiple permissive policies
-- together, so the "allow all" policy silently overrode the real one —
-- meaning the anon key alone (which is public, it's in the client bundle)
-- could read/write every organisation's data on those tables, not just
-- the caller's own org.
--
-- HOW TO APPLY:
--   1. Read this whole file before running any of it.
--   2. Supabase dashboard -> SQL Editor -> paste and run.
--   3. After running, go back to Database -> Policies and confirm each
--      table listed below shows only the new policy (no more "allow all").
--   4. Test the app end-to-end afterwards: sign in, view cases, add a
--      team member, add an org role, request an HR review.
--
-- Every policy below follows the same shape: a row is visible/writable
-- if its org_id matches one of the current user's org_members rows.
-- That's the same pattern already used by the working "employee_records"
-- and "case_access" policies, just applied to the tables that were
-- missing it.
-- ============================================================================


-- ── cases ───────────────────────────────────────────────────────────────
-- "Users can access cases in their org or assigned to them" already does
-- the correct job. Remove the two policies that bypassed it.
-- Before dropping "Own cases", open it in the dashboard once to confirm
-- it isn't doing something the other policy doesn't cover.
drop policy if exists "allow all cases" on public.cases;
drop policy if exists "Own cases" on public.cases;


-- ── audit_log ───────────────────────────────────────────────────────────
-- Not queried anywhere in the app (the visible audit log is stored in
-- the browser only). Removing the permissive policy is enough — "Own
-- audit" stays, and with RLS enabled + no other policy, the table is
-- effectively locked down, which is correct for an unused table.
drop policy if exists "allow all audit" on public.audit_log;


-- ── signing_requests ────────────────────────────────────────────────────
-- Also not queried anywhere in the app (e-signature status is stored on
-- each case's evidence entries instead). Drop the open policy and leave
-- it with none — RLS-enabled-with-no-policy denies all access, which is
-- correct for a table nothing reads or writes.
drop policy if exists "Allow all" on public.signing_requests;


-- ── organisations ───────────────────────────────────────────────────────
-- Needs to support two real flows: (1) a member viewing their own org,
-- and (2) a brand-new user looking up an org by invite code before they
-- have any org_members row at all (OrgSetup.jsx "join" flow). That means
-- SELECT can't be fully org-scoped — it has to allow any authenticated
-- user to query by invite_code. This is a real, intentional trade-off:
-- your invite code is a bearer token, not a full secret, and this policy
-- only closes the "no login required at all" hole, not "any teammate at
-- any company could enumerate every org." See the note at the bottom of
-- this file for the deeper fix.
drop policy if exists "allow all org" on public.organisations;
-- Phase 6.5 hardening (closes independent audit finding 9.2) — every
-- create policy below originally had no preceding drop for its OWN
-- name, only for the legacy "allow all"-style name — replaying this
-- file (disaster recovery, standing up a staging environment) hit a
-- real 42710 duplicate_object error at whichever create policy ran
-- second, aborting the whole pasted-as-one-batch transaction and
-- leaving every statement after that point — including later drop
-- policy if exists "allow all locations"/"allow all hr_review_requests"
-- — never executed, silently stranding those tables on their original
-- permissive policies. Not applied again here (already live, confirmed
-- correct) — this only makes the file itself safely re-runnable.
drop policy if exists "organisations_select_authenticated" on public.organisations;
drop policy if exists "organisations_insert_own" on public.organisations;

create policy "organisations_select_authenticated"
  on public.organisations for select
  to authenticated
  using (true);

create policy "organisations_insert_own"
  on public.organisations for insert
  to authenticated
  with check (created_by = auth.uid());


-- ── org_members ─────────────────────────────────────────────────────────
-- INSERT can't be org-scoped: when someone creates or joins an org, this
-- is the very first row establishing their membership, so there's no
-- existing org_members row yet to scope against. It's restricted to
-- "you can only ever insert a row for yourself" instead. See the note at
-- the bottom of this file — this does not by itself re-check the invite
-- code server-side.
drop policy if exists "allow all members" on public.org_members;
drop policy if exists "org_members_select_same_org" on public.org_members;
drop policy if exists "org_members_insert_self" on public.org_members;
drop policy if exists "org_members_update_same_org" on public.org_members;

create policy "org_members_select_same_org"
  on public.org_members for select
  to authenticated
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );

create policy "org_members_insert_self"
  on public.org_members for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "org_members_update_same_org"
  on public.org_members for update
  to authenticated
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );


-- ── org_roles ───────────────────────────────────────────────────────────
-- Currently has RLS enabled with zero policies, which means the API
-- denies ALL access — this is a functional bug, not a security one: the
-- "Job Titles & Access Levels" section of Org Settings can't actually
-- read or write this table right now.
drop policy if exists "org_roles_same_org" on public.org_roles;

create policy "org_roles_same_org"
  on public.org_roles for all
  to authenticated
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );


-- ── locations ───────────────────────────────────────────────────────────
drop policy if exists "allow all locations" on public.locations;
drop policy if exists "locations_same_org" on public.locations;

create policy "locations_same_org"
  on public.locations for all
  to authenticated
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );


-- ── hr_review_requests ──────────────────────────────────────────────────
drop policy if exists "allow all hr_review_requests" on public.hr_review_requests;
drop policy if exists "hr_review_requests_same_org" on public.hr_review_requests;

create policy "hr_review_requests_same_org"
  on public.hr_review_requests for all
  to authenticated
  using (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  )
  with check (
    org_id in (select org_id from public.org_members where user_id = auth.uid())
  );


-- ============================================================================
-- Not touched, and why:
--   - case_access, employee_records, meetings, profiles: already have a
--     single properly-named policy with no "allow all" sibling.
--     case_access verified live (Phase 6.5 hardening): SELECT is
--     org_id-scoped (my_org_ids()), INSERT/DELETE additionally require
--     can_grant_case_access(case_id, org_id) — no enumeration gap.
--     employee_records/meetings/profiles not re-verified at that pass.
--
-- Residual gap noted here at the time of writing — closed by later
-- migrations, kept as a pointer rather than deleted so disaster-recovery
-- replay doesn't have to rediscover this history:
--   This file's own org_members_insert_self policy above only checked
--   "are you inserting a row for yourself" — nothing verified an invite
--   code, because the insert payload never carried one. Two follow-ups
--   closed it, in order:
--     1. join_org_by_code_2026-07-23.sql (same day) moved the join into
--        join_org_with_invite_code(), a SECURITY DEFINER function that
--        validates the code server-side and is the only way to insert a
--        membership row into an org that already has members.
--     2. org_members_privilege_escalation_fix_2026-08-04.sql (12 days
--        later) went further: dropped org_members_insert_self entirely
--        (it still allowed self-insert into ANY org_id with ANY role,
--        including hr_director, bypassing the function above via a
--        direct API call), removed the function's caller-supplied
--        p_role parameter (every invite-code join is now always
--        location_manager), and added a column-level trigger so role/
--        location_ids can only change via an existing hr_director/
--        hr_manager or service_role.
--   Live-verified 2026-08-26: org_members' only INSERT policy is
--   org_members_insert_founding_member, matching migration 2's
--   with_check exactly (self, hr_director, zero existing members, own
--   org) — the database reflects the fully-hardened state, not just
--   this file's or migration 1's.
-- ============================================================================
