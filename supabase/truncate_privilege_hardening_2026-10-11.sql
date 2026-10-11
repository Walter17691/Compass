-- ════════════════════════════════════════════════════════════════════════════
-- TRUNCATE PRIVILEGE HARDENING — public schema
-- Candidate migration. NOT APPLIED.
--
-- ── THE DEFECT ──────────────────────────────────────────────────────────────
--
-- `anon` and `authenticated` hold TRUNCATE on 46 of the 47 base tables in
-- public, including audit_log, cases, org_members, case_access,
-- hr_review_requests, investigation_report_versions and platform_admins.
--
-- PostgreSQL does not apply row-level security to TRUNCATE. It is authorised
-- by the table privilege alone. Policies, BEFORE triggers and even a
-- RESTRICTIVE `using (false) with check (false)` policy are all bypassed, so
-- every integrity guarantee in this schema that rests on RLS or on a trigger
-- -- A1, A3a, A3b, the audit append-only guard, the report version
-- immutability guard -- can be erased wholesale by an unauthenticated caller
-- holding only the project's publishable anon key.
--
-- This was demonstrated on this server rather than reasoned about. A synthetic
-- table carrying a deny-all policy was created, three rows inserted, and the
-- `authenticated` role was made to read and then truncate it:
--
--     SELECT under the deny-all policy    -> 0 rows visible   (policy in force)
--     TRUNCATE under the deny-all policy  -> SUCCEEDED, 3 rows -> 0
--
-- The first line is the control: it proves the policy really was active, so
-- the second line is not a case of RLS being switched off.
--
-- ── WHY THE GRANT EXISTS ────────────────────────────────────────────────────
--
-- It was never granted deliberately. The Supabase default ACL for new tables
-- in public is `arwdDxtm` for anon, authenticated and service_role, and `D` is
-- TRUNCATE. Every table inherits it at creation. The single exception in this
-- schema is organisation_report_settings (A3a), which revoked explicitly --
-- which is why that table reads `authenticated=r` and nothing more.
--
-- Measured: all 46 TRUNCATE grants to anon in public were made by `postgres`,
-- so they are revocable here. There are NO grants to PUBLIC on any table in
-- this schema (0 PUBLIC ACL entries across all 47), and neither anon nor
-- authenticated is a member of any role, so there is no inherited privilege
-- path to unwind -- effective privilege equals the direct grant.
--
-- ── WHAT THIS CHANGES, AND WHAT IT DELIBERATELY DOES NOT ────────────────────
--
-- Removes exactly one privilege bit, `D`, from exactly two roles:
--
--     anon=arwdDxtm  ->  anon=arwdxtm
--     authenticated=arwdDxtm  ->  authenticated=arwdxtm
--
-- SELECT, INSERT, UPDATE, DELETE, REFERENCES, TRIGGER and MAINTAIN are left
-- exactly as they are, on every table, for every role. The post-condition
-- block below asserts that per privilege against a baseline captured inside
-- this same transaction, so a wider revoke than intended aborts the migration
-- rather than being discovered later.
--
-- service_role keeps TRUNCATE on all 47 tables, so administrative and
-- maintenance operations are unaffected. postgres is the owner throughout.
--
-- No RLS policy, no SECURITY DEFINER function, no trigger, no column, no
-- table, no row and no application code is touched. DELETE is retained
-- precisely because it IS constrained by RLS; TRUNCATE is the only one of the
-- write privileges that is not.
--
-- Verified before writing this: nothing depends on the privilege being there.
-- No function in public references TRUNCATE (0 of 90), there are no TRUNCATE
-- triggers in the schema, and the application contains no SQL TRUNCATE at all
-- -- every match for the word across src/, api/ and scripts/ is either text
-- truncation or a test that forbids TRUNCATE in migration SQL.
--
-- ── OUT OF REACH FROM HERE, REPORTED NOT SILENTLY SKIPPED ───────────────────
--
-- 1. storage.buckets, storage.buckets_analytics and storage.objects also grant
--    TRUNCATE to anon and authenticated. storage.objects holds the metadata
--    for evidence attachments. Those grants were made by
--    supabase_storage_admin, not postgres, and this was tested: issuing the
--    revoke as postgres reports "statement completed" but leaves the ACL
--    byte-identical and `has_table_privilege('anon','storage.objects',
--    'TRUNCATE')` still true. A revoke by a non-grantor is a silent no-op.
--    It therefore CANNOT be fixed from a migration run as postgres and needs
--    to be raised with Supabase. It is not attempted below, because a
--    statement that appears to work and does nothing is worse than its
--    absence.
--
-- 2. There are TWO default-ACL entries for tables in public -- one granted by
--    `postgres`, one by `supabase_admin`. This migration fixes the postgres
--    entry, which is the one that applies to tables created by migrations.
--    postgres is not a member of supabase_admin, so the second entry cannot be
--    altered here; a table created by supabase_admin would still inherit
--    TRUNCATE. Same escalation path as (1).
--
-- 3. MAINTAIN (`m`) is also held by anon and authenticated on 46 tables. It
--    permits VACUUM / ANALYZE / REINDEX / CLUSTER. It does not destroy data,
--    so it is outside this narrow migration, but it is a resource-exhaustion
--    surface and should be reviewed separately.
-- ════════════════════════════════════════════════════════════════════════════

