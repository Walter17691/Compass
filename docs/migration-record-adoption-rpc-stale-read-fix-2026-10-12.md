# Applied migration — adoption RPC stale-read correction, 2026-10-12

## The artefact

| | |
|---|---|
| File | `supabase/adoption_rpc_stale_read_fix_2026-10-12.sql` |
| SHA-256 | `bc15d791f87fe0a27f572867188c34226b45095df474ebedba7f6ec39013a212` |
| Lines | 411 |
| Project | **`npeegfsoijhdnnvuqjin` — "Compass", PRODUCTION** |
| Applied | **2026-10-12, immediately before 11:03:19Z**, once, single transaction, no error |
| Order | **3 of 3** |
| Result | committed; drift guard passed, in-migration verify passed, 22 independent post-checks passed |

One `create or replace function` on `adopt_investigation_report_version`.
No table, policy, trigger or privilege changed.

md5 `fb45b6382b6bdf0d0d0e4e8dd3df9dd6` → **`001d0f7cd86ce6cbbb21b6f15ae43f13`**

## The defect

Found by the two-session local harness, in a test written to prove the *mutex*
was sound — the mutex was sound; the RPC's own error reporting was not.

The original body read the version row **once**, with `FOR UPDATE`:

```
select v.* into v_row from public.investigation_report_versions v
 where v.id = p_version_id for update;
if v_row.adopted_at is not null then
  raise exception 'That investigation report version is already adopted';
```

Two sessions adopting the same version concurrently both block on that
`FOR UPDATE`. The loser resumes **after** the winner commits, and
`FOR UPDATE` re-reads the row at the newest version, so `v_row.adopted_at` is
now populated. The loser is correctly refused — but told the version was
*already* adopted, which was false when it started. A user who clicked once, at
a moment when adoption was genuinely available, is told they did something they
did not do. Worse, the message is indistinguishable from the genuine
already-adopted case, so the correct remedy (reload and look at who adopted it)
is never suggested.

This is a reporting defect, not a correctness defect: the refusal itself was
always right. It is recorded as a separate migration because it is a separate
claim, and because conflating it with A3c would have put a 411-line change
inside a 1406-line one.

## The correction

Read `adopted_at` **before** taking any lock, then take the case mutex, then
re-read under `FOR UPDATE` and compare the two:

```
select v.case_id, v.adopted_at into v_case_id, v_pre_adopted_at
  from public.investigation_report_versions v where v.id = p_version_id;
if v_case_id is null then
  raise exception '… does not exist' using errcode = '23503';
end if;

perform 1 from public.cases where id = v_case_id for update;   -- the mutex

select v.* into v_row from public.investigation_report_versions v
 where v.id = p_version_id for update;
…
if v_row.adopted_at is not null then
  if v_pre_adopted_at is not null then
    raise exception 'That investigation report version is already adopted'
      using errcode = 'check_violation';
  end if;
  raise exception 'That investigation report version was adopted by someone '
    'else a moment ago. Reload the case to see the adopted report.'
    using errcode = 'check_violation';
end if;
```

Three properties worth naming:

* The **pre-read is deliberately unlocked**. Its only job is to record what the
  caller could have known when they acted. Locking it would destroy the
  distinction it exists to draw.
* The **existence check moved ahead of the mutex**, raising `23503` for an
  unknown id rather than silently taking a lock on a NULL `case_id` and
  returning a confusing refusal.
* The **mutex is taken on `cases` first**, matching all 7 A3c lifecycle
  functions. Without this the RPC would lock the version row before the case
  row while A3c's recorder locks the case row before the version row — a
  textbook lock-order inversion between two functions that run on the same
  click. This is the reason the two migrations had to be applied in this order
  and why this one could not be merged into A3c's file without also merging
  their drift guards.

Both branches use `errcode = 'check_violation'` (23514), so the existing client
error mapping is unchanged and no application deployment is required for the
refusal to be handled; only the message text the user sees differs.

## Concurrency evidence

Two independent local sessions, both acquisition orders:

| | |
|---|---|
| Two sessions adopt the same version | one commits; loser refused `23514` with **"adopted by someone else a moment ago"** |
| Adopt a version already adopted in a prior transaction | refused `23514` with **"is already adopted"** — the two messages are distinguishable |
| Unknown version id | `23503`, no lock taken |
| Two sessions adopt **different** versions of the same case | serialised by the mutex, both commit, 0 `case_seq` duplicates |
| Adoption vs HR return, both orders | both commit; **no `40P01`** |
| Positive control (deliberate inversion) | `40P01 deadlock detected` — the harness can see one |

## Preflight evidence

The 40-check preflight recorded in the sibling records, plus: the live body md5
matched `fb45b6382b6bdf0d0d0e4e8dd3df9dd6` exactly before application, so the
file's own drift guard was genuinely exercised rather than bypassed; 0 report
versions and 0 adoptions exist, so **no live adoption state could be disturbed
by this change**; M1 and M2 already applied and verified.

## Post-conditions (verified independently)

New md5 `001d0f7cd86ce6cbbb21b6f15ae43f13`; identity unchanged
(`secdef=true vol=v lang=plpgsql owner=postgres cfg=search_path=public`); ACL
unchanged — `authenticated` holds EXECUTE, **`anon` does not**; the case mutex
present and taken before the version lock; the pre-read present and unlocked;
both distinct refusal messages present; `23503` path present; no advisory lock;
`adoption_stage_block_reason` still consulted, so M1's fix remains in force
through this path; 0 rows written; 0 versions and 0 adoptions still; tables 49 /
policies 101 / triggers 78 unchanged from M2.

Row 7 of my own verification table printed `*** CHECK ***`. That was a defect in
**my expected value**, not in the migration: I had pre-guessed the post-apply
md5 as `51b3fb0d…` while writing the check script, and a hash cannot be
predicted from source text. Row 1 independently confirmed the body changed from
the recorded pre-apply hash to `001d0f7c…`, and the structural checks confirmed
*what* changed. Recorded here rather than quietly corrected.

## Deviations

None in the application. One deviation in my verification script, described
immediately above.

## Rollback

Re-apply the recorded pre-apply body to restore
`fb45b6382b6bdf0d0d0e4e8dd3df9dd6`. Note what that reintroduces: a lock-order
inversion against A3c's lifecycle recorder. **This migration must not be rolled
back while A3c remains applied.**

## Cross-reference

This migration is **absent from `supabase_migrations.schema_migrations`** — it was applied through `execute_sql`, not `apply_migration`, as were all migrations since 2026-10-09. The timestamp above is the observation time of the verification query that followed the application, not a ledger timestamp, and it is not independently auditable. See `docs/outstanding-migration-ledger-gap-2026-10-12.md`; do not run `supabase db push` or `db reset` against this project until that is resolved.
