# Applied migration — B3 A3a reporting regime foundation, 2026-10-11

Application record for the migration that gives Compass a database-controlled
notion of **which organisations author investigation reports as immutable
versions**, and **which cases belong to that regime**.

The SQL artefact is committed byte-for-byte as it ran and is not edited to
record its own application; this file carries that.

## The artefact

| | |
|---|---|
| File | `supabase/reporting_regime_foundation_2026-10-11.sql` |
| SHA-256 | `d4eca32516d652114503eb8c5e8ccea7c84b044698f46002cb554beaf83ad3e3` |
| Lines | 369 |
| Project | **`npeegfsoijhdnnvuqjin` — "Compass", PRODUCTION** |
| Baseline taken | 2026-10-11 19:22:29Z |
| Applied | **2026-10-11 19:25:08Z**, once, single transaction, no error |
| Result | committed; all 17 post-application checks passed |

Target identity was confirmed before applying by three markers unique to
production: the Compass LTD organisation, the protected UAT case, and the
`platform_admins` row — none of which exist in the separate
`compass-e2e-test` project.

The in-transaction drift guard passed on `protect_adopted_investigation_report`
(A1), the adoption RPC and the save RPC, and on the precondition that
`platform_admins` is still deny-all.

## Two superseded candidates, and why

Both were built, probed and rejected. Neither was ever applied.

| SHA-256 | Rejected because |
|---|---|
| `67e7400273705f894d313e5dc3e3bc757ac72ccf06e1cb7bca7b12aa89f018e7` | **Unreachable.** Activation was a column on `organisations` protected by a trigger. `organisations_update_member` grants UPDATE only where `id IN (select my_org_ids())`, and a Compass operator is deliberately **not a member** of the customer organisation. The operator's UPDATE matched **zero rows**, the trigger never fired, nothing was audited — and a zero-row UPDATE reports success, so it looked like it had worked. |
| `87a24378e6e3791c0f79a75f2e7cebb87167965e8f964d882520720f8e74767c` | **Duplicate audit.** Adding a SECURITY DEFINER RPC fixed reachability, but the RPC's own UPDATE fired the trigger, so one activation wrote **two** audit events. |

### Why the proposed fix for the second was also rejected

The remedy under consideration was a transaction-local marker
(`compass.activating_org`) that the RPC would set and the trigger would check.
It was tested adversarially before adoption and **failed outright**:

- `set_config` on a namespaced custom GUC requires **no privilege at all**;
- an HR Director set the marker themselves and their direct UPDATE **landed a
  forged activation on a real organisation** (1 row affected).

A GUC is session state owned by the caller. It is evidence of nothing, and it
must not be used to authorise anything. This is recorded in the artefact's own
A3e boundary note, because the same temptation will arise there.

## What was applied instead

Activation is not a column anyone can write. It is a row in a table on which
`anon` and `authenticated` hold **no INSERT, UPDATE or DELETE privilege**.
Table privileges are evaluated before RLS and before any trigger, so the exact
forgery that defeated the marker is refused with `42501 permission denied`
before any of our code runs. With no trigger on the activation write there is
one writer, therefore exactly one audit event — the duplicate was cured at the
root rather than patched.

`public.organisations` is **completely untouched**: no new column, no new
trigger (its trigger count is unchanged at 3).

### Objects created

| Object | Detail |
|---|---|
| table `public.organisation_report_settings` | `org_id` PK → organisations, `versioned_authoring_enabled_at`, `activated_by` → auth.users, `activated_at`. RLS enabled; SELECT for members only |
| policy `organisation_report_settings_select_member` | `org_id in (select my_org_ids())` |
| column `public.cases.report_regime` | nullable `text`, CHECK `null or 'versioned'` |
| `is_platform_admin()` | md5 `1e6e04db46218a797b81d6b9123084fa` |
| `activate_versioned_report_authoring(uuid)` | md5 `9e7e86b401d39cd989c91de2472adaab` |
| `stamp_case_report_regime()` | md5 `247284ee9eca33e72bc6d005f0e16830` |
| `protect_case_report_regime()` | md5 `684666d4f922b92401c3e8ad556a9834` |
| trigger `protect_zz_stamp_report_regime_trg` | BEFORE INSERT ON cases, fires last |
| trigger `protect_zz_case_report_regime_trg` | BEFORE UPDATE ON cases |

All four functions: `SECURITY DEFINER`, owner `postgres`, `search_path=public`.
`activate_…` and `is_platform_admin` are executable by `authenticated`; the two
trigger functions are `postgres` + `service_role` only, matching the five
comparable guards in this schema.

### Counts

