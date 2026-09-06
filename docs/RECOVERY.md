# Backup & Recovery (Controlled Beta baseline)

Phase 7, Gate 7, originally written 2026-08-27 against a Free-plan
production project with no backup protection at all. Updated 2026-09-06
after the organisation was upgraded to Pro and a real managed backup was
independently verified — via direct Supabase Dashboard evidence (Database
→ Backups → Scheduled backups) — to actually be running, not merely
available on the plan.

## What backup capability actually exists today: Pro-plan managed daily backups, verified running

Confirmed via Supabase's own organization API (`get_organization`,
2026-09-06): the organisation (`Compass`, id `zecniayfgoatkgijiexc`) is now
on the **Pro plan**. Distinct from that plan-level fact, a real, completed
backup history was directly observed in the Dashboard — 8 consecutive
daily **physical** backups, one per calendar day, most recent completed
**06 Sep 2026 07:57:34 UTC** (the day this was checked), oldest visible
**30 Aug 2026** — a span consistent with the plan's documented 7-day
retention window, not just a promised number.

- **Automatic daily backups: confirmed active**, not merely "included on
  this plan." Supabase's own Dashboard states "Projects are backed up
  daily around midnight of your project's region and can be restored at
  any time" — and the 8-day unbroken daily history observed matches that
  exactly.
- **Retention: 7 days**, matching Pro-plan standard and confirmed
  observationally (the oldest entry visible was exactly 7 days before the
  newest — the correct rolling-window behaviour, not merely documented).
- **Restore mechanism: available**, not yet exercised against production.
  Each backup has an active "Restore" control; a separate
  "Restore to new project" flow also exists (still in beta on Supabase's
  side). **Restore is whole-project/whole-database only** — there is no
  native single-table or single-row restore. Recovering one organisation
  or one case still means: restore the whole backup into an isolated
  project, then manually extract and re-import just the affected rows —
  see "Accidental deletion" below. This is a real, working procedure, but
  a manual one — do not describe it to anyone as a one-click tenant
  restore.
- **Storage objects note (Supabase's own Dashboard caveat, not a Compass
  gap)**: "Database backups do not include objects stored via the
  Storage API." Compass has **no Supabase Storage usage at all** —
  evidence is stored inline as base64 content inside the `cases.evidence`
  jsonb column, a plain Postgres column like any other — so this caveat
  has zero practical effect on Compass today. Re-check this note if a
  real Supabase Storage bucket is ever introduced later.
- **Point-in-Time Recovery (PITR)**: available as a further paid add-on
  on top of Pro, **not currently purchased or enabled**. Classified P1,
  not P0 — daily backups alone already meet a ≤24-hour Recovery Point
  Objective, which is the launch requirement; PITR would only tighten
  that further, which isn't what stood between "unsafe" and "safe" for
  customer #1.

**Recovery Point Objective: ≤24 hours, now genuinely achievable** — the
maximum normal data loss after an incident is "since the last completed
daily backup," which the verified evidence above shows is never more than
about a day old.

## Interim manual backup procedure (supplementary, not the primary protection)

Managed daily backups are now the primary protection. A manual export
remains a reasonable supplementary practice — e.g. immediately before a
risky migration, or if you want an off-Supabase-infrastructure copy for
your own peace of mind — but is no longer the only thing standing between
Compass and unrecoverable data loss:

```
npx supabase db dump --db-url "<production connection string>" -f backup-$(date +%Y%m%d).sql
```

The connection string (with password) is in Supabase Dashboard → Project
Settings → Database → Connection string — treat the resulting `.sql`
file exactly like the database password itself: never commit it,
store it somewhere access-controlled and off Supabase's own
infrastructure (e.g. a private, encrypted cloud storage bucket), and
delete old copies per your own data-retention policy, since it's a full
copy of every customer's employee data.

## Recovery procedures

Each procedure below reflects the real, now-verified state above: a
genuine daily managed backup exists as the primary recovery source, but
restore is whole-project only — recovering anything narrower (one
organisation, one case, one row) is a manual isolated-restore-and-extract
procedure, not a native, one-click capability. That distinction is stated
plainly throughout rather than implied to be solved by the plan upgrade
alone.

### 1. Accidental deletion