begin;

-- ── BASELINE + IDENTITY GUARD ─────────────────────────────────────────────
-- Captures the effective privilege matrix BEFORE any change, and refuses to
-- run at all unless this is the production database in the posture that was
-- audited. The three identity markers are the same ones used by A3a and A3b
-- and none of them exist in the separate compass-e2e-test project.

create temp table _trunc_baseline (
  grantee text,
  privilege text,
  table_count int
) on commit drop;

insert into _trunc_baseline (grantee, privilege, table_count)
select g.grantee, p.privilege, count(*) filter (where has_table_privilege(g.grantee, t.oid, p.privilege))
  from (values ('anon'), ('authenticated'), ('service_role'), ('postgres')) as g(grantee)
 cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                    ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) as p(privilege)
 cross join (select c.oid from pg_class c
               join pg_namespace n on n.oid = c.relnamespace
              where n.nspname = 'public' and c.relkind in ('r', 'p')) as t
 group by g.grantee, p.privilege;

do $guard$
declare
  v_tables int;
  v_cases int;
  v_admins int;
  v_expected text[] := array[
    'anon/SELECT/46', 'anon/INSERT/45', 'anon/UPDATE/46', 'anon/DELETE/46',
    'anon/TRUNCATE/46', 'anon/REFERENCES/46', 'anon/TRIGGER/46', 'anon/MAINTAIN/46',
    'authenticated/SELECT/47', 'authenticated/INSERT/45', 'authenticated/UPDATE/46',
    'authenticated/DELETE/46', 'authenticated/TRUNCATE/46', 'authenticated/REFERENCES/46',
    'authenticated/TRIGGER/46', 'authenticated/MAINTAIN/46',
    'service_role/SELECT/47', 'service_role/INSERT/47', 'service_role/UPDATE/47',
    'service_role/DELETE/47', 'service_role/TRUNCATE/47', 'service_role/REFERENCES/47',
    'service_role/TRIGGER/47', 'service_role/MAINTAIN/47'
  ];
  v_actual text[];
  v_diff text;
