#!/usr/bin/env node
// Phase 6.5 — deployment pipeline hardening (Prompt 13, §5). Reports
// which environment variables this app expects and whether each is
// currently configured in the environment this script runs in — never
// prints a value, only presence/absence, so this is safe to run as part
// of a build log or share directly. Run with `node scripts/check-env.js`.
//
// Classification:
//   frontend-safe/public — safe to ship in the browser bundle.
//     VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY (Phase 7 Gate 3) are the
//     first genuine entries here — Vite only inlines VITE_-prefixed vars
//     into the client bundle, and Supabase's own anon key is designed to
//     be public (RLS is the real boundary), same reasoning that used to
//     justify hardcoding it directly in src/supabase.js. Both are now
//     optional: unset falls back to the hardcoded production values, so
//     production needs no configuration change, while a test/CI
//     environment sets them to point at the separate compass-e2e-test
//     project instead.
//   server-only secret — read via process.env in api/*.js, must NEVER be
//     prefixed VITE_ (Vite only inlines VITE_-prefixed vars into the
//     client bundle; everything below is deliberately un-prefixed so it
//     can't be pulled into a browser build even by accident).
//   build-time — read while `vite build` itself runs (none currently;
//     ANTHROPIC_API_KEY below is dev-server-proxy-only, read from
//     vite.config.js at `vite dev` time, not at build time).
//   runtime — read when a serverless function actually executes.

const VARS = [
  { name: 'VITE_SUPABASE_URL', classification: 'frontend-safe/public (optional)', runtime: 'build-time (Vite inlines it)', note: 'falls back to the hardcoded production Supabase URL if unset — set only to point a non-production build (e.g. E2E) elsewhere' },
  { name: 'VITE_SUPABASE_ANON_KEY', classification: 'frontend-safe/public (optional)', runtime: 'build-time (Vite inlines it)', note: 'same fallback behaviour as VITE_SUPABASE_URL above' },
  { name: 'SUPABASE_URL', classification: 'server-only config (not secret, optional)', runtime: 'runtime', note: 'every api/**/_supabase.js twin — falls back to the hardcoded production Supabase URL if unset' },
  { name: 'SUPABASE_SERVICE_KEY', classification: 'server-only secret', runtime: 'runtime', note: 'RLS-bypassing key — every api/*.js handler needs this' },
  { name: 'ANTHROPIC_API_KEY', classification: 'server-only secret', runtime: 'runtime + dev-build-time (vite.config.js proxy)', note: 'api/chat.js; also proxied by the local dev server' },
  { name: 'RESEND_API_KEY', classification: 'server-only secret', runtime: 'runtime', note: 'every outbound email (send-letter, signing, invites, digest)' },
  { name: 'STRIPE_SECRET_KEY', classification: 'server-only secret', runtime: 'runtime', note: 'api/billing/*' },
  { name: 'STRIPE_WEBHOOK_SECRET', classification: 'server-only secret', runtime: 'runtime', note: 'api/billing/_webhook.js signature verification' },
  { name: 'STRIPE_PRICE_ID', classification: 'server-only config (not secret)', runtime: 'runtime', note: 'api/billing/_checkout.js' },
  { name: 'CRON_SECRET', classification: 'server-only secret', runtime: 'runtime', note: 'shared-secret check on api/cron/* — Vercel Cron sends this automatically' },
  { name: 'GOOGLE_CLIENT_ID', classification: 'server-only config (not secret)', runtime: 'runtime', note: 'Google Calendar OAuth' },
  { name: 'GOOGLE_CLIENT_SECRET', classification: 'server-only secret', runtime: 'runtime', note: 'Google Calendar OAuth' },
  { name: 'CALENDAR_STATE_SECRET', classification: 'server-only secret', runtime: 'runtime', note: 'signs the OAuth CSRF state param' },
  { name: 'MS_GRAPH_CLIENT_ID', classification: 'server-only config (not secret)', runtime: 'runtime', note: 'Outlook mail/calendar OAuth' },
  { name: 'MS_GRAPH_CLIENT_SECRET', classification: 'server-only secret', runtime: 'runtime', note: 'Outlook mail/calendar OAuth' },
  { name: 'MS_GRAPH_TENANT_ID', classification: 'server-only config (not secret)', runtime: 'runtime', note: 'Outlook mail/calendar OAuth' },
  { name: 'GRAPH_MAIL_STATE_SECRET', classification: 'server-only secret', runtime: 'runtime', note: 'signs the OAuth CSRF state param' },
  { name: 'VERCEL_ENV', classification: 'runtime (platform-injected)', runtime: 'runtime', note: 'set automatically by Vercel — never configure by hand' },
];

// Frontend-safe/public: NONE currently required — confirmed by static
// grep (see header comment). The Supabase anon key is a literal in
// src/supabase.js, not an env var, by deliberate design.

let missing = 0;
console.log('Environment variable configuration check (presence only — no values printed)\n');
for (const v of VARS) {
  const present = typeof process.env[v.name] === 'string' && process.env[v.name].length > 0;
  if (!present) missing++;
  console.log(`${present ? '✓' : '✗'} ${v.name.padEnd(24)} [${v.classification}] — ${v.note}`);
}
console.log(`\n${VARS.length - missing}/${VARS.length} configured in this environment.`);
if (missing > 0) {
  console.log(`${missing} missing — features depending on them will fail at runtime, not at build time (this app's build step needs none of these).`);
}

// Deliberately exits 0 always — a missing OAuth integration secret is a
// legitimate "that feature isn't set up yet" state, not a reason to fail
// the whole build. SUPABASE_SERVICE_KEY is the one var nearly every
// endpoint needs; flag it distinctly if absent.
if (!process.env.SUPABASE_SERVICE_KEY) {
  console.log('\nWARNING: SUPABASE_SERVICE_KEY is not set — nearly every api/*.js endpoint will fail at runtime without it.');
}
