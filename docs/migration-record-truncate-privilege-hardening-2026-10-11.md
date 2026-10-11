# Applied migration — public-schema TRUNCATE privilege hardening, 2026-10-11

Application record for the migration that removes the TRUNCATE privilege from
`anon` and `authenticated` on every table in the `public` schema, and stops
future tables inheriting it.

The SQL artefact is committed byte-for-byte as it ran and is not edited to
record its own application; this file carries that.

## The artefact

| | |
|---|---|
| File | `supabase/truncate_privilege_hardening_2026-10-11.sql` |
| SHA-256 | `56d71cb1a717941108c5a7008e7c39a4b446e45f4a9504eaafaf5aa9474eb9cd` |
| Lines | 318 |
| Project | **`npeegfsoijhdnnvuqjin` — "Compass", PRODUCTION** |
| Applied | **2026-10-11, immediately before 20:56:51Z**, once, single transaction, no error |
| First verification | 2026-10-11 20:56:51.384569Z |
| Result | committed; guard passed, all post-conditions passed, 21 post-application checks passed |

Target identity was confirmed before applying by three markers unique to
production — the Compass LTD organisation, the protected UAT case, and the
single `platform_admins` row — and again by the migration's own guard.

## The defect this closes

`anon` and `authenticated` held TRUNCATE on **46 of the 47** base tables in
`public`, including `audit_log`, `cases`, `org_members`, `case_access`,
`hr_review_requests`, `investigation_report_versions` and `platform_admins`.

PostgreSQL does not apply row-level security to TRUNCATE; it is authorised by
the table privilege alone. So every integrity guarantee in this schema that
rests on RLS or on a trigger — A1, A3a, A3b, the audit append-only guard, the
report-version immutability guard — could be erased wholesale by a caller
holding only the project's publishable anon key.

This was demonstrated rather than reasoned about, with a control. A synthetic
table was created carrying a RESTRICTIVE `using (false) with check (false)`
policy:

```
SELECT under the deny-all policy    -> 0 rows visible   (control: policy in force)
TRUNCATE under the deny-all policy  -> SUCCEEDED, 3 rows -> 0
```

The first line is what makes the second meaningful: the policy really was
active, so this is not a case of RLS having been switched off.

### Why the grant existed

It was never granted deliberately. The Supabase default ACL for new tables in
`public` is `arwdDxtm` for `anon`, `authenticated` and `service_role`, and `D`
is TRUNCATE. Every table inherited it at creation. The single exception was
`organisation_report_settings` (A3a), which revoked explicitly.

All 46 grants to `anon` had been made by `postgres`, so all were revocable.
There were **0 PUBLIC ACL entries** on any table, and neither `anon` nor
`authenticated` is a member of any role, so granted privilege equalled
effective privilege and there was no inherited path to unwind.

## Before / after effective-permission matrix

All 47 `public` base tables. Only the TRUNCATE row moved.

| Privilege | anon before | anon after | auth before | auth after | service_role | postgres |
|---|---|---|---|---|---|---|
| SELECT | 46 | 46 | 47 | 47 | 47 | 47 |
| INSERT | 45 | 45 | 45 | 45 | 47 | 47 |
| UPDATE | 46 | 46 | 46 | 46 | 47 | 47 |
| DELETE | 46 | 46 | 46 | 46 | 47 | 47 |
| **TRUNCATE** | **46** | **0** | **46** | **0** | **47** | **47** |
| REFERENCES | 46 | 46 | 46 | 46 | 47 | 47 |
| TRIGGER | 46 | 46 | 46 | 46 | 47 | 47 |
| MAINTAIN | 46 | 46 | 46 | 46 | 47 | 47 |

Representative ACLs after application:

```
public.audit_log
  postgres=arwdDxtm | anon=arwdxtm | authenticated=arwdxtm | service_role=arwdDxtm
public.cases
  postgres=arwdDxtm | anon=arwdxtm | authenticated=arwdxtm | service_role=arwdDxtm
public.investigation_report_versions
  postgres=arwdDxtm | anon=rwdxtm  | authenticated=rwdxtm  | service_role=arwdDxtm
```