begin
  -- Target identity.
  if not exists (select 1 from public.organisations
                  where id = 'dbe871c5-e6fe-45d8-8bc4-201e487579be') then
    raise exception 'WRONG TARGET: Compass LTD is absent. This migration is for the production project npeegfsoijhdnnvuqjin only.';
  end if;

  select count(*) into v_admins from public.platform_admins;
  if v_admins <> 1 then
    raise exception 'WRONG TARGET or drift: expected exactly 1 platform_admins row, found %.', v_admins;
  end if;

  select count(*) into v_cases from public.cases;
  if v_cases <> 2963 then
    raise exception 'DRIFT: expected 2963 cases, found %. Re-audit the privilege matrix before applying.', v_cases;
  end if;

  select count(*) into v_tables from pg_class c
    join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relkind in ('r', 'p');
  if v_tables <> 47 then
    raise exception 'DRIFT: expected 47 base tables in public, found %. The audited privilege matrix no longer describes this schema.', v_tables;
  end if;

  -- The audited matrix, asserted exactly. If any cell has moved since the
  -- audit, the "preserve everything except TRUNCATE" claim below is no longer
  -- backed by evidence, so refuse.
  select array_agg(grantee || '/' || privilege || '/' || table_count order by grantee, privilege)
    into v_actual
    from _trunc_baseline
   where grantee <> 'postgres';

  if not (v_actual @> v_expected and v_expected @> v_actual) then
    select string_agg(x, ', ') into v_diff
      from (select unnest(v_actual) except select unnest(v_expected)) s(x);
    raise exception 'DRIFT in the privilege matrix. Unexpected cells: %. Expected set: %.',
      coalesce(v_diff, '(none)'), array_to_string(v_expected, ', ');
  end if;

  -- No PUBLIC grants anywhere, so there is no third grantee to revoke from.
  if exists (
    select 1 from pg_class c
      join pg_namespace n on n.oid = c.relnamespace
     cross join lateral aclexplode(c.relacl) a
     where n.nspname = 'public' and c.relkind in ('r', 'p') and a.grantee = 0
  ) then
    raise exception 'DRIFT: a grant to PUBLIC now exists on a table in public. Re-audit before applying -- the revoke below does not cover PUBLIC.';
  end if;
end;
$guard$;

-- ── THE REVOKE ────────────────────────────────────────────────────────────
-- One privilege, two roles, every table in the schema. Idempotent: on the one
-- table that already lacks it (organisation_report_settings) this is a no-op.
-- Covering all 47 rather than the 46 that currently hold it also means the
-- statement stays correct if a table is added before this is applied.

revoke truncate on all tables in schema public from anon;
revoke truncate on all tables in schema public from authenticated;

-- Defensive: PUBLIC holds nothing today (asserted above), and this keeps the
-- statement correct if that ever changes.
revoke truncate on all tables in schema public from public;

-- ── FUTURE TABLES ─────────────────────────────────────────────────────────
-- Without this, the next `create table` in public re-grants TRUNCATE to both
-- roles from the default ACL and silently re-opens the hole. Scoped to the
-- `postgres` grantor entry, which is the one that applies to tables created by
-- migrations. The supabase_admin entry cannot be altered from here -- see note
-- (2) in the header.

alter default privileges for role postgres in schema public
  revoke truncate on tables from anon;
alter default privileges for role postgres in schema public
  revoke truncate on tables from authenticated;

-- ── POST-CONDITIONS ──────────────────────────────────────────────────────
-- Everything asserted against the baseline captured above, in the same
-- transaction, so a failure rolls the whole thing back.

do $verify$
declare
  v_anon int;
  v_auth int;
  v_svc int;
  v_regressions text;
  v_defacl text;
