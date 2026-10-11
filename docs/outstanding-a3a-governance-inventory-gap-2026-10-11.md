# Governance inventory failures — one resolved, one outstanding, 2026-10-11

Two independent governance-suite failures were found while validating the
public-schema TRUNCATE privilege hardening. Neither was caused by that
migration.

One has since been **fixed** (commit `cea800f`). The other is a **defect in an
unapplied candidate and remains open**.

## Attribution — measured, not inferred

Over the same test files (`governanceClosure`, `schemaInventoryGate`,
`dataClassification`, `dataInventory`), varying only which files are present in
`supabase/`:

| Corpus state | Failed | Passed |
|---|---|---|
| Before any fix, committed corpus only | **5** | 95 |
| Before any fix, + the TRUNCATE migration | **5** | 95 |
| **After `cea800f`, committed corpus** | **0** | **103** |
| **After `cea800f`, + the unapplied A3c candidate** | **11** | **92** |

Two things this table establishes:

- The TRUNCATE hardening contributed **zero** failures. It declares no table
  and changes no RLS or policy, and the corpus parsers (`schemaEventsIn`,
  `declaredTableShapes`) read only CREATE / DROP / RENAME TABLE and
  `alter table … add column|add constraint`.
- A3c's share rose from 6 to 11 after the A3a fix. That is not a regression.
  Several count assertions were already failing on A3a's account, so A3c's
  extra table was not producing separate failures for them; with A3a corrected,
  A3c trips them on its own.

**The suite is green on the committed corpus only.** It is not green while the
unapplied A3c candidate sits in the scanned directory, and nothing here should
be read as claiming otherwise.

---

## RESOLVED — A3a: `organisation_report_settings` was never classified

Fixed in **`cea800f`**. Recorded here because the decision matters more than
the edit.

`supabase/reporting_regime_foundation_2026-10-11.sql` was committed and applied
on 2026-10-11, declaring `public.organisation_report_settings`, but the
inventory fixtures were not updated alongside it. The gate worked exactly as
designed: it exists to catch a table landing in the schema that no human has
classified.

The five tests that were failing, all now passing:

1. `every table the migration corpus declares has a classification`
2. `every table the migration corpus declares is classified`
3. `discovers org-scoped tables from the corpus, matching the live count`
4. `case_decisions ARRIVED in D4.2 and could not land unclassified`
5. `replaying supabase/ reproduces the EXPECTED POST-MIGRATION schema`

### The decision, and the trap that was avoided

The question the gate asks is **what "Delete all data" owes the table**. It was
answered against the live schema, verified 2026-10-11: `org_id` is the PRIMARY
KEY, there is no `case_id` and no `employee_id`, the remaining columns are two
timestamps and `activated_by` — a **Compass operator's** `auth.users` id, not
an employee's — and the `org_id` FK to `organisations` is `ON DELETE CASCADE`.

Filed as **`intentionally_excluded`**, on the same contract as
`customer_contracts`.

`cascade_covered` was the tempting answer and would have been **false**. That
category means a cascade from `cases`, a table the deletion handler *does*
delete. This table cascades from `organisations`, which the handler
deliberately spares — `cases.org_id -> organisations` is `NO ACTION` and the
tenant row survives "Delete all data". Filing it as `cascade_covered` would
have claimed an erasure that never happens: the same SQL keyword, the opposite
consequence, decided entirely by which parent actually gets deleted.

There is also a positive reason not to erase it. Deleting the activation row
would silently revert the organisation from versioned report authoring back to
the legacy regime, undoing a configuration change only a Compass operator can
make through the SECURITY DEFINER activation RPC. "Delete all data" erases case
and employee content; it does not reconfigure the product.

### What changed

| What | Where | Change |
|---|---|---|
| Category | `src/lib/dataInventory.js` (`INTENTIONALLY_EXCLUDED_TABLES`) | added, with the reasoning above |
| Classification | `src/lib/dataClassification.js` (`TABLE_CLASSIFICATION`) | `PLATFORM`, DSAR `NOT_APPLICABLE`, `exclusionReason` required and given |
| Live RLS reading | `src/lib/dataClassification.js` (`RECORDED_RLS_2026_10_03`) | `{ rls: true, policies: 1 }`, production-verified |
| Verified live tables | `src/test/schemaInventoryGate.test.js` | 46 -> 47 |
| Org-scoped count | `src/test/governanceClosure.test.js` | 40 -> 41 |
| RLS readings count | `src/test/governanceClosure.test.js` | 46 -> 47 |
| Attestation | `src/lib/inventoryFingerprint.js` | refreshed to `69d4d88f6c7850fa` |

