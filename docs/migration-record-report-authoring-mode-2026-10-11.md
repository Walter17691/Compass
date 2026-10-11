# Applied migration — persistent report authoring mode, 2026-10-11

Application record for the B3.2 migration that makes an investigation report
version state **how it was written** rather than having the editor guess from
its text.

This file exists because the SQL artefact cannot describe its own application
without ceasing to be the artefact that was approved. The SQL is the thing that
ran; this is the record of it running.

## The artefact

| | |
|---|---|
| File | `supabase/report_authoring_mode_2026-10-11.sql` |
| SHA-256 | `2f4e289023167962aa8257cffc7d898e8a2053b465b53c5987e0002463007f40` |
| Lines | 418 |
| Applied to | production Supabase project `npeegfsoijhdnnvuqjin` |
| Applied on | **2026-10-11** |
| Applied as | the file's own single `begin … commit`, verbatim and unedited |
| Result | **committed successfully, no error** |
| Baseline commit | `0a6f359dbbabae3b67b2ac94a590190d479c213b` |

The migration carries a drift guard inside its own transaction, asserting the
md5 of five function bodies — the two it replaces and three it depends on
without touching — before it changes anything. The guard **passed on all five**,
so the migration applied against exactly the state it was written against. Had
any body differed, the transaction would have raised and applied nothing.

## WHY THE SQL HEADER STILL SAYS "NOT APPLIED"

Line 3 of the artefact reads `Candidate migration. NOT APPLIED.` **That is left
untouched deliberately, and it is not an oversight.**

The approval chain for this change identifies the artefact by its SHA-256.
`2f4e2890…` is the hash of the bytes that were reviewed, probed, approved and
executed. Editing the header — even to make a true statement truer — produces a
different file with a different hash, and the record of what ran would no longer
match anything that exists. The authorisation was for *those bytes*.

So the artefact is preserved as a historical record of what was approved, and
the fact of its application lives here instead. **Read the header as "not
applied at the time this file was written", because that is what it meant.**
Every migration under `supabase/` is a record of an intent that has already been
carried out; this is the first one whose header says so explicitly enough to
need the explanation.

## What changed in the database

Three things, and nothing else.

1. **`investigation_report_versions.authoring_mode`** — new `text` column,
   **nullable**, with a CHECK permitting `NULL`, `'structured_sections'` or
   `'single_document'`.

   Nullable on purpose. `NULL` means *not recorded*, which is a true thing to
   say about every version written before this date and is never inferred
   afterwards. The column does not invent history.

2. **`investigation_report_versions_immutability_guard`** — now names
   `authoring_mode` among the columns an `UPDATE` may not change. The guard
   enumerates protected columns by name, so a new column is unprotected until
   listed.

3. **`save_investigation_report_version`** — **dropped at six arguments and
   recreated at seven.** `CREATE OR REPLACE` cannot add a parameter: it creates
   a second overload, and the existing six-argument call then raises `42725`
   *function … is not unique*. Proven on this database rather than assumed. The
   drop and the create are in one transaction, so there is no window in which
   only half is true. `DROP` takes the function's ACL with it, so the grants are
   reissued in the same transaction.

   The RPC now **refuses** a missing, `NULL`, blank or unrecognised mode
   (`22023`). Nothing is inferred server-side and nothing defaults to
   `structured_sections`. The mode also joins the request digest, so two
   requests differing only in mode can no longer share a digest and be answered
   as replays of one another.

### Function hashes

| Function | Before | After |
|---|---|---|
| `save_investigation_report_version` | `afc33c77086466f514513e8dee00531a` (6 args) | **`fb626a16d73a3470f48f02510a2df730`** (7 args) |
| `investigation_report_versions_immutability_guard` | `fcbaf3bcd9dd26469a5d141d4b2962d1` | **`d72e56ce2bf9eb945f3977a6b1892503`** |

Use the *after* pair as the drift-guard baseline for any future migration.

### Functions deliberately NOT touched, verified unchanged by md5

| Function | md5, before and after |
|---|---|
| `adopt_investigation_report_version` | `fb45b6388323936ce8e405614ecc2882` |
| `investigation_report_versions_author_guard` | `c25056999f07a5d789a1ec0034e9204e` |
| `assign_investigation_report_version_no` | `fc76a8f6adb17d4f40c2e988143062d0` |
| `log_audit_event` | `2a4134eda9d7049d774852e8d41f3e3e` |

