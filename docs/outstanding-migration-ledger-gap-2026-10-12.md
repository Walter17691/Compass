# Outstanding — seven applied migrations are absent from Supabase's own ledger

**Found 2026-10-12 while verifying the three migrations applied that day. Not a
defect in any of them; a gap in how every migration since 2026-10-09 was
applied. Nothing is fixed here, because fixing it means writing to production.**

## The measurement

```
supabase_migrations.schema_migrations rows            64
max(version)                                          20261006213541
rows with version >= '20261009'                       0
CONTROL: rows with version >= '20261001'              13   (filter works)
live public tables created by no ledger row            5
```

The control matters: early-October rows *are* present, so the zero is a genuine
absence rather than a broken predicate.

## What is missing

Every migration applied on or after 2026-10-09 was applied through
`execute_sql`, not `apply_migration`, so none of them inserted a ledger row:

| Migration | Applied | In ledger |
|---|---|---|
| `investigation_report_versions_2026-10-09.sql` (B3.1) | 2026-10-09 | **no** |
| `reporting_regime_foundation_2026-10-11.sql` | 2026-10-11 | **no** |
| `report_authoring_mode_2026-10-11.sql` (A3a) | 2026-10-11 | **no** |
| `adopted_report_protection_2026-10-11.sql` (A3b) | 2026-10-11 | **no** |
| `versioned_case_legacy_report_protection_2026-10-11.sql` | 2026-10-11 | **no** |
| `truncate_privilege_hardening_2026-10-11.sql` | 2026-10-11 | **no** |
| `adoption_outcome_predicate_fix_2026-10-12.sql` | 2026-10-12 10:56Z | **no** |
| `hr_review_lifecycle_mutex_2026-10-12.sql` | 2026-10-12 11:01Z | **no** |
| `adoption_rpc_stale_read_fix_2026-10-12.sql` | 2026-10-12 11:03Z | **no** |

Five live tables therefore exist that the ledger cannot account for:
`investigation_finding_revisions`, `investigation_report_versions`,
`organisation_report_settings`, `investigation_report_lifecycle_events`,
`hr_review_clarifications`.

## Why it matters

1. **The applied state is recorded only in this repository.** The authority for
   "what is in production" is `docs/migration-record-*.md` plus the SQL file
   hashes plus the live function md5s — not the database's own history. That is
   survivable only while those records stay accurate, which is the reason they
   exist in this form.
2. **A CLI-based workflow would be wrong about production.** `supabase db diff`,
   `db push` and `db reset` all read this ledger. Any of them run against this
   project today would conclude that nine migrations still need applying. A
   `db push` could attempt to re-create existing tables (noisy failure) or, if
   someone "resolved" the conflict by regenerating from the ledger, drop live
   objects (silent data loss). **Do not run `supabase db push`, `db reset` or
   `db diff --linked` against `npeegfsoijhdnnvuqjin` until this is resolved.**
3. **The timestamps in the migration records are observation times, not ledger
   times.** Each record says "immediately before HH:MM:SSZ" because that is the
   honest precision available: the time of the verification query that followed
   the application, taken from the same session. There is no server-side row to
   corroborate them. They are accurate to within the seconds between COMMIT and
   the next statement, and they are not independently auditable.

## Why it is not fixed here

Back-filling nine rows into `supabase_migrations.schema_migrations` is a
production write, and it is also the fabrication of a history that did not
happen — the ledger would claim an apply path that was never used, with
timestamps reconstructed after the fact. Neither is authorised and the second is
undesirable even if it were.

## Options, for a decision

* **Accept and document** (current state). The repo records remain the single
  authority; a note in the Supabase project README warns against CLI push.
  Cheapest, and already true.
* **Back-fill the ledger** with the real file contents and honest
  `name`/`version` values, in one reviewed batch, explicitly marked as
  retroactive. Restores CLI compatibility. Requires a production write and a
  decision about what timestamps to claim.
* **Adopt `apply_migration` going forward** and back-fill nothing. Stops the gap
  growing; leaves the nine historical entries missing, so CLI tooling stays
  unsafe until they are reconciled.

Recommended: **adopt `apply_migration` for the next migration** regardless of
which option is chosen for the history, so the gap stops widening while the
back-fill question is decided.
