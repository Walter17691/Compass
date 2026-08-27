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
| **Scheduled-job failures** | Vercel Dashboard → project → **Cron Jobs** tab (shows registration status + last-run history) + Vercel Logs filtered to `/api/cron/*` | **Known issue found during this gate (2026-08-27): the daily digest cron shows zero invocations in Vercel's runtime logs across a 14-day window**, despite being correctly declared in `vercel.json` with `CRON_SECRET` configured. This needs the manual check below — it is not something `/api/cron/health` can diagnose (a health poll doesn't tell you whether the *cron scheduler itself* is invoking that route). |
| **Deployment failures** | Vercel Dashboard → project → **Deployments** (or GitHub Actions' own CI status) | A failed build shows as a red deployment; CI's `checks` job (Gate 2) already fails a PR before it can even reach Vercel for most classes of break. |
| **Authentication anomalies** | Supabase Dashboard → **Authentication → Logs** | Repeated failed sign-ins, unusual signup patterns. Compass itself doesn't add anomaly *detection* on top of this — flagged as a genuine gap, not a false claim of coverage; revisit if beta usage shows a real need. |

## Manual action required: investigate the cron

Confirmed via Vercel's runtime logs (`get_runtime_logs`, grouped by
`requestPath`, 14-day window): `/api/cron/digest` has **zero** recorded
invocations, though `vercel.json` declares `{ "path": "/api/cron/digest",
"schedule": "0 7 * * *" }` and `CRON_SECRET` is configured. The account
is on Vercel's **Hobby** plan, which does support once-daily cron jobs
(the schedule here is within Hobby's limits — this is not a plan-tier
block), so the cron *should* be running.

Steps to diagnose (Vercel dashboard access needed — not fully
diagnosable via API from here):
1. Vercel Dashboard → your project → **Settings → Cron Jobs**. Confirm
   `/api/cron/digest` is actually *listed* as registered, and check its
   own last-run timestamp/status shown there.
2. If it's not listed at all: trigger a fresh production deployment
   (crons are (re-)registered on deploy) and check again.
3. If it's listed but shows failed/no runs: re-check `CRON_SECRET` in
   Vercel's env var UI for stray whitespace or a trailing newline — a
   common, easy-to-introduce cause of Vercel's own cron-auth header not
   matching.
4. As a manual workaround in the meantime, `/api/cron/digest` can be
   triggered by hand with `curl -H "Authorization: Bearer $CRON_SECRET"
   https://<your-domain>/api/cron/digest` to confirm the handler itself
   still works correctly (it does — verified via direct code review this
   session; the issue is specifically about the *scheduler* invoking it,
   not the handler's own logic).

## Explicitly out of scope for this gate

- Automated alerting beyond the one external uptime-monitor recommendation above (e.g. PagerDuty-style on-call routing) — not appropriate at controlled-beta scale.
- A live AI/email/Stripe "send a real test" health check — deliberately not built into `/api/cron/health`, since polling it frequently would cost real money/quota; presence-only config checking is the safe middle ground.
- Authentication anomaly *detection* (rate-based alerting on failed logins) — flagged above as a real gap, not silently covered.
