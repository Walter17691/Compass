-- ════════════════════════════════════════════════════════════════════════════
-- B3 PHASE A3a — THE REPORTING REGIME FOUNDATION
-- Candidate migration. NOT APPLIED.
--
-- One new table, one new column, four functions, two triggers. No behaviour
-- changes for anybody: no organisation is activated here, so every one of the
-- 2963 existing cases keeps report_regime NULL and every rule short-circuits.
--
-- ── WHY ACTIVATION LIVES IN ITS OWN TABLE ───────────────────────────────────
--
-- The obvious design — a column on organisations, protected by a trigger —
-- was built, probed and REJECTED. Two defects killed it, both found by
-- running it rather than reading it:
--
--   1. UNREACHABLE. organisations_update_member grants UPDATE only where
--      `id IN (select my_org_ids())`. A genuine Compass operator is NOT a
--      member of the customer's organisation, so their UPDATE matched ZERO
--      ROWS, no trigger fired, nothing was audited — and a zero-row UPDATE
--      reports success, so it looked like it had worked.
--
--   2. FORGEABLE. The fix for (1) was a SECURITY DEFINER RPC, which made the
--      RPC and the trigger both audit the same activation. The proposed
--      remedy was a transaction-local marker (compass.activating_org) that
--      the RPC sets and the trigger checks. That was tested adversarially
--      and it FAILED: set_config on a custom GUC requires no privilege
--      whatsoever, so an HR Director set the marker themselves and their
--      direct UPDATE landed a forged activation on a real organisation.
--      A GUC is session state. It is evidence of nothing.
--
-- So activation is not a column anyone can write. It is a row in a table
-- that anon and authenticated have NO INSERT, UPDATE or DELETE privilege on
-- at all. Table privileges are checked before RLS and before any trigger,
-- and nothing a caller can put in their session changes them. The same
-- forged attempt that defeated the marker is refused here with 42501
-- permission denied, before a single line of our code runs.
--
-- That also removes the duplicate audit at the root rather than papering
-- over it: with no trigger on the activation write, there is exactly one
-- writer, so there is exactly one audit event. organisations is left
-- entirely untouched — no new column, no new trigger.
--
-- ── WHY NULL MEANS LEGACY, AND 'legacy' IS NOT A STORABLE VALUE ─────────────
--
-- cases.report_regime permits only NULL or 'versioned'. Absence IS the
-- historical regime, so grandfathering 2963 cases costs ZERO writes — no
-- backfill, no rewritten histories, no fabricated report activity.
--
-- ── WHY THE REGIME CANNOT BE CLIENT-SUPPLIED ────────────────────────────────
--
-- `authenticated` holds table-level INSERT and UPDATE on public.cases with NO
-- column restrictions, so a client can put any value in report_regime. The
-- BEFORE INSERT trigger therefore does not validate the supplied value — it
-- OVERWRITES it unconditionally from the organisation's activation state.
-- The UPDATE guard refuses every change in both directions: requirement 5
-- only asks that versioned cannot revert, but refusing both also stops a
-- client promoting itself to dodge the legacy route, and costs nothing
-- because the sanctioned promotion path is A3e and does not exist yet.
--
-- ── WHY A SERVICE ROLE CANNOT ACTIVATE ──────────────────────────────────────
--
-- Activation must be auditable and must fail atomically if the audit cannot
-- be written. audit_log.user_id is NOT NULL, and a bare service_role
-- connection has no auth.uid() — so it could not produce a valid audit row.
-- Rather than leave that as a latent surprise, activation is defined as
-- something only a signed-in platform admin can do. There is deliberately NO
-- break-glass service_role path; see the recovery design in the wave report.
--
-- ── WHAT THIS DOES NOT TOUCH ────────────────────────────────────────────────
--
-- protect_adopted_investigation_report (A1, md5 85ba380f71d56ecf66daa2441d97
-- dbdf) and its trigger, the adoption RPC, the save RPC, the HR review
-- integrity guard, public.organisations, every policy on every existing
-- table, every existing grant, and every existing row.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── DRIFT GUARD ───────────────────────────────────────────────────────────
do $guard$
declare
  v_a1 text; v_adopt text; v_save text; v_pa_policies int; v_pa_rls boolean;