```
tables     46 → 47        functions 85 → 89        policies 98 → 99
triggers   cases 10 → 12  organisations 3 → 3 (unchanged)
rows written: none
```

## Grandfathering — no backfill, no fabricated history

`cases.report_regime` permits only `NULL` or `'versioned'`. **Absence is the
legacy regime**, so all 2963 existing cases were grandfathered with **zero
writes**: no backfill, no rewritten histories, no invented report activity.
Verified after application: 2963 of 2963 cases `NULL`, 0 stamped.

## Verified behaviour (rolled-back probes against this exact SHA)

| | |
|---|---|
| HR Director forges the marker + direct INSERT | refused `42501 permission denied` |
| HR Manager direct UPDATE of settings | refused `42501` |
| anon calls the RPC | refused `42501` (no EXECUTE) |
| service_role calls the RPC | refused `42501` — it has no `auth.uid()`, so it could not be audited |
| HR Manager / HR Director call the RPC | refused `42501` |
| Revoked operator | refused `42501` |
| Nonexistent organisation | refused `23503` |
| Audit insert fails | refused `23514`, **0 settings rows** — activation rolled back |
| Operator activates a **non-member** organisation | **succeeds** |
| Scope | exactly **1** organisation, exactly **1** audit event |
| Re-activation | refused `23514` |
| New case in an activated org | stamped `versioned` |
| Client supplies `versioned` in a non-activated org | stored `NULL` |
| Client supplies `NULL` in an activated org | stored `versioned` |
| `versioned` → legacy revert | refused `23514` |
| SELECT RLS | member sees 1; three distinct non-members see 0; anon refused |

## State after application

**No organisation is activated** (0 rows in the settings table) and **no case
is stamped**. Every rule short-circuits, so nothing behaves differently for
anyone. Activation is a separate, later, separately approved step.

Unchanged and verified: A1 `85ba380f71d56ecf66daa2441d97dbdf`; adoption RPC
`fb45b6388323936ce8e405614ecc2882`; save RPC `fb626a16d73a3470f48f02510a2df730`;
HR review guard `08dc6b8b8c83cbec0951f2f7371d9faf`; 2963 cases; 0 report
versions; 139 HR review records; `audit_log` 17055 before and after (**no audit
events written by this migration**); Compass LTD `6cdb57f65bbf11400787a11f796d5bd4`,
protected UAT `f45c8df767016d829ac4115968d8930e`, synthetic case
`fb0fb43abba369c88fd7e3ac5ac6ecb2`.

## Known limitation, not a defect of this migration

`audit_log` has a pre-existing BEFORE INSERT trigger, `stamp_audit_log_user_name`,
which overwrites `user_name` from `org_members` and writes `'Unknown'` when the
actor has no membership row — which is exactly a Compass operator's situation.
So an activation audit row will read `user_name = 'Unknown'` while `user_id`
and `org_id`, the authoritative fields, are correct. The RPC's own
`coalesce(v_name, 'Compass operator')` is therefore discarded. Changing it
would mean modifying a shared function used by every audit insert in the
product, which is well outside A3a.

## Outstanding risks, carried forward

1. **`platform_admins` is protected only by the absence of a policy.** RLS is
   enabled with zero policies, yet `anon` and `authenticated` hold full CRUD
   grants. One future permissive policy would make self-promotion to operator
   possible. Recommended: revoke those grants and add a RESTRICTIVE
   `with check (false)` INSERT policy. `governanceClosure.test.js` and
   `schemaInventoryGate.test.js` assert properties of this table and must be
   re-run, not assumed unaffected.
2. **One operator, no recovery path.** A single active `platform_admins` row,
   no break-glass (service_role is deliberately refused), and no triggers on
   `platform_admins`, so operator grants and revocations leave no trail.
3. **`cases.created_at` is still mutable** — not load-bearing in this design,
   but worth closing separately.
4. **A3e will need its own sanctioned path** to change `report_regime`. A GUC
   marker is not available to it, for the reason proven above.

## Rollback

```sql
drop trigger if exists protect_zz_case_report_regime_trg on public.cases;
drop trigger if exists protect_zz_stamp_report_regime_trg on public.cases;
drop function if exists public.protect_case_report_regime();
drop function if exists public.stamp_case_report_regime();
drop function if exists public.activate_versioned_report_authoring(uuid);
drop function if exists public.is_platform_admin();
alter table public.cases drop constraint if exists cases_report_regime_valid;
alter table public.cases drop column if exists report_regime;
drop table if exists public.organisation_report_settings;
```

Clean at the current state — no organisation activated, no case stamped, no
row written. Once an organisation is activated, dropping the table discards the
record of when that happened; the audit row survives, the state does not.
