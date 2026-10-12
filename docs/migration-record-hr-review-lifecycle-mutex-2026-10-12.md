# Applied migration — B3 A3c HR review lifecycle under a per-case mutex, 2026-10-12

## The artefact

| | |
|---|---|
| File | `supabase/hr_review_lifecycle_mutex_2026-10-12.sql` |
| SHA-256 | `a953483cc15be59a5ca8db72463cea320c861b9d1549cf4ada3603a22d92f502` |
| Lines | 1406 |
| Project | **`npeegfsoijhdnnvuqjin` — "Compass", PRODUCTION** |
| Applied | **2026-10-12, immediately before 11:01:33Z**, once, single transaction, no error |
| Order | **2 of 3** |
| Result | committed; drift guard passed, in-migration verify passed, 30 independent post-checks passed |

Supersedes two candidates that were never applied, archived byte-identically in
`docs/superseded-candidates/`: `2623aff7…` (advisory-lock design, had a
deadlock) and `3d0fba38…` (same, plus a `reviewed_by_name` regression and an
incomplete terminal set).

## Objects created

```
tables      investigation_report_lifecycle_events, hr_review_clarifications
functions   13 (5 client RPCs, 2 status-vocabulary, 6 guards/recorders)
triggers    6   policies 2 (SELECT only)   unique constraints 2
counts      tables 47 -> 49    policies 99 -> 101    triggers 72 -> 78
rows written  none
```

Client RPCs: `decide_hr_review`, `discontinue_investigation`,
`escalate_blocked_hr_review`, `submit_adopted_report_for_hr_review`,
`answer_hr_review_clarification` — all `EXECUTE` to `authenticated`, **none to
`anon`**. Re-audited 2026-10-12 against `has_function_privilege`: confirmed for
all five, and the two trigger functions grant `EXECUTE` to neither `anon` nor
`authenticated`.

**Correction to this record.** The two status-vocabulary helpers
`hr_review_terminal_statuses` and `hr_review_known_statuses` **do** grant
`EXECUTE` to `anon`. I did not state that when this record was first written. It
is harmless on its own merits — both are `IMMUTABLE` and return a constant
`text[]` of status names, reading no table and taking no argument, so an
anonymous caller learns only the vocabulary, which the client bundle already
contains. It is recorded because it is the same unhardened pattern as the open
`adoption_stage_block_reason` anon grant, and both belong in one `anon` EXECUTE
sweep rather than being rediscovered twice. Carried on the outstanding list as
"`anon` EXECUTE sweep", which now covers three functions:
`adoption_stage_block_reason`, `hr_review_terminal_statuses` and
`hr_review_known_statuses`.

`hr_review_report_integrity_guard` replaced:
`08dc6b8b8c83cbec0951f2f7371d9faf` → **`785241706ea88fb1d7411b014921945a`**.

## The architecture

**The case row is the per-case mutex.** All 7 lifecycle functions take
`select … from public.cases where id = … for update` as their first lock, then
touch a version or review row. `FOR UPDATE` subsumes every `KEY SHARE` the
foreign-key checks need, so no lock upgrade can occur and `case_seq` is
serialised by the mutex rather than by a second lock type. **No advisory lock
anywhere** — asserted by a post-condition.

Two in-trigger cutover gates were tried and rejected, and a post-condition
prevents either being reintroduced:

* `current_user <> 'postgres'` — **inert**. The guard is SECURITY DEFINER, so
  `current_user` is always the owner. A probe appeared to pass only because a
  different rule fired first.
* a transaction-local GUC marker — **works but client-forgeable**, since
  `set_config` on a custom GUC needs no privilege. Demonstrated working *and*
  demonstrated forgeable, then rejected — the same conclusion A3a reached about
  `compass.activating_org`.

The enforcement boundary is therefore the table privilege, at cutover stage 5
(**not in this migration**): `revoke update on public.hr_review_requests from
authenticated`. Verified by local test: after the revoke a direct client UPDATE
fails `42501 permission denied`, while all 8 decision statuses still succeed
through `decide_hr_review` on legacy reviews.

## Concurrency evidence

Two genuine independent sessions, local PostgreSQL 17.11, `deadlock_timeout`
200 ms, both acquisition orders. A positive control (deliberate lock-order
inversion) produced **`SQLSTATE 40P01 deadlock detected`**, proving the harness
can detect one; **no test produced 40P01**.

| Test | Result |
|---|---|
| Adoption vs HR return, both orders | both commit; ledger records the order that occurred |
| Submission vs decision, both orders | serialised; pre-return submission refused `23514` |
| Concurrent decisions, same review | one wins, other refused `23514` terminal |
| Concurrent adoptions, same case | both commit, **0 case_seq duplicates, 0 gaps** |
| Direct UPDATE after revoke, both sessions | `42501` ×2 |
| Terminal immutability under contention | comment rewrite refused `23514` |
| Closure vs discontinuation | closure-first refused `23514`; discontinuation succeeded with audit |

Caught exceptions are never written to the server log, so the per-test result
line is the authoritative deadlock evidence, not the log.

