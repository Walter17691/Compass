import { CONFIG_VARS } from '../_configVars.js';
import { supabaseRequest } from './_supabase.js';

// Phase 7 (Controlled Beta Infrastructure Gate 6) — the beta-appropriate
// monitoring baseline this app didn't have at all before: one public,
// unauthenticated, safe endpoint an external uptime monitor (or anyone)
// can poll to ask "is Compass fundamentally alive" without needing a
// stored secret. Deliberately NOT an enterprise observability platform —
// no live send-a-test-email/AI-call checks here (those cost real money
// and quota on every poll, and Resend/Anthropic/Stripe/Graph failures are
// each already visible in their own provider dashboards — see
// docs/MONITORING.md for exactly where to look for each of this app's
// real failure categories). This endpoint answers only the two things
// nothing else already answers for you: is the database actually
// reachable right now, and which required integrations are configured at
// all in this environment — both presence-only, no secret values, safe
// to expose publicly and safe to poll frequently.
export async function health(req, res) {
  const startedAt = Date.now();
  let database = { ok: false, latencyMs: null };
  try {
    const dbStart = Date.now();
    const r = await supabaseRequest('organisations?select=id&limit=1');
    database = { ok: r.ok, latencyMs: Date.now() - dbStart };
  } catch {
    database = { ok: false, latencyMs: null };
  }

  const config = {};
  for (const v of CONFIG_VARS) {
    config[v.name] = typeof process.env[v.name] === 'string' && process.env[v.name].length > 0;
  }
  const missingCritical = CONFIG_VARS.filter(v => v.critical && !config[v.name]).map(v => v.name);

  const ok = database.ok && missingCritical.length === 0;
  res.status(ok ? 200 : 503).json({
    ok,
    checkedAt: new Date().toISOString(),
    tookMs: Date.now() - startedAt,
    database,
    config,
    missingCritical,
  });
}