The table entered `VERIFIED_LIVE_PUBLIC_TABLES` rather than
`PENDING_PRODUCTION_SCHEMA`, because its posture was read back from
`pg_class`/`pg_policy` after application — the same route
`investigation_report_versions` took after B3.1. `PENDING_PRODUCTION_SCHEMA`
stays empty.

The attestation was refreshed with `scripts/inventory-fingerprint.mjs --write`
**only after every other gate passed against that exact inventory**, which is
the precondition that script documents: *"refreshing it without that is forging
the attestation."* At the point of writing, 99 of 100 tests passed and the sole
failure was the fingerprint itself.

No test was weakened, skipped, quarantined or deleted. One stale test title
that read "all 44 tables" while asserting 46 now reads 47.

---

## OUTSTANDING — A3c candidate: a composite foreign-key defect

**Still open. Not fixed.** 11 failing tests, which appear only while
`supabase/hr_review_submission_integrity_2026-10-11.sql` (SHA
`2623aff78f039368c85a750db9b8896ca7fca46e013aa92e5162542f08d47c75`, unapplied
and untracked) is present in `supabase/`.

The corpus replay sweeps every `.sql` file in that directory regardless of
whether it has been applied or committed, so an untracked candidate is already
under governance — which is how this was caught **before** application rather
than after.

### The substantive defect

```
THE LIVE SCHEMA HAS NO UNACCEPTED TENANCY VIOLATION — from derived shapes
  expected [ 'hr_review_clarifications.case_id' ] to deeply equal []
```

`supabase/hr_review_submission_integrity_2026-10-11.sql:135` declares:

```sql
case_id  uuid not null references public.cases(id) on delete cascade,
```

A single-column tenant reference. The house rule requires the composite form,
as `investigation_report_versions` uses:

```sql
foreign key (case_id, org_id) references public.cases(id, org_id) on delete cascade
```

**Why it matters:** a single-column FK to `cases(id)` permits a
`hr_review_clarifications` row whose `org_id` disagrees with its case's
`org_id`. The composite FK makes that combination unrepresentable at the
storage layer — below RLS and below any trigger. Clarification rounds carry
HR's questions and the investigator's answers about a named employee, so a
cross-tenant row there is a data-protection incident, not a tidiness issue.

### The 11 failing tests

Unclassified table (`hr_review_clarifications` is declared but has no
classification, correctly — the candidate is not approved):

1. `every table the migration corpus declares has a classification`
2. `every table the migration corpus declares is classified`
3. `case_decisions ARRIVED in D4.2 and could not land unclassified`

Counts, which move with the declared schema:

4. `discovers org-scoped tables from the corpus, matching the live count`
   — 41 -> 42
5. `replaying supabase/ reproduces the EXPECTED POST-MIGRATION schema`
   — 47 -> 48

The tenancy rule itself:

6. `THE LIVE SCHEMA HAS NO UNACCEPTED TENANCY VIOLATION — from derived shapes`

And the gate's own mutation tests, which assert the resulting violation set
exactly and therefore fail because the baseline set is no longer empty:

7. `AUTOMATICALLY fails a new org_id + employee_id table with a single-column FK`
8. `AUTOMATICALLY fails a case-linked table using org_id + case_id -> cases(id)`
9. `the REAL case_decisions passes because it uses the composite form`
10. `PASSES a compliant case-linked shape — composite (case_id, org_id)`
11. `does not apply the rule to a new table with no org_id`

Items 7-11 are a consequence of item 6, not five independent problems. All 11
should clear once the composite FK is in place and the table is classified as
part of an approved A3c.

### Required before A3c can be applied

1. Replace the single-column `case_id` reference with the composite
   `(case_id, org_id) -> cases(id, org_id)`.
2. Classify `hr_review_clarifications` in `dataInventory.js` and
   `dataClassification.js`, and extend the counts and the attestation — the
   same work A3a needed, done as part of the slice rather than after it.
3. The separately recorded post-return adoption-ordering redesign.

---

## Status

- The TRUNCATE hardening is applied and verified; neither gap affected it.
- **A3a: resolved** in `cea800f`. Committed corpus is 103/103 green, and the
  full suite is 396 files / 8673 tests passing with lint unchanged at 154
  errors and 9 warnings.
- **A3c: open.** The candidate remains on HOLD, byte-unchanged at
  `2623aff7…`, and must not be applied until items 1-3 above are done.
- No test was modified, skipped or quarantined to produce a green run, and no
  unresolved problem in this document is claimed to be fixed.