## Preflight evidence

The 40-check preflight above, plus 14 schema-specific checks: `UNIQUE(id,
case_id)` satisfiable on both tables (0 duplicate pairs, 0 NULL `case_id` across
139 rows); all existing statuses within the new known list; 20 reviews would
become frozen (all `approved`, and `respondToReview` filters
`.eq(status,'pending')` so no client path updates them); 0 reviews carry
`report_version_id`, so every version rule is inert; 0 HR users with a NULL
`org_members.name`.

A rolled-back probe against **real production data** decided a real pending
legacy review (`c87398a6`, step `final_written_warning`, `regime=null`) as the
independent `hr_manager` through the direct-UPDATE path: **permitted, 1 row**,
`reviewed_by_name` server-stamped, reversal refused `23514`, all four
`hr_review_requests` triggers coexisting.

## Post-conditions (verified independently)

Both tables created and **empty**; 13 functions and 6 triggers present; cases
trigger order `protect_zz_case_report_regime_trg → protect_zza_… →
protect_zzd_progression_update_trg` (UPDATE) and `protect_zz_stamp_… →
protect_zza_… → protect_zzc_progression_insert_trg` (INSERT); **0 write
privileges for `anon`, `authenticated` or `service_role`** on either new table;
`authenticated` can SELECT both; 2 composite `(case_id, org_id) → cases(id,
org_id)` FKs; RLS enabled with one SELECT policy each; all 7 lifecycle functions
take the mutex; 0 advisory locks; 2 new unique constraints.

Unchanged: `authenticated` UPDATE on `hr_review_requests` **still granted**; HR
reviews `approved=20, pending=119` (139 total); 0 report versions and 0
adoptions; 0 activations; 0 versioned cases; 2963 cases / 17055 audit rows; A1,
A3a ×2, A3b, the adoption RPC and the save RPC all byte-identical; UAT digest
`f45c8df767016d829ac4115968d8930e`; Compass LTD 9/8/475/2 with last write
`2026-09-29 21:06:33.301+00`; TRUNCATE hardening 0/0.

## A3c MAY RECORD hr_return LIFECYCLE EVENTS FOR LEGACY CASES

Stated explicitly because it is behaviour the reduced local test schema did not
cover and it was confirmed against production in a rolled-back probe.

`record_zz_hr_return_event_trg` fires on
`new.status = 'returned' and old.status is distinct from 'returned'` with **no
`report_regime` condition**. A formal HR return on a **legacy** case therefore
inserts a lifecycle event (observed: `1:hr_return` on a `regime = null` case).

This is harmless and arguably correct — it is a factual record of a return that
genuinely happened, the composite foreign key is satisfied, and `case_seq`
simply begins for that case. It does mean the ledger will accumulate `hr_return`
events for legacy cases as well as versioned ones, and anyone reading the ledger
should not infer that a case is versioned from the presence of an event.

**No legacy report versions are fabricated.** `investigation_report_versions`
holds 0 rows and this migration writes none; no `adoption` event can exist for a
legacy case because no version exists to adopt. Nothing backfills history.

## Known discrepancy in the artefact's own header

`supabase/hr_review_lifecycle_mutex_2026-10-12.sql` line 3 still reads
**"NOT APPLIED"**. It was written as a candidate and that header was never
updated, because updating it would change the file's bytes and therefore its
SHA-256 — breaking the only link between the approved hash
`a953483c...` and the file in the repository. The header is wrong and is left
wrong deliberately. **This record, not the file header, states whether a
migration is applied.** The same applies to any sibling candidate header.

## Deviations

None. The file was applied as approved, verbatim — including the comments inside
the function bodies, which form part of `prosrc` and therefore of the recorded
md5s.

## Governance

`PENDING_PRODUCTION_SCHEMA` held both table names while A3c was a candidate.
Following that list's own documented procedure, both were moved into the
VERIFIED live reading after this application and the list is empty again;
`VERIFIED_LIVE_PUBLIC_TABLES` 47 → 49 and the production-verified RLS reading 47
→ 49. The inventory attestation `bbcc4f326658ed1a` is unchanged, because
`PENDING_PRODUCTION_SCHEMA` is not one of its inputs — only the applied/pending
bookkeeping moved, not the erasure or disclosure semantics. Governance: 125/125.

## Rollback

Reverse-order drop list is recorded in the artefact's own footer, and
`hr_review_report_integrity_guard` must be restored to
`08dc6b8b8c83cbec0951f2f7371d9faf`. Rolling back after cutover stage 5 must also
restore the `UPDATE` privilege, or no HR review decision is possible on any case.

## Cross-reference

This migration is **absent from `supabase_migrations.schema_migrations`** — it was applied through `execute_sql`, not `apply_migration`, as were all migrations since 2026-10-09. The timestamp above is the observation time of the verification query that followed the application, not a ledger timestamp, and it is not independently auditable. See `docs/outstanding-migration-ledger-gap-2026-10-12.md`; do not run `supabase db push` or `db reset` against this project until that is resolved.