`investigation_report_versions` shows no `a` because it never had INSERT — that
is the pre-existing posture, not a change made here.

DELETE was deliberately retained. It **is** constrained by RLS; TRUNCATE is the
only write privilege that is not.

## Default-privilege changes

```
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE TRUNCATE ON TABLES FROM authenticated;
```

| Grantor entry | Before | After |
|---|---|---|
| `postgres` | `anon=arwdDxtm`, `authenticated=arwdDxtm` | **`anon=arwdxtm`, `authenticated=arwdxtm`** |
| `supabase_admin` | `anon=arwdDxtm`, `authenticated=arwdDxtm` | **unchanged — out of reach** |

Without this, the next `create table` in `public` would have re-granted
TRUNCATE from the default ACL and silently re-opened the hole.

## What was changed, and what was not

Five statements: three `REVOKE TRUNCATE ON ALL TABLES IN SCHEMA public` (from
`anon`, from `authenticated`, and defensively from `PUBLIC`, which held
nothing), and the two `ALTER DEFAULT PRIVILEGES` above.

No table, column, function, trigger, policy, index or row was created,
dropped or altered. Verified identical before and after:

```
objects   47 tables / 90 functions / 99 policies / 72 triggers
data      2963 cases / 0 report versions / 139 HR reviews / 17055 audit rows
          0 activations / 2688 employee records
```

The migration's only `CREATE` and `INSERT` targeted a `TEMP TABLE ... ON COMMIT
DROP` used to capture the privilege baseline; it is confirmed absent after
commit.

## Post-conditions asserted inside the applying transaction

The verify block does not merely check that TRUNCATE is gone. It captures the
full 32-cell privilege matrix **before** revoking and, after revoking, compares
every non-TRUNCATE cell, aborting if any moved. `REVOKE TRUNCATE` is narrow by
construction, but a mistake such as `REVOKE ALL` would have been caught by the
migration itself rather than discovered later as an outage.

It also asserts `service_role` retains TRUNCATE on all 47 tables — the half of
this change that would break silently and only surface when a maintenance job
failed.

## Validation

### Rolled-back rehearsals, before application

Two transactions, both rolled back. **A** ran the migration exactly as written
against the real schema: guard passed, verify passed, `anon` 46→0,
`authenticated` 46→0, `service_role` 47 retained. **B** proved the behaviour on
isolated synthetic objects, every refusal paired with a control that can
succeed.

### Live confirmation, after application

Against the applied state, on a synthetic table in a rolled-back transaction —
no production table was ever truncated:

| Check | Result |
|---|---|
| New table inherits from the live default ACL | `anon=arwdxtm` — no `D` |
| `anon` TRUNCATE | **refused `42501`**, rows remaining 3 |
| `authenticated` TRUNCATE | **refused `42501`**, rows remaining 3 |
| `service_role` TRUNCATE | **SUCCEEDED** — administrative access retained |
| `anon` SELECT / INSERT / UPDATE / DELETE | **3 / 1 / 1 / 1** — all still work |

### Integrity unchanged

```
A1  protect_adopted_investigation_report      85ba380f71d56ecf66daa2441d97dbdf
A3a stamp_case_report_regime                  247284ee9eca33e72bc6d005f0e16830
A3a protect_case_report_regime                684666d4f922b92401c3e8ad556a9834
A3b protect_versioned_case_legacy_report      64e43642a994499687780a3719c121c0
    hr_review_report_integrity_guard          08dc6b8b8c83cbec0951f2f7371d9faf
    adopt_investigation_report_version        fb45b6388323936ce8e405614ecc2882
    save_investigation_report_version         fb626a16d73a3470f48f02510a2df730
