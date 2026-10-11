# Supabase support escalation — TRUNCATE granted to `anon` on storage tables, and the `supabase_admin` default-privilege entry

Drafted 2026-10-11. Project ref **`npeegfsoijhdnnvuqjin`** (region/plan per
dashboard). Ready to send; not yet submitted.

---

## Summary

Two TRUNCATE grants to the `anon` and `authenticated` roles cannot be revoked
by the project's `postgres` role, because `postgres` is neither the grantor nor
a member of the grantor role. We have hardened everything within our reach and
need Supabase to act on the remainder.

Because PostgreSQL does not apply row-level security to TRUNCATE, these grants
let a caller holding only the project's **publishable anon key** destroy table
contents regardless of any RLS policy.

## 1. `storage` tables grant TRUNCATE to `anon` and `authenticated`

```
storage.objects              anon=arwdDxtm/supabase_storage_admin
storage.buckets              anon=arwdDxtm/supabase_storage_admin
storage.buckets_analytics    anon=arwdDxtm/supabase_storage_admin
```

`D` is TRUNCATE. `storage.objects` holds our evidence-attachment metadata, so a
TRUNCATE there would orphan every uploaded file in the product.

Attempting the revoke as `postgres` **silently does nothing**:

```sql
revoke truncate on table storage.objects from anon, authenticated;
-- reports "statement completed"
-- relacl afterwards: byte-identical
-- has_table_privilege('anon','storage.objects','TRUNCATE') -> still true
```

This is correct PostgreSQL behaviour — a REVOKE issued by a role that is not
the grantor is a no-op — but it means the grant is not addressable by us.
`postgres` does hold `D*` (TRUNCATE with grant option) on these tables, which
permits granting, not revoking another role's grant.

**Request:** revoke TRUNCATE on `storage.objects`, `storage.buckets` and
`storage.buckets_analytics` from `anon` and `authenticated`, and confirm
whether this is the intended default for new projects. We can find no
documented storage feature that requires client-side TRUNCATE.

## 2. The `supabase_admin` default-privilege entry for `public`

There are two default-ACL entries for tables in `public`:

```
grantor postgres         anon=arwdDxtm  authenticated=arwdDxtm
grantor supabase_admin   anon=arwdDxtm  authenticated=arwdDxtm
```

We have revoked TRUNCATE from the **`postgres`** entry, which covers tables
created by our own migrations:

```sql
alter default privileges for role postgres in schema public
  revoke truncate on tables from anon, authenticated;
```

We cannot alter the **`supabase_admin`** entry — `postgres` is not a member of
`supabase_admin`. So any table created in `public` by `supabase_admin` would
still inherit TRUNCATE for both client roles, silently re-opening the hole.

**Request:** either revoke TRUNCATE from the `supabase_admin` default-privilege
entry for `public`, or confirm that no Supabase-managed process creates tables
in `public` as `supabase_admin`, so we can rely on the `postgres` entry alone.

## 3. Question on the platform default

The default ACL for new tables in `public` is `arwdDxtm` for `anon`,
`authenticated` and `service_role`. Granting `D` (TRUNCATE) to the two
client-facing roles appears unintentional, since it is the one write privilege
RLS cannot constrain: a table can be fully protected by policies and still be
emptied by an anonymous caller.

**Question:** is TRUNCATE in the default grant deliberate? If not, we would
suggest removing it from the project template, as every table created in any
project inherits it.

## What we have already done

Applied 2026-10-11 to `public` on this project
(`supabase/truncate_privilege_hardening_2026-10-11.sql`, SHA-256
`56d71cb1a717941108c5a7008e7c39a4b446e45f4a9504eaafaf5aa9474eb9cd`):

- `REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public FROM anon, authenticated` —
  47 of 47 tables now at 0.
- `ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public REVOKE TRUNCATE
  ON TABLES FROM anon, authenticated`.
- `service_role` and `postgres` retain TRUNCATE on all 47 tables; SELECT,
  INSERT, UPDATE, DELETE, REFERENCES, TRIGGER and MAINTAIN are unchanged for
  every role.

Verified against the live post-application state on a synthetic table:
`anon` and `authenticated` TRUNCATE now refused with `42501`, `service_role`
still succeeds, and ordinary DML is unaffected.

## Reproduction, if useful

Demonstrates that RLS does not restrict TRUNCATE, with a control proving the
policy is in force. Safe — rolls back:

```sql
begin;
create table public._t(id int);
insert into public._t values (1),(2),(3);
alter table public._t enable row level security;
create policy deny_all on public._t for all using (false) with check (false);
grant select, truncate on public._t to anon;

set role anon;
select count(*) from public._t;   -- 0  (control: policy is in force)
truncate public._t;               -- SUCCEEDS
reset role;
select count(*) from public._t;   -- 0  (was 3)
rollback;
```

## Contact

Raised by the Compass engineering team. Happy to supply the full
before/after effective-privilege matrix (all 47 `public` tables x 8
privileges x 4 roles) and the application record on request.
