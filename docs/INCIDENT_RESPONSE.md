# Incident Response Runbook (Controlled Beta baseline)

Phase 7, Gate 8. Concise and operational by design — this is a runbook
for the person on call at 2am, not a policy document. Matters requiring
UK GDPR/legal confirmation are marked **[LEGAL]** throughout; nothing in
this document invents a specific legal deadline — where UK GDPR imposes
one, get it confirmed by a data protection professional before acting on
a number you saw in a document like this rather than from them directly.

## Severity levels

| Level | Meaning | Example |
|---|---|---|
| **SEV1** | Real customer data exposed, corrupted, or lost; or the app is down for all users | Cross-tenant data leak; production database unreachable; a customer's employee records deleted with no recovery path |
| **SEV2** | A single integration or feature is broken; no data exposure/loss | Email sending down (Resend outage); calendar sync broken; signing workflow failing |
| **SEV3** | Degraded but working; cosmetic or non-blocking | Slow page loads; a non-critical UI bug |

Severity can change as you learn more — start conservative (assume
higher severity until you've confirmed otherwise), downgrade once the
actual scope is known, never the other way round.

## Containment (do this first, before investigating root cause)

The goal of containment is to stop things getting worse while you figure
out what happened — not to fix the underlying cause yet.

- **Suspected compromised credential**: rotate it immediately (see
  `docs/RECOVERY.md`'s "Compromised account/admin" procedure for the
  exact steps — Supabase service key, `CRON_SECRET`, Vercel tokens).
  Rotating first and investigating scope second is the right order —
  every minute a compromised credential stays live is more exposure.
- **Suspected cross-tenant leak**: this is not something to "watch and
  see" — if a specific RLS policy is confirmed broken, fix that policy
  immediately (following the exact live-verification technique used
  during Gate 3 this session: compare the policy's actual `pg_policies`
  definition against what it should be). Don't wait for a full
  investigation to close an open hole.
- **Bad deployment causing active harm**: roll back immediately via
  Vercel's Promote-to-Production on the last known-good deployment
  (`docs/RECOVERY.md`, "Failed deployment") — this is fast (under a
  minute) and safe to do before understanding exactly what went wrong.
- **Active data-destroying process** (a runaway script, a bad migration
  mid-execution): stop it running before anything else — a slightly
  incomplete migration is easier to reason about and fix than the same
  one left running unattended while you investigate.

## Escalation

Controlled beta scale — this is a solo/small-team operation, not a
24-person on-call rotation. The realistic escalation path:

1. **You** (the person who noticed or was paged) triage severity and
   begin containment immediately, without waiting for anyone else.
2. **SEV1** → tell the founder/decision-maker as soon as containment is
   underway, not only once it's fully resolved — they need to know a
   customer-data incident is happening in case a business decision
   (pausing signups, proactive customer contact) is needed before
   engineering work finishes.
3. **Anything touching real customer data** (SEV1 by definition above)
   → **[LEGAL]** loop in whoever handles data protection/legal for the
   business before any customer communication goes out, not after.

## Evidence preservation

Before fixing anything that would destroy evidence of what happened:

- **Capture `audit_log` entries** for the relevant time window and
  affected org/user ids — export via SQL (`SELECT * FROM audit_log
  WHERE ... `) to a file *before* any cleanup/rollback that might age
  out or complicate later querying.
- **Capture Vercel runtime logs** for the incident window
  (`get_runtime_logs` with an explicit time range, or the dashboard's
  own log export) — Vercel's own log retention is limited, so do this
  promptly, not "eventually."
- **Capture the exact deployment/commit SHA** that was live during the
  incident (`vercel.com` → Deployments, or `git log`) — needed to
  reconstruct exactly what code ran.
- **Do not** run destructive recovery actions (restoring from a backup,
  deleting affected rows) before the above capture is done, unless
  containment (above) genuinely requires it first — if it does, capture
  what you can beforehand even if incomplete, and note in your own
  incident notes exactly what was and wasn't captured before the
  destructive step, and why.

## Customer communication — decision points

Not every incident warrants proactive customer contact; over-notifying
erodes trust in future genuine notifications as much as under-notifying
does. Use these as decision points, not a rulebook:

- **Did any other customer's data become visible to someone who
  shouldn't have seen it?** (cross-tenant leak, even briefly) →
  **[LEGAL]** — this is very likely a notifiable event under UK GDPR;
  confirm scope and obligations before deciding whether/how to notify,
  don't decide this alone.
- **Was any customer's own data lost or corrupted with no recovery
  path?** → they need to know, directly, as soon as you can tell them
  accurately what was lost — vague "we had an incident" messaging is
  worse than a specific, honest account once you have one.
- **Was the app down/degraded but no data was exposed or lost?** →
  usually a status update (even a simple one) is enough; proactive
  1:1 outreach isn't automatically required, use judgement based on how
  long/severe the outage was.
- **Whatever you decide to send**: [LEGAL] should review customer-facing
  breach/incident communications before they go out whenever the
  incident involves real personal data, not just for the notification
  decision itself.

## Data-breach assessment **[LEGAL]**

A "data breach" under UK GDPR is broader than "a hacker got in" — it
includes accidental disclosure, loss, or unauthorised access to
personal data, which covers several of this document's own scenarios
(a cross-tenant leak, a lost/corrupted record with no recovery, a
compromised admin account with access to employee data). This document
does **not** state specific notification deadlines or thresholds —
get those confirmed by whoever handles data protection for the
business before acting on assumptions. What you *can* do immediately,
without waiting for that confirmation, is gather exactly the facts
they'll need to make that call quickly:

- What personal data was involved (which fields, whose records, how many people)
- Whether it was accessed, or only exposed with no evidence of actual access
- The time window it was exposed/accessible for
- What's already been done to contain it

## Recovery

See `docs/RECOVERY.md` for the actual recovery procedures (accidental
deletion, bad migration, failed deployment, compromised account,
cross-tenant incident) and — importantly — for the current real
limitation that production has no automated backups or PITR (Free-plan
Supabase, verified this session), so "recovery" for a pure data-loss
incident may not be fully possible until that's addressed.

## After the incident

A short retrospective (what happened, what was done, what would prevent
recurrence) is worth writing while it's fresh, even briefly — this
runbook itself should be updated if the incident revealed a gap in it.