**The adoption RPC is unchanged.** Adoption behaviour, HR Review submission and
stage progression are untouched by this migration.

## Post-application verification

### Structure

| Check | Result |
|---|---|
| Save RPC overloads | 1 — no ambiguity |
| Signature | `(uuid, text, uuid, integer, text, text, text)` |
| Six-argument overload remaining | none |
| `SECURITY DEFINER` / owner / `search_path` | `true` / `postgres` / `public` |
| EXECUTE grants | `postgres`, `authenticated`, `service_role` — identical to pre-migration |
| `anon` EXECUTE | **none** (`has_function_privilege` = false) |
| Schema | 46 tables / 84 functions / 98 policies — unchanged |
| `investigation_report_versions` | 19 columns / 6 indexes / 2 policies |
| Policy shape | INSERT RESTRICTIVE + SELECT PERMISSIVE — unchanged |

The function count stays at **84** across a drop-and-create, which is the
signature of a correctly atomic swap: one left, one arrived, in one
transaction. A failed create would have left 83 and no save RPC at all.

`service_role` retains EXECUTE, but not because this migration granted it —
`pg_default_acl` on `public` grants EXECUTE to `anon`, `authenticated` and
`service_role` on every newly created function, applied at `CREATE` time before
any explicit grant runs. The migration grants only `authenticated` and revokes
`anon`. The resulting ACL is therefore byte-identical to the function it
replaced, and the RPC refuses a `service_role` caller at runtime anyway
(`42501`): a report must be authored by a signed-in human.

### Behaviour, proven by rolled-back probe against the applied function

Run in the authorised synthetic organisation
`f381bfa6-7b27-497f-9af7-46a82c8f8f4c`, in `begin … rollback`, leaving nothing.

| Probe | Result |
|---|---|
| Old six-key call shape | `22023` — the provenance sentence, not a missing function |
| `structured_sections` | saved, v1 |
| Mode `NULL` / blank | `22023` (both) |
| Mode `'freeform'` | `22023` *Unknown authoring mode* |
| `single_document` | saved, v2 |
| Exact replay | returned v1, no second row |
| Same request id, different mode | `22023` |
| Stale base version | `40001` `STALE_EDITOR` |
| HR exception with written reason | saved, v3 |
| Cross-tenant actor | `42501` |
| `service_role` caller | `42501` |
| Owner `UPDATE` of `authoring_mode` | `23514` — immutability holds |
| Direct `INSERT` as `postgres` | `42501` — the author guard holds even past RLS |

The audit trail reads, in order: *written as seven guided sections* · *written
as one document (changed from seven guided sections)* · *saved by HR rather
than the assigned investigator. Reason: … , written as one document*. A change
of mode is auditable **as a change**, not only as two rows a reader must
compare.

### Tenant integrity — nothing moved

| | |
|---|---|
| Report versions | **0** |
| Draft-save audit events | **0** |
| Protected UAT case `065d5a28-54a0-47f0-99a3-3ecb13f180bf` | digest `f45c8df767016d829ac4115968d8930e` unchanged |
| Compass LTD `dbe871c5-e6fe-45d8-8bc4-201e487579be` | 9 cases / 8 employee records / 475 audit rows / 2 members; case digest `6cdb57f65bbf11400787a11f796d5bd4`; last write still 2026-10-03 |
| Legacy reports (`cases.investigation_report`) | 50 preserved |
| HR Review requests | 139 preserved |
| DSAR requests | 140 preserved |
| Immutable finding revisions | 4 preserved |
| cases / allegations / case_access / `auth.users` | 2963 / 950 / 202 / 6 unchanged |

## Draft saving is still off

This migration changes what a save must *say*; it does not make saving
reachable. `REPORT_DRAFT_SAVE_ORG_ALLOW_LIST` in
`src/lib/reportDraftActivation.js` is `Object.freeze([])` and no organisation —
including the E2E organisations — is listed. Zero report versions have ever
been written, and zero draft-save audit events have ever been recorded.

The migration belongs **before** activation precisely because production holds
no versions yet. After activation, the first real versions would be the ones
unable to say how they were written, which is the problem this change exists to
end.

## Rollback

Clean **only while `investigation_report_versions` is empty**, which it is. The
four steps are recorded in the artefact itself, including the part that is easy
to get wrong: dropping the column and constraint is clean, but the two replaced
function bodies do not come back on their own, and a rollback that forgets them
leaves no save RPC at all.

Once any version records a mode, **rollback destroys provenance** and the only
safe direction is forward.