```

All seven unchanged. Protected UAT case digest
`f45c8df767016d829ac4115968d8930e` — unchanged, computed with the recorded
verbatim expression. Compass LTD **9/8/475/2** with last writes
`cases.updated_at 2026-09-29 21:06:33.301+00` and
`audit_log.created_at 2026-10-03 10:04:52.850982+00`, both exact to the second
and both predating this work by over a week. Write census: 0 audit rows and 0
case updates in the 15 minutes spanning application.

## Application compatibility

Nothing depended on the privilege. Verified three ways:

- **0** of 90 functions in `public` reference TRUNCATE; **0** TRUNCATE triggers
  exist in the schema.
- No SQL TRUNCATE anywhere in `src/`, `api/` or `scripts/` — every match for
  the word is text truncation or a test that *forbids* TRUNCATE in migration
  SQL.
- Those two forbidding tests (`reportAuthoringModeBoundary`,
  `reportVersionDraftBoundaryB321`) each read one named file rather than
  sweeping a directory, so this migration cannot trip them. Both were run:
  pass.

### Governance tests — no inventory change, and a pre-existing failure

`schemaEventsIn` scans only CREATE / DROP / RENAME TABLE, and
`declaredTableShapes` only `create table` and
`alter table … add column|add constraint`. This migration uses none of those
forms, declares no table and changes no RLS or policy, so
`declaredPublicTables`, `PENDING_PRODUCTION_SCHEMA` and
`RECORDED_RLS_2026_10_03` are all unaffected. **Expected inventory change:
none.**

The governance suite was **already failing before this migration**, and still
is. Those failures are **not fixed by this migration and are not claimed to
be.** Measured over the same three test files, adding this migration changes
nothing:

| Corpus state | Failed | Passed |
|---|---|---|
| Committed corpus only | **5** | 95 |
| + this migration | **5** | 95 |
| + the unapplied A3c candidate file | **11** | 89 |

So the failures have **two distinct sources**, neither of them this work:

- **5 from the A3a commit** — `organisation_report_settings` is declared by
  `supabase/reporting_regime_foundation_2026-10-11.sql` but was never
  classified or added to the expected-schema fixtures.
- **6 from the A3c candidate file**, which is untracked but sits in
  `supabase/` and is therefore swept by the corpus replay. One is a genuine
  defect it has surfaced early: `hr_review_clarifications.case_id` is a
  single-column tenant reference where the house rule requires the composite
  `(case_id, org_id) -> cases(id, org_id)`.

Both are recorded in
`docs/outstanding-a3a-governance-inventory-gap-2026-10-11.md`.

## Unresolved — storage schema, outside this migration

`storage.objects`, `storage.buckets` and `storage.buckets_analytics` still
grant TRUNCATE to `anon` and `authenticated`. `storage.objects` holds the
metadata for evidence attachments.

Those grants were made by `supabase_storage_admin`, not `postgres`. This was
tested rather than assumed: issuing the revoke as `postgres` reports
"statement completed" but leaves the ACL byte-identical, with
`has_table_privilege('anon','storage.objects','TRUNCATE')` still true. A revoke
by a non-grantor is a silent no-op.

It therefore **cannot be fixed from a migration run as `postgres`**. The
migration deliberately omits it, because a statement that appears to work and
does nothing is worse than its absence. Escalation drafted in
`docs/supabase-escalation-truncate-grants-2026-10-11.md`.

The `supabase_admin` default-privilege entry is unreachable for the same
reason — `postgres` is not a member of `supabase_admin`. Tables created by
migrations run as `postgres` and are covered; a table created by
`supabase_admin` would still inherit TRUNCATE.

## Also observed, not addressed here

- **MAINTAIN (`m`)** remains held by `anon` and `authenticated` on 46 tables,
  permitting VACUUM / ANALYZE / REINDEX / CLUSTER. Not destructive, so outside
  this narrow migration, but it is a resource-exhaustion surface.
- A formal HR return can be silently reversed `returned -> pending` by any HR
  member: `hr_review_report_integrity_guard` gates its decision block on
  `new.status <> 'pending'`, so reversals skip every check. Relevant to A3c.
- `platform_admins` is still protected only by the absence of a policy while
  holding full CRUD grants.
- A1 still has no migration-record document.
  `cases.investigation_report_date` and `cases.created_at` remain unguarded.

## Rollback

```sql
grant truncate on all tables in schema public to anon, authenticated;
alter default privileges for role postgres in schema public
  grant truncate on tables to anon, authenticated;
```

Clean and instant at any data volume — this migration moves no data and holds
no long locks. Rolling it back restores the defect, so it should only be used
if a concrete application dependency on client-side TRUNCATE is found. None
exists today.