- **Primary recovery source — the managed daily backup**: restore the
  most recent backup that predates the deletion into an isolated project
  (Supabase Dashboard → Database → Backups → Restore, or "Restore to new
  project"), then extract just the affected row(s)/table(s) from that
  restored copy and re-import them into production. This is a manual
  procedure — Supabase's restore itself recreates a whole database, not a
  single row — but it now has a real, dated backup to work from (verified
  live: 8 consecutive daily backups observed, latest completed the same
  day as verification).
- **If a more recent manual export also exists**: it can shortcut the
  same process (`pg_dump` output is plain SQL — extract the relevant
  `INSERT` statements directly, no restore-to-isolated-project step
  needed). This exact export → delete → restore → verify sequence was
  tested end-to-end against the separate `compass-e2e-test` project (see
  "Verified recovery test" below) and works — the same row-level
  extraction technique applies identically whether the source is a manual
  export or a row pulled out of a restored managed backup.
- **Maximum data loss for anything not covered by a more recent manual
  export**: bounded by the daily backup cadence — at most since the last
  completed backup, verified to be no more than about a day old.
- Note: referential integrity already blocks *some* accidental
  deletions outright — e.g. `organisations` cannot be deleted while any
  `employee_records` row still references it (confirmed live) — a
  genuine, if incidental, safety net for whole-org deletion specifically.
  It does not help for smaller, more common deletions (a single case, a
  single team member).

### 2. Bad migration

- **Before applying to production**: apply it to the separate
  `compass-e2e-test` project first (Gate 3) and run the full test suite
  against it — the single best defence against this scenario.
- **After a bad migration has already run**: write and apply a
  corrective migration (the same pattern used for every schema change in
  this project) — safe for schema-only mistakes. If the bad migration
  also *destroyed data* (e.g. a botched `UPDATE`/`DELETE`), that data is
  now recoverable via the same restore-to-isolated-project-and-extract
  procedure described under "Accidental deletion" above, using the most
  recent daily backup that predates the bad migration as the source.

### 3. Failed deployment

The one scenario with a genuinely solid answer already in place, no
gaps: Vercel keeps every previous deployment. Vercel Dashboard → project
→ **Deployments** → find the last known-good deployment → **"..." menu →
Promote to Production** (or `vercel rollback` via the CLI) reverts
production to that exact prior build in under a minute, with zero
database involvement — the database is a separate system from the
Vercel deployment and is untouched by a code rollback. Alternatively,
`git revert` the bad commit and push — CI (Gate 2) will catch a broad
class of regressions before it ever reaches Vercel again.

### 4. Compromised account/admin

1. **Contain immediately**: rotate every credential the compromised
   account could reach — Supabase service role key, `CRON_SECRET`,
   Vercel account/team tokens, GitHub access if applicable. Supabase
   Dashboard → Project Settings → API → regenerate the service role key;
   update `SUPABASE_SERVICE_KEY` in Vercel's env vars immediately after
   (the app will fail closed, not open, in the gap between rotation and
   redeployment — every `api/*.js` handler needs this key to do
   anything).
2. **Assess scope**: query `audit_log` for every action taken under the
   compromised account's identity since the suspected compromise window,
   and check `org_members` for any role/permission changes made in that
   window (a compromised HR-director account could grant itself/others
   elevated access).
3. **Revoke sessions**: Supabase Auth doesn't expose a single
   "kill all sessions for this user" button by default — the reliable
   method is to force a password reset for the account, which
   invalidates its existing refresh tokens.
4. **Communicate**: see `docs/INCIDENT_RESPONSE.md` (Gate 8) for the
   customer-communication decision framework — whether this needs
   disclosure depends on what the account could actually access, which
   step 2 establishes.

### 5. Suspected cross-tenant incident

1. **Verify isolation is actually intact right now**: run
   `tests/e2e/tenant-isolation.spec.js` against production data patterns
   (or, more safely, reproduce the suspected leak's exact conditions
   against the separate `compass-e2e-test` project first — Gate 3 made
   this possible without risking further production exposure while
   investigating).
2. **Audit the actual RLS policies** on every table the suspected leak
   touched — `pg_policies` for the affected table(s), comparing the
   `USING`/`WITH CHECK` clauses against what's expected (the same
   technique used to find and fix the real recursive `org_members`
   policy bug during Gate 3's own schema replication this session,
   proving this class of check is not theoretical).
3. **Query `audit_log` and PostgREST access patterns** for the affected
   org_id(s) to determine actual scope — which other org(s), if any,
   could see or did see the data.
4. **This is a genuine data-breach candidate** — see
   `docs/INCIDENT_RESPONSE.md`'s data-breach assessment section (Gate 8)
   rather than treating it as a pure engineering fix.

## Verified recovery test (performed against non-production infrastructure only)

Performed against `compass-e2e-test` (zdbbvljbndmujywtkwfy) — the
separate, non-production project from Gate 3 — using its own synthetic
test data, via a manual export/import, predating the Pro-plan upgrade.
**Never performed against production, and does not itself exercise the
managed-backup restore flow** (that flow was independently verified live
via Supabase Dashboard evidence — see the top of this document — not by
executing a real restore, which was correctly not performed against
production). What this test does prove, and remains directly relevant
now that managed backups are running: the same "extract just the affected
row(s) and re-import them" technique used here is exactly the manual step
needed after restoring a managed backup into an isolated project, so the
one part of the whole-project restore process that isn't native to
Supabase — the row-level extraction — has already been shown to work.

1. Exported the live row for `org_members` id `65ddd6e9-b0d2-4f64-911b-075191298306`
   (a real membership row: `Compass E2E Test Org 3`, user `E2E Test User 2`,
   role `hr_director`) via a direct `SELECT`.
2. Deleted it (`DELETE FROM org_members WHERE id = ...`).
3. Confirmed deletion: a follow-up `SELECT COUNT(*)` for that id returned `0`.
4. Restored it from the step-1 export via `INSERT`, preserving the
   original id, all field values, and the original `created_at`
   timestamp.
5. **Verified the restore was functionally complete, not just a raw row
   existing**: re-authenticated as the real test user and queried
   `org_members` through the actual RLS-scoped REST API (not a
   superuser bypass) — the restored membership was visible and complete,
   confirming the user's real access was genuinely restored, not just
   that a database row looked right.

**Result: PASS.** The manual export → delete → restore → verify cycle
described in the "Accidental deletion" procedure above is proven to
work, not just documented in theory.