begin
  select md5(prosrc) into v_a1 from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'protect_adopted_investigation_report';
  select md5(prosrc) into v_adopt from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'adopt_investigation_report_version';
  select md5(prosrc) into v_save from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname = 'save_investigation_report_version';

  if v_a1 is distinct from '85ba380f71d56ecf66daa2441d97dbdf' then
    raise exception 'DRIFT: A1 protect_adopted_investigation_report has changed (found %). A3a must not be applied on top of a modified A1.', coalesce(v_a1, 'MISSING');
  end if;
  if v_adopt is distinct from 'fb45b6388323936ce8e405614ecc2882' then
    raise exception 'DRIFT: adopt_investigation_report_version has changed (found %)', coalesce(v_adopt, 'MISSING'); end if;
  if v_save is distinct from 'fb626a16d73a3470f48f02510a2df730' then
    raise exception 'DRIFT: save_investigation_report_version has changed (found %)', coalesce(v_save, 'MISSING'); end if;

  -- is_platform_admin() is only safe to define while platform_admins remains
  -- deny-all. If a permissive policy has appeared, the full INSERT grant held
  -- by `authenticated` becomes live and self-promotion to operator is
  -- possible — in which case this migration must not proceed.
  select relrowsecurity into v_pa_rls from pg_class where oid = 'public.platform_admins'::regclass;
  select count(*) into v_pa_policies from pg_policy where polrelid = 'public.platform_admins'::regclass;
  if v_pa_rls is not true or v_pa_policies <> 0 then
    raise exception 'DRIFT: platform_admins is no longer deny-all (rls=%, policies=%). Its authority model is a precondition of operator activation.', v_pa_rls, v_pa_policies;
  end if;
end;
$guard$;

-- ── 1. ACTIVATION STATE, WHERE NO CLIENT CAN WRITE IT ─────────────────────
create table if not exists public.organisation_report_settings (
  org_id uuid primary key references public.organisations(id) on delete cascade,
  versioned_authoring_enabled_at timestamptz not null,
  activated_by uuid not null references auth.users(id),
  activated_at timestamptz not null default now()
);

comment on table public.organisation_report_settings is
  'Which organisations author investigation reports as immutable versions, and who switched that on. One row per activated organisation; no row means not activated. anon and authenticated hold NO write privilege here — activation is possible only through activate_versioned_report_authoring(), which is SECURITY DEFINER. This is the database''s source of truth for activation; the client allow-list is a secondary rollout brake that can only be more restrictive.';

-- Supabase's default privileges would hand anon and authenticated full CRUD
-- on a new table. Everything is taken back, then SELECT alone is returned —
-- the client must be able to see whether its own organisation is activated.
revoke all on public.organisation_report_settings from public;
revoke all on public.organisation_report_settings from anon;
revoke all on public.organisation_report_settings from authenticated;
grant select on public.organisation_report_settings to authenticated;

alter table public.organisation_report_settings enable row level security;

drop policy if exists organisation_report_settings_select_member on public.organisation_report_settings;
create policy organisation_report_settings_select_member
  on public.organisation_report_settings
  for select
  using (org_id in (select my_org_ids()));

-- ── 2. THE CASE'S DURABLE REGIME ──────────────────────────────────────────
alter table public.cases
  add column if not exists report_regime text;

alter table public.cases
  drop constraint if exists cases_report_regime_valid;
alter table public.cases
  add constraint cases_report_regime_valid
  check (report_regime is null or report_regime = 'versioned');

comment on column public.cases.report_regime is
  'NULL = historical legacy authoring (the default, and true of every case created before activation). ''versioned'' = this case authors its report as immutable versions. Stamped by the database at INSERT from the organisation''s activation state, never from the client, and immutable thereafter.';

-- ── 3. OPERATOR AUTHORITY ─────────────────────────────────────────────────
create or replace function public.is_platform_admin()
returns boolean
language sql
stable
security definer
set search_path to 'public'
as $function$
  select exists (
    select 1 from public.platform_admins pa
     where pa.user_id = auth.uid()
       and pa.revoked_at is null
  );
$function$;

comment on function public.is_platform_admin() is
  'True when the caller is a signed-in, non-revoked Compass operator. SECURITY DEFINER because platform_admins is deliberately deny-all under RLS. Returns false for service_role and for any unauthenticated caller, because auth.uid() is null for both.';

