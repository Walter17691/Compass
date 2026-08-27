# Backup & Recovery (Controlled Beta baseline)

Phase 7, Gate 7. Verified against the real, live production infrastructure
this session — nothing below is assumed.

## What backup capability actually exists today: NONE

Confirmed via Supabase's own organization API (`get_organization`,
2026-08-27): the organisation (`Compass`, id `zecniayfgoatkgijiexc`) is on
the **Free plan**. Per Supabase's own current documentation:

- **No automatic daily backups.** Free-plan projects get none — Supabase's
  own guidance for Free-plan projects is "regularly export their data
  using the Supabase CLI `db dump` command and maintain off-site
  backups" — i.e. this is explicitly the account holder's own
  responsibility on this plan, not something Supabase does for you.
- **No Point-in-Time Recovery (PITR)** — PITR is a paid add-on available
  only on Pro/Team/Enterprise plans (from ~$100/month for 7-day
  retention), not available at all on Free.

**This means: right now, today, if a row (or a whole table) is
accidentally deleted or corrupted in the production database, there is
no built-in way to get it back.** This is the single most important
finding in this gate. It predates this session — nothing done as part of
Phase 7 caused it — but it is a genuine, serious gap to close before any
external organisation's real employee data goes into this database.

## Recommended action (a real cost decision — yours to make, not mine)

Upgrade the Supabase organisation to the **Pro plan** before external
beta starts. This alone gets 7 days of automatic daily backups included;
enabling the PITR add-on on top is a further decision once real usage
volume/risk tolerance is clearer, but the base Pro plan's daily backups
are the minimum safety net a product holding real HR case data should
have. This is a recurring cost (Pro starts at $25/month for the
organisation, separate from any PITR add-on) — flagging it for your
decision, not enacting it myself.

## Interim manual backup procedure (until upgraded)

Until Pro-plan backups are enabled, the only real protection is a manual
export, done by a human, on some regular cadence (weekly, at minimum,
more often once real customer data exists):

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

Each procedure below reflects the real no-PITR reality above — where
full recovery isn't currently possible without a prior manual export,
that's stated plainly rather than implied to be solved.

### 1. Accidental deletion

- **If a recent manual export exists**: restore the specific row(s) from
  it (`pg_dump` output is plain SQL — extract the relevant `INSERT`
  statements, or restore to a scratch database and copy just the
  affected rows across). This exact export → delete → restore → verify
  sequence was tested end-to-end this session (see "Verified recovery
  test" below) and works.
- **If no export exists covering the deleted data**: it is not
  recoverable today. This is the direct, practical cost of the Free-plan
  gap above.
- Note: referential integrity already blocks *some* accidental
  deletions outright — e.g. `organisations` cannot be deleted while any
  `employee_records` row still references it (confirmed live, this
  session) — which is a genuine, if incidental, safety net for
  whole-org deletion specifically. It does not help for smaller, more
  common deletions (a single case, a single team member).

### 2. Bad migration

- **Before applying to production**: apply it to the separate
  `compass-e2e-test` project first (Gate 3) and run the full test suite
  against it. This is now genuinely possible where it wasn't before this
  phase, and is the single best defence against this scenario.
- **After a bad migration has already run**: write and apply a
  corrective migration (the same pattern used for every schema change in
  this project) — safe for schema-only mistakes. If the bad migration
  also *destroyed data* (e.g. a botched `UPDATE`/`DELETE`), that data is
  subject to the same no-backup limitation as accidental deletion above.

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

## Verified recovery test (performed this session, against non-production infrastructure only)

Performed against `compass-e2e-test` (zdbbvljbndmujywtkwfy) — the
separate, non-production project from Gate 3 — using its own synthetic
test data. **Never performed against production.**

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
