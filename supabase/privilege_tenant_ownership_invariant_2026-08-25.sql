-- ============================================================================
-- Phase 6.5 — Structural remediation (Prompt 12, Family 1)
-- PRIVILEGE AND TENANT OWNERSHIP INVARIANT
-- ============================================================================
-- Independent audit (Prompt 11) found a CRITICAL bug: org_members.user_id
-- and org_id could be rewritten by any org member with no server-side
-- guard, letting an invite-code joiner seize hr_director control of a
-- tenant or move a membership between orgs. A follow-up structural sweep
-- (Prompt 12) found this was one instance of a much wider pattern: across
-- 12+ tables, ownership/identity/privilege columns are writable by any org
-- member because the table's RLS policy only checks "does this row belong
-- to an org I'm in", never "should THIS caller be allowed to change THIS
-- specific column". Client-side hiding (a form that doesn't render a
-- field) is not authorization — every one of these was reachable directly
-- via a PATCH against the Supabase REST API.
--
-- This migration does NOT re-litigate column-by-column what was already
-- fixed correctly (case_tasks.source, concern_referrals' HR-only columns,
-- wellbeing_notes/dsar_requests HR-only tables, locations/process_templates
-- HR-write split — all verified still correct). It closes the columns the
-- sweep found still open, using two shared, reusable trigger functions
-- rather than one bespoke trigger per table, so the enforcement is
-- centralised and a future privileged column added to any of these tables
-- is protected by being ADDED TO THE ARGUMENT LIST of an existing trigger,
-- not by remembering to write a new one.
--
-- HOW TO APPLY: paste the whole file in one Supabase SQL Editor run. It is
-- idempotent (every CREATE/DROP is a REPLACE or IF EXISTS) and safe to
-- re-run. Read the whole file before running — Part 6 changes what
-- `employee_records`/`starter_instances`/`leaver_instances` allow non-HR
-- members to write (read access is unchanged).
-- ============================================================================


