-- ============================================================================
-- Three-level case-access permission model — 2026-09-13
-- ============================================================================
-- Replaces the current, harder-to-reason-about case-visibility surface
-- (role-name lists, location scoping that has been dead in practice since
-- manager_enablement_case_access_2026-08-13.sql, and a separate
-- confidentiality carve-out) with three explicit levels, persisted on
-- org_members.case_access_level and team_invites.intended_case_access_level:
--
--   LEVEL 1 — org membership alone grants every case in the org, including
--             confidential ones. No dependency on creator, owner, location,
--             or case_access.
--   LEVEL 2 — created_by = auth.uid() OR an explicit case_access row.
--   LEVEL 3 — an explicit case_access row ONLY. created_by does NOT grant
--             visibility, and Level 3 cannot create cases at all.
--
-- Role is UNCHANGED and remains what it always was — a capability gate
-- (invite people, manage settings, appoint a disciplinary officer, approve
-- HR Review Gate sign-off, HR Intervention actions). case_access_level is a
-- new, independent column answering a different question: which cases can
-- this person see. This is a deliberate architectural split, not a rename.
--
-- org_members.access_level (organisational seniority / ACAS disciplinary-
-- officer eligibility, HandoffModal.jsx / org_roles) and its is_hr sibling
-- are NOT touched by this migration at all — confirmed, during design, to
-- be a completely separate, unrelated pre-existing feature. The new column
-- is deliberately named case_access_level, not access_level, specifically
-- to avoid colliding with it.
--
-- owner_id is explicitly NOT part of the new visibility model (per product
-- decision) — the column itself is untouched, left as legacy/compatibility
-- data pending a separate future investigation. It simply no longer
-- appears in any policy this migration writes.
--
-- can_grant_case_access() is investigated and DELIBERATELY left unchanged
-- — see this file's own end-of-file note for why (role/oversight OR
-- creator/owner OR existing case_access remains exactly the right rule for
-- "can I bring someone else onto this case", independent of the viewer's
-- own case_access_level).
-- ============================================================================


-- ============================================================================
-- PART 1 — schema
-- ============================================================================

alter table public.org_members add column if not exists case_access_level smallint;
alter table public.org_members drop constraint if exists case_access_level_range;
alter table public.org_members add constraint case_access_level_range check (case_access_level in (1, 2, 3));

alter table public.team_invites add column if not exists intended_case_access_level smallint;
alter table public.team_invites drop constraint if exists intended_case_access_level_range;
alter table public.team_invites add constraint intended_case_access_level_range check (intended_case_access_level in (1, 2, 3));


-- ============================================================================
-- PART 2 — existing-member migration (fail-closed: unrecognised role → 3)
-- ============================================================================
-- Pre-flight finding (2026-09-13, verified directly against production
-- before writing this migration): every existing org_members row is
-- hr_director or hr_manager (4 + 1, one org) — both map unambiguously to
-- Level 1 under this table. Zero location_manager/line_manager/
-- investigator/legal_reviewer/auditor rows exist yet, so this UPDATE's
-- real-world blast radius today is exactly those 5 rows. Written generally
-- regardless, for every future customer's full role spread.
update public.org_members set case_access_level = case role
  when 'hr_director' then 1
  when 'hr_manager' then 1
  when 'legal_reviewer' then 1
  when 'auditor' then 1
  when 'location_manager' then 2
  when 'line_manager' then 2
  when 'investigator' then 3
  else 3 -- fail-closed: never silently assign the most-open level
end
where case_access_level is null;

alter table public.org_members alter column case_access_level set not null;
alter table public.org_members alter column case_access_level set default null; -- no default: every future write must be explicit

