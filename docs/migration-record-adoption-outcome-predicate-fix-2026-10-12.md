# Applied migration — adoption outcome predicate correction, 2026-10-12

## The artefact

| | |
|---|---|
| File | `supabase/adoption_outcome_predicate_fix_2026-10-12.sql` |
| SHA-256 | `2bbce8b3b1cd06bf6e48802ac245dc85345e6ba4a39202885077089950df6bd2` |
| Lines | 336 |
| Project | **`npeegfsoijhdnnvuqjin` — "Compass", PRODUCTION** |
| Applied | **2026-10-12, immediately before 10:56:01Z**, once, single transaction, no error |
| Order | **1 of 3** |
| Result | committed; guard passed, in-migration verify passed, 21 independent post-checks passed |

## What it changed

**One expression.** `adoption_stage_block_reason`'s outcome branch:

```
-  when p_outcome is not null
+  when coalesce(btrim(p_outcome), '') <> ''
```

Proven minimal before application by replacing the function in a rolled-back
transaction and diffing normalised bodies: **one executable line removed, one
added, 26 → 26 lines, 0 other functions changed.**

md5 `4838cfcd75defffeae0676d314c46556` → **`33236db9e1cdc432ca2615fe3f28d71a`**

## The defect

`adoption_stage_block_reason` is the SQL translation of `inferDisciplinaryStage`
in `src/lib/caseStage.js`. One branch was mistranslated:

```
JS    const hasOutcome = !!cs.outcome || hasLetterType(meetings, 'outcome');
SQL   when p_outcome is not null then 'an outcome has already been recorded'
```

`!!''` is FALSE in JavaScript. `'' is not null` is TRUE in SQL. The two agree on
every value except the one that occurs: `cases.outcome` has no column default
and the application writes the empty string, so production held `''` on 2825 of
2963 rows and NULL on none. The branch fired for every case, and
`adopt_investigation_report_version` consults it, so **no investigation report
could be adopted on any case in production.**

## Preflight evidence

40 checks, all PASS, including: file SHA match; 12 live function hashes; Compass
LTD and the protected UAT case present; `platform_admins` = 1; 0 activations; 0
versioned cases; UAT digest `f45c8df767016d829ac4115968d8930e`; Compass LTD
9/8/475/2 with both last-write timestamps exact to the second; HR review
distribution `approved=20, pending=119`; 47 tables / 99 policies / 72 triggers;
`anon`/`authenticated` TRUNCATE 0/0; **and the defect itself still measurable at
2963 of 2963 cases blocked.**

## Post-conditions (verified independently of the migration's own block)

| | |
|---|---|
| Eligible cases | **0 → 2562** |
| Eligible at stage `inv_report` | **49 of 49** |
| NULL / `''` / whitespace outcome | no longer blocks |
| Genuine outcome | still blocks |
| "Disciplinary Appeal" | still read as an appeal, not a disciplinary hearing |
| Non-array jsonb guard | intact |
| Identity | `secdef=false vol=i lang=sql owner=postgres cfg=search_path=public` — unchanged |
| ACL | `postgres=X \| anon=X \| authenticated=X \| service_role=X` — unchanged |
| Rows written | none; 2963 / 0 / 139 / 17055 unchanged |
| Objects | 47 tables / 99 policies / 72 triggers — unchanged |

Still blocked, correctly: disciplinary 158, closed 106, outcome 68, later stage
68, outcome letter 1 (= 401; 2562 + 401 = 2963).

## Deviations

None. The file was applied as approved, verbatim.

## Recorded, not fixed here

* `anon` holds EXECUTE on this function. Pre-existing; belongs with the broader
  anon-privilege hardening, not with a correctness fix.
* `letterType = ''` diverges from the JS in the permissive direction. 0 live
  occurrences.
* `cases.outcome` has no column default while the application writes `''`.
  Normalising the column would remove this class of defect rather than this
  instance; out of scope here.

## Rollback

Re-apply the recorded body to restore `4838cfcd75defffeae0676d314c46556`. Note
what that restores: adoption becomes impossible on every case again.

## Cross-reference

This migration is **absent from `supabase_migrations.schema_migrations`** — it was applied through `execute_sql`, not `apply_migration`, as were all migrations since 2026-10-09. The timestamp above is the observation time of the verification query that followed the application, not a ledger timestamp, and it is not independently auditable. See `docs/outstanding-migration-ledger-gap-2026-10-12.md`; do not run `supabase db push` or `db reset` against this project until that is resolved.