begin
  -- 1. The hole is closed.
  select count(*) filter (where has_table_privilege('anon', t.oid, 'TRUNCATE')),
         count(*) filter (where has_table_privilege('authenticated', t.oid, 'TRUNCATE')),
         count(*) filter (where has_table_privilege('service_role', t.oid, 'TRUNCATE'))
    into v_anon, v_auth, v_svc
    from (select c.oid from pg_class c
            join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relkind in ('r', 'p')) t;

  if v_anon <> 0 then
    raise exception 'FAILED: anon still holds TRUNCATE on % table(s).', v_anon;
  end if;
  if v_auth <> 0 then
    raise exception 'FAILED: authenticated still holds TRUNCATE on % table(s).', v_auth;
  end if;

  -- 2. Administrative access is intact. This is the half of the change that
  --    would be easy to break silently and hard to notice.
  if v_svc <> 47 then
    raise exception 'FAILED: service_role should retain TRUNCATE on all 47 tables, has % -- administrative operations would be degraded.', v_svc;
  end if;

  -- 3. NOTHING ELSE MOVED. Every other cell of the matrix, per role and per
  --    privilege, compared against the pre-revoke capture.
  select string_agg(format('%s/%s: %s -> %s', b.grantee, b.privilege, b.table_count, c.now_count), ', ')
    into v_regressions
    from _trunc_baseline b
    join (
      select g.grantee, p.privilege,
             count(*) filter (where has_table_privilege(g.grantee, t.oid, p.privilege)) as now_count
        from (values ('anon'), ('authenticated'), ('service_role'), ('postgres')) as g(grantee)
       cross join (values ('SELECT'), ('INSERT'), ('UPDATE'), ('DELETE'),
                          ('TRUNCATE'), ('REFERENCES'), ('TRIGGER'), ('MAINTAIN')) as p(privilege)
       cross join (select c2.oid from pg_class c2
                     join pg_namespace n on n.oid = c2.relnamespace
                    where n.nspname = 'public' and c2.relkind in ('r', 'p')) as t
       group by g.grantee, p.privilege
    ) c on c.grantee = b.grantee and c.privilege = b.privilege
   where b.privilege <> 'TRUNCATE'
     and b.table_count <> c.now_count;

  if v_regressions is not null then
    raise exception 'FAILED: this migration changed a privilege other than TRUNCATE: %', v_regressions;
  end if;

  -- 4. Future tables are safe. Read back the postgres-grantor default ACL and
  --    confirm the TRUNCATE bit is gone for both roles.
  select pg_catalog.array_to_string(d.defaclacl, ' | ') into v_defacl
    from pg_default_acl d
    join pg_namespace n on n.oid = d.defaclnamespace
   where d.defaclobjtype = 'r'
     and n.nspname = 'public'
     and pg_get_userbyid(d.defaclrole) = 'postgres';

  if v_defacl is null then
    raise exception 'FAILED: the postgres default ACL for tables in public is missing after the change.';
  end if;
  if v_defacl ~ 'anon=[a-z]*D' or v_defacl ~ 'authenticated=[a-z]*D' then
    raise exception 'FAILED: future tables would still grant TRUNCATE. Default ACL now reads: %', v_defacl;
  end if;

  raise notice 'TRUNCATE hardening verified: anon 46->0, authenticated 46->0, service_role 47 retained, no other privilege changed, future tables safe.';
end;
$verify$;

commit;

-- ════════════════════════════════════════════════════════════════════════════
-- EXPECTED EFFECT
--
--   anon          TRUNCATE  46 -> 0
--   authenticated TRUNCATE  46 -> 0
--   service_role  TRUNCATE  47 -> 47   (unchanged)
--   postgres      TRUNCATE  47 -> 47   (unchanged, owner)
--   every other privilege, every role          unchanged
--   tables, columns, rows, policies, functions, triggers   none touched
--
-- Representative ACL change:
--   public.audit_log
--     before  postgres=arwdDxtm | anon=arwdDxtm | authenticated=arwdDxtm | service_role=arwdDxtm
--     after   postgres=arwdDxtm | anon=arwdxtm  | authenticated=arwdxtm  | service_role=arwdDxtm
--
-- ROLLBACK
--
--   grant truncate on all tables in schema public to anon, authenticated;
--   alter default privileges for role postgres in schema public
--     grant truncate on tables to anon, authenticated;
--
-- Clean and instant at any data volume -- this migration moves no data and
-- holds no long locks. Rolling it back restores the defect, so it should only
-- be used if a concrete application dependency on client-side TRUNCATE is
-- found, and none exists today.
-- ════════════════════════════════════════════════════════════════════════════