-- Deployment correction (2026-09-13) — this file originally claimed
-- "team_invites has no legacy rows needing a backfill." That was wrong:
-- the first production apply attempt failed outright (23502, NOT NULL
-- violation) because 2 historical rows already existed (one revoked, one
-- accepted, both intended_role='hr_manager', predating this column).
-- Confirmed live before rolling forward: production rolled back this
-- entire migration atomically on that failure — no partial state, no
-- columns/policies/triggers were left behind. Backfilled here with the
-- SAME role-based mapping as PART 2 (not a blanket 3) since these rows'
-- intended_role is known and unambiguous; the value is purely historical/
-- audit data at this point (accept_team_invite already ran, if it ran,
-- using the role-based org_members backfill from PART 2 for the actual
-- grant) but should still accurately reflect what was really intended
-- rather than defaulting to the most restrictive value out of laziness.
update public.team_invites set intended_case_access_level = case intended_role
  when 'hr_director' then 1
  when 'hr_manager' then 1
  when 'legal_reviewer' then 1
  when 'auditor' then 1
  when 'location_manager' then 2
  when 'line_manager' then 2
  when 'investigator' then 3
  else 3
end
where intended_case_access_level is null;

alter table public.team_invites alter column intended_case_access_level set not null;


-- ============================================================================
-- PART 3 — cases: permissive policy (location dependency removed)
-- ============================================================================
-- Manager Enablement (Phase 4, MP1, 2026-08-13) already made
-- can_access_case_location()'s effect on this policy inert for actual case
-- visibility (confirmed empirically against production during the NEW-16
-- investigation, 2026-09-12/13) — the RESTRICTIVE policy below already
-- independently narrows every non-Level-1 member regardless of location.
-- This just removes the now-pointless dependency outright rather than
-- leaving dead-but-confusing logic in place, satisfying "locations do not
-- determine case visibility" structurally, not just in effect.
drop policy if exists "Users can access cases in their org or assigned to them" on public.cases;
create policy "Users can access cases in their org or assigned to them"
on public.cases as permissive for all
using (
  org_id in (select my_org_ids())
  or id in (select case_id from public.case_access where user_id = auth.uid())
);


-- ============================================================================
-- PART 4 — cases: restrictive policy, level-aware (replaces role-based one)
-- ============================================================================
-- Replaces "Non-oversight members restricted to their own assigned cases"
-- (manager_enablement_case_access_2026-08-13.sql) and its (write)/(delete)
-- siblings (manager_enablement_security_hardening_2026-08-14.sql). Also
-- replaces "Confidential cases restricted to authorised staff" — that
-- policy is DROPPED, not edited: under the approved model, Level 1 sees
-- confidential cases under the exact same unconditional rule as everything
-- else, and Level 2/3's confidential rule is IDENTICAL to their ordinary
-- rule (creator-or-case_access; case_access-only), so a separate
-- confidentiality gate would only ever reproduce what this one policy
-- already does — the explicit goal stated when approving this design
-- ("do not retain a hidden role-specific confidential exception").
--
-- owner_id is deliberately absent — not part of the approved model.
drop policy if exists "Non-oversight members restricted to their own assigned cases" on public.cases;
drop policy if exists "Non-oversight members restricted to their own assigned cases (write)" on public.cases;
drop policy if exists "Non-oversight members restricted to their own assigned cases (delete)" on public.cases;
drop policy if exists "Confidential cases restricted to authorised staff" on public.cases;

create policy "Case visibility scoped by case_access_level" on public.cases
as restrictive for select
using (
  exists (select 1 from public.org_members om where om.org_id = cases.org_id and om.user_id = auth.uid() and om.case_access_level = 1)
  or (
    exists (select 1 from public.org_members om where om.org_id = cases.org_id and om.user_id = auth.uid() and om.case_access_level = 2)
    and cases.created_by = auth.uid()
  )
  or exists (select 1 from public.case_access ca where ca.case_id = cases.id and ca.user_id = auth.uid())
);

create policy "Case write access scoped by case_access_level" on public.cases
as restrictive for update
using (
  exists (select 1 from public.org_members om where om.org_id = cases.org_id and om.user_id = auth.uid() and om.case_access_level = 1)
  or (
    exists (select 1 from public.org_members om where om.org_id = cases.org_id and om.user_id = auth.uid() and om.case_access_level = 2)
    and cases.created_by = auth.uid()
  )
  or exists (select 1 from public.case_access ca where ca.case_id = cases.id and ca.user_id = auth.uid())
)
with check (
  exists (select 1 from public.org_members om where om.org_id = cases.org_id and om.user_id = auth.uid() and om.case_access_level = 1)
  or (
    exists (select 1 from public.org_members om where om.org_id = cases.org_id and om.user_id = auth.uid() and om.case_access_level = 2)
    and cases.created_by = auth.uid()
  )
  or exists (select 1 from public.case_access ca where ca.case_id = cases.id and ca.user_id = auth.uid())
);