revoke all on function public.is_platform_admin() from public;
revoke all on function public.is_platform_admin() from anon;
grant execute on function public.is_platform_admin() to authenticated;

-- ── 4. THE ONLY WAY TO ACTIVATE ───────────────────────────────────────────
create or replace function public.activate_versioned_report_authoring(p_org_id uuid)
returns timestamptz
language plpgsql
security definer
set search_path to 'public'
as $function$
declare
  v_actor uuid := auth.uid();
  v_org public.organisations;
  v_name text;
  v_now timestamptz;
  v_rows integer;
begin
  -- The caller is the signed-in operator, never a claim they pass in.
  -- auth.uid() is null for service_role and for anonymous callers, so both
  -- fail here without needing a separate branch.
  if v_actor is null then
    raise exception
      'Activating versioned report authoring requires a signed-in Compass operator. An automated or service-role process cannot activate an organisation, because the activation could not then be attributed to anyone.'
      using errcode = '42501';
  end if;
  if not public.is_platform_admin() then
    raise exception 'Only a Compass operator can activate versioned report authoring.'
      using errcode = '42501';
  end if;

  -- Lock the organisation, then decide. Two operators pressing at once
  -- serialise here, and the second sees the first's committed state rather
  -- than the state it read before waiting.
  select * into v_org from public.organisations where id = p_org_id for update;
  if v_org.id is null then
    raise exception 'That organisation does not exist' using errcode = '23503';
  end if;

  if exists (select 1 from public.organisation_report_settings where org_id = p_org_id) then
    raise exception
      'This organisation was already activated for versioned report authoring on %.',
      (select versioned_authoring_enabled_at from public.organisation_report_settings where org_id = p_org_id)
      using errcode = 'check_violation';
  end if;

  -- Server-generated. The signature takes one organisation id and nothing
  -- else: no client-supplied timestamp, actor or organisation fields.
  v_now := now();

  insert into public.organisation_report_settings (org_id, versioned_authoring_enabled_at, activated_by)
  values (p_org_id, v_now, v_actor);
  get diagnostics v_rows = row_count;

  -- Exactly one, or nothing happened. A zero-row write is a FAILURE, not a
  -- quiet success — the mistake that made the first draft of this file look
  -- like it worked when it had done nothing at all.
  if v_rows <> 1 then
    raise exception
      'Activation did not apply to exactly one organisation (% rows affected). Nothing has been changed.',
      v_rows using errcode = 'check_violation';
  end if;

  -- Same transaction as the write, so an audit failure takes the activation
  -- with it. audit_log.user_id is NOT NULL, which is the structural reason a
  -- service-role caller is refused above rather than silently producing an
  -- unattributable record.
  select name into v_name from public.org_members
   where org_id = p_org_id and user_id = v_actor;

  insert into public.audit_log (org_id, user_id, user_name, action, detail)
  values (
    p_org_id, v_actor, coalesce(v_name, 'Compass operator'),
    'Versioned report authoring activated',
    'Previous state: not activated. New state: activated at '
      || to_char(v_now at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS"Z"')
      || '. Investigation reports in this organisation are now authored as immutable versions. '
      || 'Cases created from this point are stamped versioned; existing cases remain on the legacy '
      || 'route until explicitly transitioned.');

  return v_now;
end;
$function$;

comment on function public.activate_versioned_report_authoring(uuid) is
  'The only way to activate versioned report authoring. SECURITY DEFINER so a Compass operator — deliberately not a member of the customer organisation — can write a table no client holds any write privilege on. Requires a signed-in, non-revoked platform admin; locks the organisation; refuses re-activation; generates its own timestamp; and writes the audit event in the same transaction, so an audit failure rolls the activation back.';

revoke all on function public.activate_versioned_report_authoring(uuid) from public;
revoke all on function public.activate_versioned_report_authoring(uuid) from anon;
grant execute on function public.activate_versioned_report_authoring(uuid) to authenticated;

-- ── 5. NEW CASES ARE STAMPED BY THE DATABASE ──────────────────────────────
create or replace function public.stamp_case_report_regime()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  -- Unconditional overwrite. The caller's value is not validated, not merged
  -- and not consulted: `authenticated` can set any column on insert, so the
  -- only safe treatment of a client-supplied regime is to discard it.
  new.report_regime := case
    when exists (select 1 from public.organisation_report_settings s where s.org_id = new.org_id)
      then 'versioned'
    else null
  end;
  return new;
end;
$function$;

comment on function public.stamp_case_report_regime() is
  'Sets cases.report_regime at INSERT from the organisation''s activation state, discarding any client-supplied value. SECURITY DEFINER so it can read the settings table regardless of the inserting user''s visibility.';

revoke all on function public.stamp_case_report_regime() from public;
revoke all on function public.stamp_case_report_regime() from anon;
revoke all on function public.stamp_case_report_regime() from authenticated;

-- Fires LAST of the BEFORE INSERT triggers on cases (they run alphabetically,
-- and the existing four end at protect_case_outcome_on_insert_trigger), so
-- nothing downstream can re-dirty the value after it is set.
drop trigger if exists protect_zz_stamp_report_regime_trg on public.cases;
create trigger protect_zz_stamp_report_regime_trg
  before insert on public.cases
  for each row
  execute function public.stamp_case_report_regime();

-- ── 6. THE REGIME IS IMMUTABLE ────────────────────────────────────────────
create or replace function public.protect_case_report_regime()
returns trigger
language plpgsql
security definer
set search_path to 'public'
as $function$
begin
  if new.report_regime is not distinct from old.report_regime then
    return new;
  end if;

  if old.report_regime = 'versioned' then
    raise exception
      'This case authors its investigation report as immutable versions. It cannot be returned to the legacy report route.'
      using errcode = 'check_violation';
  end if;

  -- NULL -> 'versioned' is a real transition, but it is not a plain UPDATE.
  -- It belongs to begin_versioned_report_authoring (A3e), which does not
  -- exist yet; until it does there is no sanctioned promotion path, and a
  -- client attempting one is attempting to choose its own regime.
  raise exception
    'A case cannot be moved into versioned report authoring by updating it directly. Use the controlled transition, which records who authorised it and why.'
    using errcode = '42501';
end;
$function$;

revoke all on function public.protect_case_report_regime() from public;
revoke all on function public.protect_case_report_regime() from anon;
revoke all on function public.protect_case_report_regime() from authenticated;

drop trigger if exists protect_zz_case_report_regime_trg on public.cases;
create trigger protect_zz_case_report_regime_trg
  before update on public.cases
  for each row
  when (new.report_regime is distinct from old.report_regime)
  execute function public.protect_case_report_regime();

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- A3e BOUNDARY — WHY begin_versioned_report_authoring IS NOT IN THIS FILE
--
-- It was designed alongside this foundation and is deliberately excluded,
-- because it depends on rules A3a does not define:
--
--   * which HR Review states block a transition (returned /
--     clarification_requested / taken_over / approved / progressed / closed
--     do NOT mean the same thing) is settled in A3f;
--   * stage validity should reuse adoption_stage_block_reason rather than
--     invent a second vocabulary, and that coupling is A3e's to make;
--   * it must be permitted to change report_regime, which §6 above refuses
--     outright. A3e will need its own sanctioned path — and note that a
--     transaction-local GUC marker is NOT available as that mechanism: it was
--     tested here and an ordinary HR Director forged it successfully. The
--     privilege model used for activation above is the pattern to follow.
--
-- ROLLBACK
--
--   drop trigger if exists protect_zz_case_report_regime_trg on public.cases;
--   drop trigger if exists protect_zz_stamp_report_regime_trg on public.cases;
--   drop function if exists public.protect_case_report_regime();
--   drop function if exists public.stamp_case_report_regime();
--   drop function if exists public.activate_versioned_report_authoring(uuid);
--   drop function if exists public.is_platform_admin();
--   alter table public.cases drop constraint if exists cases_report_regime_valid;
--   alter table public.cases drop column if exists report_regime;
--   drop table if exists public.organisation_report_settings;
--
-- Clean while no organisation is activated and no case is stamped, which is
-- the state this migration leaves production in. Once an organisation is
-- activated, dropping the table discards the record of when that happened —
-- the audit row survives, the state does not.
-- ════════════════════════════════════════════════════════════════════════════
