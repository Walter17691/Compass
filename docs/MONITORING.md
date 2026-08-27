# Monitoring (Controlled Beta baseline)

Phase 7, Gate 6. This is deliberately **not** an enterprise observability
platform — Compass is small enough that the right architecture is "know
exactly which existing dashboard to check for each failure category,
plus one new health endpoint for the two things nothing else already
answers." Everything below either already exists (Vercel/Supabase/Resend/
Stripe all ship their own monitoring — this doc just says where to find
it) or is the one new piece: `/api/cron/health`.

## The new health endpoint

`GET https://<your-domain>/api/cron/health` — public, no auth required
(so an external uptime monitor can poll it with nothing but the URL),
presence-only (never returns a secret value). Returns:

```json
{
  "ok": true,
  "checkedAt": "2026-08-27T16:00:00.000Z",
  "tookMs": 140,
  "database": { "ok": true, "latencyMs": 120 },
  "config": { "SUPABASE_SERVICE_KEY": true, "...": "..." },
  "missingCritical": []
}
```

`ok:false` (HTTP 503) means either the database is unreachable, or a
*critical* var (`SUPABASE_SERVICE_KEY`, `CRON_SECRET`) is missing —
either would break the app for every user, not just one integration.

**Recommended setup (5 minutes, no cost):** point a free external uptime
monitor (e.g. UptimeRobot, Better Uptime's free tier, or any HTTP-check
service) at this URL on a 5-minute interval, alerting on a non-200
response. This is the "someone tells me when it's down" piece Compass
didn't have at all before — do this before external beta starts.

## Where to look for each failure category

| Category | Where | Notes |
|---|---|---|
| **Supabase/database availability** | `/api/cron/health` (above) + [Supabase Dashboard → Reports](https://supabase.com/dashboard) for the project | Health endpoint is the fast check; the dashboard has real historical graphs (CPU, connections, disk). |
| **API/server errors** | Vercel Dashboard → your project → **Logs** (or `Runtime Logs`/`Errors` tabs), filterable by status code/path | Every `api/*.js` 500 lands here automatically — no setup needed, already on by default. |
| **Email failures** | [Resend Dashboard → Logs](https://resend.com/emails) | Shows every send attempt with delivery status (delivered/bounced/complained). `RESEND_API_KEY` presence is checked by `/api/cron/health`'s config block, but an actual send failure only shows up here, not in Compass's own logs unless the calling code also logs it (most send call sites already do, via `console.error`, visible in Vercel Logs too). |
| **Calendar/integration failures** | Vercel Logs, filtered to `/api/calendar/*`, `/api/graph-mail/*` | OAuth token-exchange failures, calendar create-event failures — all go through these routes and are logged. |
| **Signature failures** | Vercel Logs, filtered to `/api/signing`, `/api/send-for-signature`, `/api/portal/*` | Same as above — server-side signing/notification errors are logged there. |
| **AI failures** | Vercel Logs, filtered to `/api/chat` | A Claude API failure (rate limit, outage) surfaces as a non-200 from this route. |
| **Scheduled-job failures** | Vercel Dashboard → project → **Cron Jobs** tab (shows registration status + last-run history) + Vercel Logs filtered to `/api/cron/*` | Root cause of the cron's own silence found and fixed this gate (see below) — still worth a one-time manual confirmation that Vercel's scheduler is actually registered and invoking it now. |
| **Deployment failures** | Vercel Dashboard → project → **Deployments** (or GitHub Actions' own CI status) | A failed build shows as a red deployment; CI's `checks` job (Gate 2) already fails a PR before it can even reach Vercel for most classes of break. |
| **Authentication anomalies** | Supabase Dashboard → **Authentication → Logs** | Repeated failed sign-ins, unusual signup patterns. Compass itself doesn't add anomaly *detection* on top of this — flagged as a genuine gap, not a false claim of coverage; revisit if beta usage shows a real need. |

## Root cause found and fixed: the cron (and any future serverless import of `src/lib`) was silently crashing

Confirmed via Vercel's runtime logs (`get_runtime_logs`, 14-day window):
`/api/cron/digest` had zero recorded invocations despite `vercel.json`
declaring it correctly and `CRON_SECRET` being configured. Deploying
this gate's own new `/api/cron/health` endpoint — which transitively
imports the same `src/lib` module graph the digest cron does —
immediately reproduced the real cause live:

```
Error [ERR_MODULE_NOT_FOUND]: Cannot find module '/var/task/src/lib/meetingTypeMatch'
imported from /var/task/src/lib/caseStage.js
```

`src/lib` has always used extension-less relative imports throughout
(`from './meetingTypeMatch'` rather than `'./meetingTypeMatch.js'`) —
harmless under Vite's own bundler, which the React app itself always
goes through, but a hard crash under Node's strict native ESM resolver,
which is what Vercel's serverless function runtime actually uses. Any
`api/*.js` route that transitively imports from `src/lib` — the digest
cron via `lib/deadlines.js` → `lib/caseStage.js`, and potentially others
— was silently exposed to this the moment its own import chain reached
an affected file, which is almost certainly *why* the digest cron never
successfully ran even on the (likely rare) occasions Vercel's scheduler
did invoke it.

**Fixed**: all 69 extension-less relative imports across 41 files in
`src/lib` now include their `.js` extension. Verified directly (not just
"the build succeeded") by importing every one of the 9 real serverless
entry points under real Node ESM resolution — `node -e "import('./api/cron/[...action].js')"` and the same for every other route — all
resolve cleanly now, which they did not before this fix.

**Still worth a one-time manual check**: fixing the crash doesn't by
itself prove Vercel's cron *scheduler* is registered and actually
invoking the route on schedule — visit Vercel Dashboard → your project →
**Settings → Cron Jobs** to confirm `/api/cron/digest` is listed with a
recent successful run. If it's still not listed at all, a fresh
production deployment usually re-registers it (crons register on
deploy).

## Explicitly out of scope for this gate

- Automated alerting beyond the one external uptime-monitor recommendation above (e.g. PagerDuty-style on-call routing) — not appropriate at controlled-beta scale.
- A live AI/email/Stripe "send a real test" health check — deliberately not built into `/api/cron/health`, since polling it frequently would cost real money/quota; presence-only config checking is the safe middle ground.
- Authentication anomaly *detection* (rate-based alerting on failed logins) — flagged above as a real gap, not silently covered.