create policy "Case delete access scoped by case_access_level" on public.cases
as restrictive for delete
using (
  exists (select 1 from public.org_members om where om.org_id = cases.org_id and om.user_id = auth.uid() and om.case_access_level = 1)
  or (
    exists (select 1 from public.org_members om where om.org_id = cases.org_id and om.user_id = auth.uid() and om.case_access_level = 2)
    and cases.created_by = auth.uid()
  )
  or exists (select 1 from public.case_access ca where ca.case_id = cases.id and ca.user_id = auth.uid())
);


-- ============================================================================
-- PART 5 — Level 3 cannot create cases (DB-authoritative, not UI-only)
-- ============================================================================
create policy "Level 3 cannot create cases" on public.cases
as restrictive for insert
with check (
  exists (
    select 1 from public.org_members om
    where om.org_id = cases.org_id and om.user_id = auth.uid() and om.case_access_level in (1, 2)
  )
);


-- ============================================================================
-- PART 6 — confidential-case WRITE protection, rewritten to match the read
-- side exactly (closes the gap flagged when approving this design: HR
-- Manager is now Level 1 and can SEE confidential cases, but the old
-- role-list here — hr_director/legal_reviewer/auditor — excluded them from
-- WRITING to one, a visible, confusing inconsistency for the exact group
-- just given full visibility).
-- ============================================================================
create or replace function public.protect_confidential_case_write()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $$
begin
  if auth.role() = 'service_role' then
    return coalesce(new, old);
  end if;

  if old.confidential is distinct from true then
    return coalesce(new, old);
  end if;

  if exists (
    select 1 from public.org_members om
    where om.org_id = old.org_id and om.user_id = auth.uid() and om.case_access_level = 1
  ) then
    return coalesce(new, old);
  end if;

  if old.created_by = auth.uid() then
    return coalesce(new, old);
  end if;

  if exists (
    select 1 from public.case_access ca
    where ca.case_id = old.id and ca.user_id = auth.uid()
  ) then
    return coalesce(new, old);
  end if;

  raise exception 'You do not have access to modify this confidential case'
    using errcode = '42501';
end;
$$;


-- ============================================================================
-- PART 7 — accept_team_invite: set role AND case_access_level atomically
-- ============================================================================
-- Same single INSERT as before, one more column. No intermediate state is
-- possible — there is no default on org_members.case_access_level for a
-- broader level to accidentally apply if this were ever omitted, and this
-- is the only INSERT path accept_team_invite performs.
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

  select * into v_existing_member from public.org_members
  where org_members.org_id = v_invite.org_id and org_members.user_id = auth.uid();
  if v_existing_member.id is not null then
    raise exception 'You are already a member of this organisation';
  end if;

  insert into org_members (org_id, user_id, role, name, location_ids, case_access_level)
  values (v_invite.org_id, auth.uid(), v_invite.intended_role, trim(v_invite.name), v_invite.intended_location_ids, v_invite.intended_case_access_level);

  return query select v_org.id, v_org.name, v_invite.intended_role;
end;
$$;