-- ============================================================================
-- PART 1 — Two shared, reusable trigger functions
-- ============================================================================
-- protect_immutable_columns(col1, col2, ...): the named columns can never
-- change via any client write, HR included, once the row exists. Only a
-- service-role connection (server-side code using SUPABASE_SERVICE_KEY,
-- which bypasses RLS but NOT triggers) or a raw migration can set them —
-- and both of those already only ever set them once, at INSERT. Use this
-- for identity/tenant-boundary columns where there is no legitimate
-- "change this later" workflow at all (org_id, created_by, user_id-as-FK).
--
-- protect_hr_or_immutable_columns(col1, col2, ...): the named columns can
-- only be changed by a caller whose org_members.role passes is_hr_role()
-- for the row's own org. Use this for columns that DO have a legitimate
-- "HR changes this later" workflow (confidential flag, owner reassignment,
-- org configuration).
--
-- Both are SECURITY DEFINER (so they can read org_members regardless of
-- the caller's own RLS visibility into it) but immediately narrow their
-- own privilege by checking auth.role() — a service-role connection
-- (server-side code) is let through unconditionally, since it has already
-- performed its own authorization check before making the write (see
-- api/_auth.js's requireOrgMembership/requireOrgRole) and re-deriving
-- "is this service-role caller HR" makes no sense for writes that are
-- legitimately system-initiated (e.g. the org-erasure endpoint, the
-- signature-status sync). A trigger cannot distinguish "the service key
-- because api/_auth.js already checked" from "the service key because
-- someone leaked it" — that check happens one layer up, in application
-- code, same as it always has.
-- ============================================================================

create or replace function public.protect_immutable_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  col text;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  foreach col in array TG_ARGV loop
    if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
      raise exception 'Column "%" on table "%" cannot be changed after the row is created', col, TG_TABLE_NAME
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.protect_immutable_columns() from anon, authenticated, public;

create or replace function public.protect_hr_or_immutable_columns()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  col text;
  caller_is_hr boolean;
  row_org_id uuid;
begin
  if auth.role() = 'service_role' then
    return new;
  end if;
  -- Most tables this runs on have a real org_id FK column — but
  -- `organisations` itself doesn't (a row IS the org; its own tenant
  -- identity is `id`, not a foreign key to itself). Falling back to `id`
  -- when `org_id` is absent (to_jsonb(...)->>'org_id' is simply NULL for
  -- a nonexistent key, not an error) means this one function works
  -- correctly on both shapes rather than needing a second copy just for
  -- organisations.
  row_org_id := coalesce(
    (to_jsonb(new) ->> 'org_id')::uuid, (to_jsonb(old) ->> 'org_id')::uuid,
    (to_jsonb(new) ->> 'id')::uuid, (to_jsonb(old) ->> 'id')::uuid
  );
  select public.is_hr_role(om.role) into caller_is_hr
  from public.org_members om
  where om.user_id = auth.uid() and om.org_id = row_org_id
  limit 1;
  if coalesce(caller_is_hr, false) then
    return new;
  end if;
  foreach col in array TG_ARGV loop
    if (to_jsonb(new) -> col) is distinct from (to_jsonb(old) -> col) then
      raise exception 'Column "%" on table "%" can only be changed by an HR role', col, TG_TABLE_NAME
        using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

revoke all on function public.protect_hr_or_immutable_columns() from anon, authenticated, public;


-- ============================================================================
-- PART 2 — org_members
-- ============================================================================
-- user_id is the binding between an auth.users identity and a role/org —
-- this is THE critical finding. It must never change after the row is
-- created (removing someone and re-inviting them creates a NEW row; it
-- never repoints an existing one). org_id likewise — moving a membership
-- between tenants is not a real product workflow (a dual-org user already
-- gets a second row via a second invite). access_level and is_hr are
-- privilege-shaped and were completely unprotected (is_hr is currently
-- unread anywhere in the app — protecting it now is cheap insurance
-- against a future reader trusting it). name/job_title are handled
-- separately below (self-or-HR, not immutable/HR-only) since a member
-- legitimately edits their own display name.
--
-- role and location_ids are already correctly protected by the existing
-- protect_org_member_privilege_columns_trigger (2026-08-04) — left as-is,
-- not duplicated here.

drop trigger if exists protect_org_members_identity_trigger on public.org_members;
create trigger protect_org_members_identity_trigger
  before update on public.org_members
  for each row execute function public.protect_immutable_columns('user_id', 'org_id');

drop trigger if exists protect_org_members_hr_columns_trigger on public.org_members;
create trigger protect_org_members_hr_columns_trigger
  before update on public.org_members
  for each row execute function public.protect_hr_or_immutable_columns('access_level', 'is_hr');

-- name/job_title/email_digest_opt_in: self-or-HR. The existing UPDATE
-- policy (org_members_update_same_org) only checks org membership, so any
-- member could previously rewrite ANY other member's display name (a real
-- impersonation-in-the-team-list and impersonation-in-the-audit-trail
-- risk, since audit_log.user_name — see Part 5 — now derives from this
-- column). This is a genuine policy change, not just a trigger addition:
-- self-or-HR needs to be expressed in the UPDATE policy's WITH CHECK,
-- since the trigger functions above are all-or-nothing per column, not
-- conditional on "unless it's your own row".
--
-- Deliberately uses a SECURITY DEFINER helper (my_role_in_org) rather than
-- an inline `SELECT role FROM org_members WHERE ...` subquery here, even
-- though this specific inline shape would likely resolve safely (it
-- terminates at org_members' own SELECT policy, which itself only calls
-- the already-non-recursive my_org_ids()) — this is the one place in this
-- migration where the subquery sits inside a policy defined ON
-- org_members itself, the exact shape fix_org_members_recursion_2026-07-23.sql
-- was written to eliminate. Not worth re-introducing that risk for a
-- column that isn't itself a privilege field, when the safe, already-
-- proven pattern (a SECURITY DEFINER function, same as my_org_ids()
-- itself) costs one extra function definition.
create or replace function public.my_role_in_org(p_org_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select role from public.org_members where user_id = auth.uid() and org_id = p_org_id limit 1;
$$;

revoke all on function public.my_role_in_org(uuid) from anon, public;
grant execute on function public.my_role_in_org(uuid) to authenticated, service_role;

drop policy if exists "org_members_update_same_org" on public.org_members;
create policy "org_members_update_same_org" on public.org_members
for update
using (org_id in (select my_org_ids()))
with check (
  org_id in (select my_org_ids())
  and (
    user_id = auth.uid()
    or public.is_hr_role(public.my_role_in_org(org_id))
  )
);
-- Note: this WITH CHECK re-adds an org_id membership check identical to
-- the existing USING clause — Postgres does not carry USING into WITH
-- CHECK when both are stated explicitly, unlike when WITH CHECK is
-- omitted, so this must be repeated for the tenant boundary to still
-- apply now that a second condition is being added alongside it.


-- ============================================================================
-- PART 3 — cases
-- ============================================================================
-- org_id and created_by are immutable — no legitimate workflow rewrites
-- either after the case exists (created_by is already bound at INSERT by
-- cases_insert_created_by_2026-08-21.sql; this closes the matching UPDATE
-- gap the sweep found). owner_id, employee_email, location_id and
-- confidential DO have legitimate later-changed workflows (reassigning a
-- case owner, correcting a bounced portal email, moving a case between
-- sites, HR marking something confidential) but must be HR-only —
-- employee_email in particular is the entire portal access boundary
-- (api/portal/_case-list.js matches on it), so any member being able to
-- repoint it onto a different real employee's email is a live IDOR into
-- another person's portal account.
--
-- investigation_paused is already protected by the existing
-- protect_case_hr_only_columns_trigger (2026-08-14) — left as-is.

drop trigger if exists protect_cases_identity_trigger on public.cases;
create trigger protect_cases_identity_trigger
  before update on public.cases
  for each row execute function public.protect_immutable_columns('org_id', 'created_by');

drop trigger if exists protect_cases_hr_columns_trigger on public.cases;
create trigger protect_cases_hr_columns_trigger
  before update on public.cases
  for each row execute function public.protect_hr_or_immutable_columns('owner_id', 'employee_email', 'location_id', 'confidential');


-- ============================================================================
-- PART 4 — organisations
-- ============================================================================
-- protect_billing_columns() already guards plan/stripe_*/sales_approved_at
-- (left as-is — do not touch, it is correctly HR/service-role-only via a
-- separate, already-working mechanism). This adds the columns the sweep
-- found still open to any member: invite_code (the entire org-joining
-- boundary — any member could silently rotate or leak it), the outbound
-- webhook config (redirect/DoS surface, contained but still HR's call),
-- automation_levels (which rules run unattended), data_retention_years,
-- created_by (a SELECT-grant input and a founding-member re-insert input —
-- see Part 2's reasoning for why this class of column goes immutable, not
-- just HR-gated: allowing HR to change it doesn't close the loop, since a
-- de-established HR user changing it to themselves is exactly the
-- founding-member escalation this guards against) and name.

drop trigger if exists protect_organisations_identity_trigger on public.organisations;
create trigger protect_organisations_identity_trigger
  before update on public.organisations
  for each row execute function public.protect_immutable_columns('created_by');

drop trigger if exists protect_organisations_config_columns_trigger on public.organisations;
create trigger protect_organisations_config_columns_trigger
  before update on public.organisations
  for each row execute function public.protect_hr_or_immutable_columns(
    'invite_code', 'notification_webhook_url', 'notification_webhook_type',
    'automation_levels', 'data_retention_years', 'name'
  );


-- ============================================================================
-- PART 5 — audit_log.user_name: server-derived, not client-trusted
-- ============================================================================
-- The append-only audit trail is the product's core defensibility
-- artefact, and user_id is already correctly bound to auth.uid() by the
-- existing INSERT policy — but user_name is free text the client supplies
-- directly (App.jsx sends currentUser?.name), so the actor NAME shown in
-- every audit surface (ActivityBell, AuditTrailSection, case Timeline) can
-- say something different from what user_id says. Rather than just
-- blocking it, this trigger REPLACES whatever the client sent with the
-- caller's own real name looked up from org_members — the honest fix,
-- since the column needs a value, not a rejection.
create or replace function public.stamp_audit_log_user_name()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new; -- server-initiated audit rows (cron, service endpoints) name their own actor deliberately
  end if;
  select coalesce(nullif(om.name, ''), 'Unknown') into new.user_name
  from public.org_members om
  where om.user_id = auth.uid() and om.org_id = new.org_id
  limit 1;
  if new.user_name is null then
    new.user_name := 'Unknown';
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_audit_log_user_name() from anon, authenticated, public;

drop trigger if exists stamp_audit_log_user_name_trigger on public.audit_log;
create trigger stamp_audit_log_user_name_trigger
  before insert on public.audit_log
  for each row execute function public.stamp_audit_log_user_name();


-- ============================================================================
-- PART 6 — employee_records / starter_instances / leaver_instances:
-- split into org-wide read, HR-only write
-- ============================================================================
-- These three carried a single FOR ALL policy scoped only to org
-- membership — the same shape locations/process_templates had until
-- 2026-08-21, just never revisited for these three, which hold
-- considerably more sensitive content (probation dates, exit-interview
-- notes, ill-health/medical-retirement reasons). Splitting to SELECT
-- (any member — this data is legitimately org-wide readable, e.g. a line
-- manager needs to see their own team's employee records) and
-- INSERT/UPDATE/DELETE (HR only) — matching the existing, working shape
-- of locations_process_templates_hr_write_2026-08-21.sql exactly.

drop policy if exists "Users can manage employee records in their org" on public.employee_records;
create policy "employee_records_select_same_org" on public.employee_records
for select using (org_id in (select my_org_ids()));
create policy "employee_records_write_hr_only" on public.employee_records
for insert with check (org_id in (select my_org_ids()) and public.is_hr_role((select role from public.org_members where user_id = auth.uid() and org_id = employee_records.org_id limit 1)));
create policy "employee_records_update_hr_only" on public.employee_records
for update using (org_id in (select my_org_ids()) and public.is_hr_role((select role from public.org_members where user_id = auth.uid() and org_id = employee_records.org_id limit 1)));
create policy "employee_records_delete_hr_only" on public.employee_records
for delete using (org_id in (select my_org_ids()) and public.is_hr_role((select role from public.org_members where user_id = auth.uid() and org_id = employee_records.org_id limit 1)));

drop policy if exists "Users can manage starter instances in their org" on public.starter_instances;
create policy "starter_instances_select_same_org" on public.starter_instances
for select using (org_id in (select my_org_ids()));
create policy "starter_instances_write_hr_only" on public.starter_instances
for insert with check (org_id in (select my_org_ids()) and public.is_hr_role((select role from public.org_members where user_id = auth.uid() and org_id = starter_instances.org_id limit 1)));
create policy "starter_instances_update_hr_only" on public.starter_instances
for update using (org_id in (select my_org_ids()) and public.is_hr_role((select role from public.org_members where user_id = auth.uid() and org_id = starter_instances.org_id limit 1)));
create policy "starter_instances_delete_hr_only" on public.starter_instances
for delete using (org_id in (select my_org_ids()) and public.is_hr_role((select role from public.org_members where user_id = auth.uid() and org_id = starter_instances.org_id limit 1)));

drop policy if exists "Users can manage leaver instances in their org" on public.leaver_instances;
create policy "leaver_instances_select_same_org" on public.leaver_instances
for select using (org_id in (select my_org_ids()));
create policy "leaver_instances_write_hr_only" on public.leaver_instances
for insert with check (org_id in (select my_org_ids()) and public.is_hr_role((select role from public.org_members where user_id = auth.uid() and org_id = leaver_instances.org_id limit 1)));
create policy "leaver_instances_update_hr_only" on public.leaver_instances
for update using (org_id in (select my_org_ids()) and public.is_hr_role((select role from public.org_members where user_id = auth.uid() and org_id = leaver_instances.org_id limit 1)));
create policy "leaver_instances_delete_hr_only" on public.leaver_instances
for delete using (org_id in (select my_org_ids()) and public.is_hr_role((select role from public.org_members where user_id = auth.uid() and org_id = leaver_instances.org_id limit 1)));

-- org_roles.access_level/title had the same "any member" gap on its own
-- FOR ALL policy. No live reader currently trusts this table for
-- authorization (org_members.access_level is what's actually read), so
-- this is config-integrity hardening rather than closing an active
-- escalation — same HR-write split, for consistency and because a future
-- feature is more likely to start trusting this table than to re-audit it.
drop policy if exists "org_roles_same_org" on public.org_roles;
create policy "org_roles_select_same_org" on public.org_roles
for select using (org_id in (select my_org_ids()));
create policy "org_roles_write_hr_only" on public.org_roles
for insert with check (org_id in (select my_org_ids()) and public.is_hr_role((select role from public.org_members where user_id = auth.uid() and org_id = org_roles.org_id limit 1)));
create policy "org_roles_update_hr_only" on public.org_roles
for update using (org_id in (select my_org_ids()) and public.is_hr_role((select role from public.org_members where user_id = auth.uid() and org_id = org_roles.org_id limit 1)));
create policy "org_roles_delete_hr_only" on public.org_roles
for delete using (org_id in (select my_org_ids()) and public.is_hr_role((select role from public.org_members where user_id = auth.uid() and org_id = org_roles.org_id limit 1)));


-- ============================================================================
-- PART 7 — case_access: constrain the grantee, and gate the powerful roles
-- ============================================================================
-- Two independent gaps, both CRITICAL:
--   (a) the INSERT policy validates the GRANTOR (via can_grant_case_access)
--       but never the GRANTEE — any authorized granter could hand case
--       access to a completely unrelated auth.users id, including an
--       outsider with no org_members row at all.
--   (b) because this table has no UPDATE policy (role changes go through
--       delete-then-reinsert by design — see App.jsx's assignCaseRole
--       comment), and can_grant_case_access() doesn't look at WHICH role
--       is being granted, an ordinary case_access holder (e.g. an
--       investigator) could delete their own row and reinsert it as
--       disciplinary_officer or approver — the exact separation-of-duties
--       ACAS requires an investigator and decision-maker to be different
--       people.
-- Both are closed in the INSERT policy's own WITH CHECK, which is the
-- single choke point every grant (initial or re-granted-after-delete)
-- already passes through.

-- Live verification (2026-08-25) found that folding checks (a) and (b)
-- into the INSERT policy's own WITH CHECK causes Postgres to throw
-- "infinite recursion detected in policy for relation case_access" —
-- confirmed via a real authenticated API call, not a theoretical concern.
-- can_grant_case_access() itself queries case_access (to check "is the
-- caller an existing participant"), and the added WITH CHECK complexity
-- changed how that gets planned/evaluated enough to trip Postgres's row-
-- security recursion guard, which the original (simpler) WITH CHECK
-- never hit. The policy itself stays exactly as it was before this
-- migration; both new checks move into a BEFORE INSERT trigger instead —
-- the same mechanism every other Family 1 protection already uses, and
-- one that isn't subject to policy-on-policy recursion detection.
drop policy if exists "Only HR or an existing case participant can grant case access" on public.case_access;
create policy "Only HR or an existing case participant can grant case access" on public.case_access
for insert
with check (
  org_id in (select my_org_ids())
  and public.can_grant_case_access(case_id, org_id)
);

create or replace function public.protect_case_access_grant()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() = 'service_role' then
    return new;
  end if;

  -- (a) the grantee must be a real member of the same org — closes the
  -- outsider-persistent-access gap the INSERT policy alone never checked.
  if not exists (
    select 1 from public.org_members om
    where om.org_id = new.org_id and om.user_id = new.user_id
  ) then
    raise exception 'Cannot grant case access to a user who is not a member of this organisation' using errcode = '42501';
  end if;

  -- (b) only HR, or the case's own creator/owner, may grant one of the
  -- decision-bearing roles — an existing case_access holder who is
  -- neither can still grant/re-grant the lighter-weight roles
  -- (investigator, notetaker) that can_grant_case_access() already
  -- covers, but cannot hand themselves or anyone else disciplinary_officer
  -- or approver via delete+reinsert.
  if new.role in ('disciplinary_officer', 'approver') then
    if not exists (
      select 1 from public.org_members om
      where om.org_id = new.org_id and om.user_id = auth.uid() and public.is_hr_role(om.role)
    ) and not exists (
      select 1 from public.cases c
      where c.id = new.case_id and (c.created_by = auth.uid() or c.owner_id = auth.uid())
    ) then
      raise exception 'Only HR or the case creator/owner can grant the disciplinary_officer or approver role' using errcode = '42501';
    end if;
  end if;

  return new;
end;
$$;

revoke all on function public.protect_case_access_grant() from anon, authenticated, public;

drop trigger if exists protect_case_access_grant_trigger on public.case_access;
create trigger protect_case_access_grant_trigger
  before insert on public.case_access
  for each row execute function public.protect_case_access_grant();

-- granted_by was unbound to auth.uid() (attribution-forgeable). Force it
-- server-side, same reasoning as audit_log.user_name in Part 5.
create or replace function public.stamp_case_access_granted_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    new.granted_by := auth.uid();
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_case_access_granted_by() from anon, authenticated, public;

drop trigger if exists stamp_case_access_granted_by_trigger on public.case_access;
create trigger stamp_case_access_granted_by_trigger
  before insert on public.case_access
  for each row execute function public.stamp_case_access_granted_by();


-- ============================================================================
-- PART 8 — hr_review_requests: pin the initial state at creation
-- ============================================================================
-- The UPDATE policy correctly restricts status/reviewed_by/reviewed_by_name
-- /reviewed_at changes to HR — but the INSERT policy never constrained
-- their INITIAL value, so any requester could insert a row that already
-- claims to be approved, with a forged reviewer name, and it would render
-- identically to a genuine HR sign-off everywhere the table is read
-- (ApprovalsPanel, HomeScreen's "awaiting approval" count, the case file).

-- Dropping by exact name is risky here specifically: this migration's
-- author could not directly confirm this policy's live name (only its
-- USING/WITH CHECK text) the way every other DROP POLICY in this file
-- was confirmed. Postgres OR-combines multiple PERMISSIVE policies for
-- the same command, so if the guessed name below doesn't match the real
-- one, `drop policy if exists` would silently no-op and the OLD,
-- unrestricted INSERT policy would stay active ALONGSIDE the new one —
-- making this fix a complete no-op rather than a strengthening. This
-- loop finds and drops every existing INSERT policy on this table by
-- its actual live name instead of a guessed one, so the fix cannot
-- silently fail to apply.
do $$
declare
  pol record;
begin
  for pol in
    select policyname from pg_policies
    where schemaname = 'public' and tablename = 'hr_review_requests' and cmd = 'INSERT'
  loop
    execute format('drop policy %I on public.hr_review_requests', pol.policyname);
  end loop;
end $$;

create policy "hr_review_requests_insert_same_org" on public.hr_review_requests
for insert
with check (
  org_id in (select my_org_ids())
  and requested_by = auth.uid()
  and status = 'pending'
  and reviewed_by is null
  and reviewed_by_name is null
  and reviewed_at is null
);

-- requested_by should also be immutable after creation (it was previously
-- freely rewritable by any HR user on UPDATE, since the UPDATE policy only
-- checked the caller's own role, not which columns they touched).
drop trigger if exists protect_hr_review_requests_identity_trigger on public.hr_review_requests;
create trigger protect_hr_review_requests_identity_trigger
  before update on public.hr_review_requests
  for each row execute function public.protect_immutable_columns('requested_by', 'org_id', 'case_id');


-- ============================================================================
-- PART 9 — allegations / case_signals / case_themes / case_tasks:
-- org_id must always match the parent case, and cannot be client-set
-- ============================================================================
-- All four tables' RLS policies gate on "can the caller reach the parent
-- case" via a case_id join, but never constrain the CHILD row's own
-- org_id — so a caller with access to a case in Org A could insert or
-- update a row with org_id pointing at Org B, and every client-side load
-- (which filters by org_id) would show it inside the wrong tenant. Rather
-- than just validating this, the trigger below FORCES org_id to the real
-- parent case's org_id on every insert/update, so the column becomes
-- impossible to desynchronise rather than merely checked.

create or replace function public.sync_case_child_org_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  select org_id into new.org_id from public.cases where id = new.case_id;
  if new.org_id is null then
    raise exception 'case_id does not reference a real case' using errcode = '23503';
  end if;
  return new;
end;
$$;

revoke all on function public.sync_case_child_org_id() from anon, authenticated, public;

drop trigger if exists sync_allegations_org_id_trigger on public.allegations;
create trigger sync_allegations_org_id_trigger
  before insert or update on public.allegations
  for each row execute function public.sync_case_child_org_id();

drop trigger if exists sync_case_signals_org_id_trigger on public.case_signals;
create trigger sync_case_signals_org_id_trigger
  before insert or update on public.case_signals
  for each row execute function public.sync_case_child_org_id();

drop trigger if exists sync_case_themes_org_id_trigger on public.case_themes;
create trigger sync_case_themes_org_id_trigger
  before insert or update on public.case_themes
  for each row execute function public.sync_case_child_org_id();

-- Note: case_tasks.case_id is nullable (org-level insight-driven tasks,
-- added by improvement_initiatives work), unlike the three tables above —
-- a generic sync-from-case trigger would wrongly reject every org-level
-- task (case_id null -> no parent to derive org_id from). This variant
-- passes org-level tasks through untouched (their org_id stays whatever
-- the client legitimately supplied) and only forces org_id when a real
-- case_id is present.
create or replace function public.sync_case_tasks_org_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.case_id is null then
    return new; -- org-level task (insight_ref-driven) — org_id is legitimately client-supplied
  end if;
  select org_id into new.org_id from public.cases where id = new.case_id;
  if new.org_id is null then
    raise exception 'case_id does not reference a real case' using errcode = '23503';
  end if;
  return new;
end;
$$;
revoke all on function public.sync_case_tasks_org_id() from anon, authenticated, public;
create trigger sync_case_tasks_org_id_trigger
  before insert or update on public.case_tasks
  for each row execute function public.sync_case_tasks_org_id();

-- allegations' own decision fields — status, decided_by, appeal_outcome,
-- appeal_decided_by, decision_reasoning, appeal_reasoning — were writable
-- by anyone with case access (any case_access holder, not just HR or the
-- case's designated decision-maker), destroying the accountability trail
-- decision_workspace_2026-08-12.sql exists to create. HR-gate them; the
-- case's own designated disciplinary_officer/appeal_manager case_access
-- role is deliberately NOT special-cased here (unlike case_access's role
-- gate in Part 7) because that would need a second, more complex EXISTS
-- lookup per allegation update and the app's own UI already funnels
-- decision-recording through the same small set of screens regardless of
-- who's designated — flagged as a reasonable simplification, not a
-- structural requirement; revisit if a real workflow needs a non-HR
-- decision-maker to record their own decision without an HR intermediary.
drop trigger if exists protect_allegations_decision_columns_trigger on public.allegations;
create trigger protect_allegations_decision_columns_trigger
  before update on public.allegations
  for each row execute function public.protect_hr_or_immutable_columns(
    'status', 'decided_by', 'appeal_outcome', 'appeal_decided_by', 'decision_reasoning', 'appeal_reasoning'
  );

-- created_by on allegations/case_signals/case_tasks was unbound to
-- auth.uid() — force it server-side on insert (same pattern as Parts 5/7).
create or replace function public.stamp_created_by()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.role() <> 'service_role' then
    new.created_by := auth.uid();
  end if;
  return new;
end;
$$;

revoke all on function public.stamp_created_by() from anon, authenticated, public;

drop trigger if exists stamp_allegations_created_by_trigger on public.allegations;
create trigger stamp_allegations_created_by_trigger
  before insert on public.allegations
  for each row execute function public.stamp_created_by();

drop trigger if exists stamp_case_signals_created_by_trigger on public.case_signals;
create trigger stamp_case_signals_created_by_trigger
  before insert on public.case_signals
  for each row execute function public.stamp_created_by();

drop trigger if exists stamp_case_tasks_created_by_trigger on public.case_tasks;
create trigger stamp_case_tasks_created_by_trigger
  before insert on public.case_tasks
  for each row execute function public.stamp_created_by();


-- ============================================================================
-- PART 10 — check_rate_limit(): re-close the anon/authenticated grant
-- ============================================================================
-- rate_limit_2026-07-25.sql already issued this exact revoke; live
-- inspection during the Prompt 12 audit found anon and authenticated BOTH
-- still hold EXECUTE — the most likely cause is a later CREATE OR REPLACE
-- of the function (baseline_schema_2026-08-06.sql re-declares it) silently
-- resetting to Postgres's default PUBLIC-executable grant on functions,
-- since a REPLACE does not preserve previously-revoked grants unless they
-- are re-issued after. Re-issuing here, explicitly including PUBLIC this
-- time (the original migration revoked only the two named roles).
revoke execute on function public.check_rate_limit(text, integer, integer) from public, anon, authenticated;
grant execute on function public.check_rate_limit(text, integer, integer) to service_role;

-- org_has_members() had the same live drift (anon/authenticated still
-- executable despite an original revoke) — low-value on its own (an
-- org-existence oracle over unguessable UUIDs) but the same class of
-- silent regression, closed in the same pass.
revoke execute on function public.org_has_members(uuid) from public, anon;
grant execute on function public.org_has_members(uuid) to authenticated, service_role;
