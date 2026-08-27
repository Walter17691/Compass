#!/usr/bin/env node
// Phase 6.5 — deployment pipeline hardening (Prompt 13, §5). Reports
// which environment variables this app expects and whether each is
// currently configured in the environment this script runs in — never
// prints a value, only presence/absence, so this is safe to run as part
// of a build log or share directly. Run with `node scripts/check-env.js`.
//
// Phase 7 Gate 6 — the actual variable list now lives in
// api/_configVars.js, shared with the live api/cron/_health.js endpoint
// so the two can never silently drift apart.

import { CONFIG_VARS as VARS } from '../api/_configVars.js';

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