-- ============================================================================
-- PART 8 — level-1 escalation protection, extending the existing
-- privilege-boundary trigger (NOT a new bespoke function) — mirrors the
-- already-proven hr_director-tier pattern exactly, for the new column.
-- Two independent checks in the same function: touching `role` only ever
-- checks the hr_director tier; touching `case_access_level` only ever
-- checks the Level-1 tier. Neither implies the other — changing someone's
-- case_access_level to 1 is explicitly NOT the same thing as making them
-- HR Director, exactly as specified when this design was approved.
--
-- Empirically-found bug fix (2026-09-13) — discovered via rolled-back
-- transactional testing while verifying this exact change, not
-- theoretically: the ORIGINAL hr_director-tier check
-- (`new.role = 'hr_director' or old.role = 'hr_director'`) fires whenever
-- EITHER side currently holds that value, regardless of whether `role`
-- itself is the column actually changing. This is a genuine PRE-EXISTING
-- bug (present since the original NEW-9 remediation, not introduced here):
-- an HR Manager updating only an existing HR Director's location_ids
-- (nothing to do with the role tier) was already incorrectly blocked,
-- because the outer condition already fired for a location_ids change and
-- the inner check didn't verify role was the field in motion. Adding
-- case_access_level to the same outer condition made this immediately
-- visible under test: an HR Manager (Level 1) legitimately changing an
-- HR Director's case_access_level was wrongly blocked by the HR-DIRECTOR
-- check, purely because the row happened to have role='hr_director', with
-- role itself never touched. Both checks are now scoped to fire only when
-- their OWN respective column is the one actually changing — fixing the
-- pre-existing location_ids case as a direct, in-scope side effect of
-- rewriting this function for case_access_level, not a separate project.
create or replace function public.protect_org_member_privilege_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_caller_role text;
  v_caller_level smallint;
begin
  if (new.role is distinct from old.role) or (new.location_ids is distinct from old.location_ids) or (new.case_access_level is distinct from old.case_access_level) then
    if auth.role() = 'service_role' then
      return new;
    end if;

    select role, case_access_level into v_caller_role, v_caller_level from public.org_members
    where org_id = old.org_id and user_id = auth.uid();

    if v_caller_role is null or v_caller_role not in ('hr_director', 'hr_manager') then
      raise exception 'Only an HR Director or HR Manager can change a member''s role, location access, or case access level';
    end if;

    if (new.role is distinct from old.role) and (new.role = 'hr_director' or old.role = 'hr_director') and v_caller_role <> 'hr_director' then
      raise exception 'Only an existing HR Director can grant or remove HR Director access';
    end if;

    -- Level 1 case access is a DIFFERENT tier from the hr_director ROLE —
    -- granting/removing it requires the acting user to already hold Level
    -- 1 themselves, checked by LEVEL, not by role name, so an HR Manager
    -- who is Level 1 has exactly the same authority here as an HR Director
    -- who is Level 1 (per the approved design: no hidden distinction
    -- between them based on role name alone).
    if (new.case_access_level is distinct from old.case_access_level) and (new.case_access_level = 1 or old.case_access_level = 1) and v_caller_level is distinct from 1 then
      raise exception 'Only an existing Level 1 user can grant or remove Level 1 case access';
    end if;
  end if;
  return new;
end;
$$;


-- ============================================================================
-- PART 9 — audit_log: fix a pre-existing leak AND prevent PART 10 (below)
-- from breaking production the moment this migration lands
-- ============================================================================
-- Found during final security review (2026-09-13), NOT by policy inspection
-- alone — confirmed live via pg_policy before writing this fix.
-- audit_log_select_scoped (audit_log_scoped_select_2026-08-21.sql) was never
-- touched by any of the 2026-09-05 "authoritative case access" fixes and
-- still calls can_access_case_location() directly in its case_id-scoped
-- branch. That function is a no-op for anyone who isn't a location-
-- restricted location_manager, so today, LIVE, independent of this
-- migration: any org member can read audit_log rows — including detail
-- text that routinely embeds the employee's name verbatim (e.g. "Meeting
-- saved: Jane Doe — Investigation meeting") — for ANY non-confidential
-- case in the org, regardless of case_access_level. This is the exact
-- Activity Bell / timeline leak the three-level model exists to close, and
-- it was missed because audit_log sits beside `cases`, not underneath it
-- through a simple child-table EXISTS like allegations/case_tasks/
-- case_themes/case_signals/hr_review_requests already do.
--
-- It would also have broken outright the moment this migration lands: PART
-- 10 revokes EXECUTE on can_access_case_location from `authenticated`.
-- SECURITY DEFINER changes whose privileges apply INSIDE a function body,
-- not whether the CALLING role needs EXECUTE to invoke it — and this
-- policy calls it directly as `authenticated`. Without this fix running
-- first, every authenticated user's very next audit_log query (Activity
-- Bell, Insights) would fail with "permission denied for function
-- can_access_case_location" — a self-inflicted production outage from a
-- migration whose own stated goal was zero regressions. This part must
-- run before PART 10's revoke, which is why it is numbered first.
drop policy if exists "audit_log_select_scoped" on public.audit_log;
create policy "audit_log_select_scoped" on public.audit_log
for select using (
  (
    case_id is not null
    and exists (
      select 1 from public.cases c
      where c.id = audit_log.case_id
        and (
          exists (select 1 from public.org_members om where om.org_id = c.org_id and om.user_id = auth.uid() and om.case_access_level = 1)
          or (
            exists (select 1 from public.org_members om where om.org_id = c.org_id and om.user_id = auth.uid() and om.case_access_level = 2)
            and c.created_by = auth.uid()
          )
          or exists (select 1 from public.case_access ca where ca.case_id = c.id and ca.user_id = auth.uid())
        )
    )
  )
  or (
    case_id is null
    and (
      user_id = auth.uid()
      or exists (select 1 from public.org_members om where om.org_id = audit_log.org_id and om.user_id = auth.uid() and is_hr_role(om.role))
    )
  )
);


-- ============================================================================
-- PART 10 — retire the now-dead location-based case-access helper
-- ============================================================================
-- Not dropped (forensic/historical continuity, matching this codebase's
-- established convention — see NEW-6's retirement of
-- join_org_with_invite_code) — just made unreachable. PART 3 removed its
-- caller on `cases`; PART 9 (above) just removed its last other caller, on
-- audit_log — confirmed via pg_proc/pg_policy source inspection that no
-- other live policy or trigger references it before this revoke runs.
revoke all on function public.can_access_case_location(uuid, uuid) from public, anon, authenticated;


-- ============================================================================
-- can_grant_case_access() — investigated, DELIBERATELY UNCHANGED.
-- ============================================================================
-- Traced every caller before touching anything: assignInvestigator (App.jsx)
-- grants case_access role="investigator"; ReassignCaseModal grants
-- role="case_owner"; the case-creation flow can optionally grant
-- role="case_owner" to someone other than the creator at creation time.
-- All three funnel through this same function's own INSERT policy check.
--
-- Its rule today — oversight role (hr_manager/hr_director/legal_reviewer/
-- auditor) OR the case's own creator/owner OR an existing case_access
-- holder — already correctly lets a Location Manager or Line Manager
-- (Level 2, non-oversight) assign an Investigator or hand off a case they
-- personally created, entirely independent of any level or role list. This
-- is a real, working, currently-relied-on workflow. Changing this to
-- "case_access_level = 1 only" would break it outright — a Level 2 user
-- who created their own case could no longer bring anyone else onto it.
-- No technical incompatibility with the new case_access_level model was
-- found, so per the explicit instruction to make no change unless
-- required, none is made here.


-- ============================================================================
-- PART 11 — Auditor read-only invariant: block writes to case_access
-- ============================================================================
-- Found during the final security review (2026-09-13) while explicitly
-- retesting "Auditor can read everything, write nothing" (Section N of that
-- review) against every case-adjacent table — NOT part of the case_access_
-- level model itself, and not introduced by it: can_grant_case_access()
-- (investigated immediately above, deliberately unchanged) includes
-- auditor via can_see_all_org_cases(), and case_access had no auditor-block
-- trigger at all, unlike allegations/case_signals/case_themes/case_tasks/
-- cases/hr_review_requests, which all already carry one
-- (auditor_read_only_enforcement_2026-08-26.sql). Confirmed exploitable via
-- a rolled-back transaction before writing this fix: an authenticated
-- Auditor could INSERT a case_access row granting themselves (or anyone)
-- "investigator" access to any case in the org — a direct violation of
-- ROLE_DESCRIPTIONS.auditor's own stated, already-shipped promise ("Read-
-- only access; cannot create, edit, or delete records"), not a new
-- restriction being introduced. Reuses block_auditor_write_via_case()
-- as-is (same generic case_id-to-org_id-to-role resolution already proven
-- on five other tables) rather than writing a new function.
create trigger block_auditor_write_case_access
before insert or update or delete on public.case_access
for each row execute function public.block_auditor_write_via_case();
