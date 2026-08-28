#!/usr/bin/env node
// Phase 8A — one-time setup for Human UAT (Phase 8). Creates the
// Meridian Fulfilment Ltd (UAT) organisation, the 7 uat-hr-* tester
// accounts (Document J §5), and the 20 employee_records rows making up
// the stable Meridian roster (Document J §4). Idempotent — safe to
// re-run; skips anything that already exists rather than duplicating it.
//
// Follows the exact recipe already used and documented for this
// project's own compass-e2e-test account (see the "reference:
// compass-e2e-test-account" memory from this engagement): create the
// auth user via the Admin API with email_confirm:true (no signup email,
// no rate limit), insert organisations + org_members directly, then
// patch plan/stripe_subscription_status so the org doesn't land on
// SubscribeGate instead of Home (isSubscribed() in src/lib/plan.js
// requires both — no real Stripe involved, safe for a non-billing UAT
// org exactly as it was for the original E2E test org).
//
// Usage: node --env-file=.env scripts/uat/seed-uat-org.js
// Requires UAT_TESTER_DOMAIN in the environment (e.g. yourdomain.com —
// testers become uat-hr-1@yourdomain.com .. uat-hr-7@yourdomain.com).
// Generated passwords are written ONLY to
// scripts/uat/.uat-credentials.local.json (gitignored) — never to this
// script's own output beyond a "created" confirmation, never committed.

import { randomBytes } from 'node:crypto';
import { writeFileSync, existsSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { requireNonProductionSupabase, supabaseRest, supabaseAdminAuth } from './_guard.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const CREDS_FILE = path.join(__dirname, '.uat-credentials.local.json');

const UAT_ORG_NAME = 'Meridian Fulfilment Ltd (UAT)';

// Document J §5 — deliberately varies hr_director/hr_manager (a real
// permission difference in this app, src/lib/roles.js) rather than
// giving every tester the same top-privilege role by default.
const TESTERS = [
  { n: 1, role: 'hr_director', displayName: 'UAT HR Tester 1' },
  { n: 2, role: 'hr_director', displayName: 'UAT HR Tester 2' },
  { n: 3, role: 'hr_manager', displayName: 'UAT HR Tester 3' },
  { n: 4, role: 'hr_manager', displayName: 'UAT HR Tester 4' },
  { n: 5, role: 'hr_manager', displayName: 'UAT HR Tester 5' },
  { n: 6, role: 'hr_manager', displayName: 'UAT HR Tester 6' },
  { n: 7, role: 'hr_director', displayName: 'UAT HR Tester 7' },
];

// Document J §4 — every fictional person across all six scenarios.
const ROSTER = [
  ['Priya Nathan', 'Shift Manager', 'Reading DC1'],
  ['Dean Ashworth', 'Warehouse Operative', 'Reading DC1'],
  ['Callum Reeves', 'Warehouse Operative', 'Reading DC1'],
  ['Jade Whitfield', 'Warehouse Operative', 'Reading DC1'],
  ['Robert Nkemelu', 'Operations Manager', 'Swindon DC2'],
  ['Ellen Marsh', 'Team Leader', 'Swindon DC2'],
  ['Tomasz Nowak', 'Warehouse Operative', 'Swindon DC2'],
  ['Sadia Iqbal', 'Warehouse Operative', 'Swindon DC2'],
  ['Gareth Owusu', 'Warehouse Operative', 'Swindon DC2'],
  ['Aisha Rahman', 'Customer Service Advisor', 'Reading DC1'],
  ['Grant Aldous', 'Customer Service Team Leader', 'Reading DC1'],
  ['Leanne Foy', 'Customer Service Advisor', 'Reading DC1'],
  ['Marcus Webb', 'Customer Service Advisor', 'Reading DC1'],
  ['Martin Kowalski', 'Delivery Driver', 'Reading DC1'],
  ['Grace Oduya', 'Warehouse Supervisor', 'Swindon DC2'],
  ['Kian Doyle', 'Warehouse Operative', 'Swindon DC2'],
  ['Denise Okoro', 'IT Manager', 'Reading DC1'],
  ['Simon Boateng', 'IT Support Assistant', 'Reading DC1'],
  ['Nadia Cole', 'Warehouse Operative', 'Reading DC1'],
  ['Fola Adeyemi', 'Warehouse Operative', 'Reading DC1'],
];

function genPassword() {
  return randomBytes(18).toString('base64').replace(/[+/=]/g, 'x');
}

function loadCreds() {
  if (!existsSync(CREDS_FILE)) return {};
  return JSON.parse(readFileSync(CREDS_FILE, 'utf8'));
}

function saveCreds(creds) {
  writeFileSync(CREDS_FILE, JSON.stringify(creds, null, 2));
}

async function findOrCreateOrg() {
  const res = await supabaseRest(`organisations?name=eq.${encodeURIComponent(UAT_ORG_NAME)}&select=id,name,plan,stripe_subscription_status`);
  const existing = await res.json();
  if (existing.length) {
    console.log(`Organisation "${UAT_ORG_NAME}" already exists (${existing[0].id}).`);
    return existing[0].id;
  }
  const createRes = await supabaseRest('organisations', {
    method: 'POST',
    headers: { Prefer: 'return=representation' },
    body: JSON.stringify({ name: UAT_ORG_NAME, invite_code: `UAT-${randomBytes(4).toString('hex')}` }),
  });
  if (!createRes.ok) throw new Error(`Failed to create organisation: ${createRes.status} ${await createRes.text()}`);
  const [org] = await createRes.json();
  console.log(`Created organisation "${UAT_ORG_NAME}" (${org.id}).`);

  // Bypass SubscribeGate — same non-billing technique as the existing
  // E2E test org; no real Stripe subscription involved.
  const patchRes = await supabaseRest(`organisations?id=eq.${org.id}`, {
    method: 'PATCH',
    body: JSON.stringify({ plan: 'pro', stripe_subscription_status: 'active' }),
  });
  if (!patchRes.ok) throw new Error(`Failed to set plan/subscription status: ${patchRes.status} ${await patchRes.text()}`);
  console.log('Set plan=pro, stripe_subscription_status=active (bypasses SubscribeGate — no real billing).');

  return org.id;
}

async function findOrCreateTester(tester, orgId, domain, creds) {
  const email = `uat-hr-${tester.n}@${domain}`;

  // Check if this auth user already exists by listing and filtering —
  // the Admin API's list endpoint supports a plain email filter.
  const listRes = await supabaseAdminAuth(`admin/users?email=${encodeURIComponent(email)}`);
  const listBody = await listRes.json().catch(() => ({}));
  let userId = listBody?.users?.[0]?.id;

  if (!userId) {
    const password = genPassword();
    const createRes = await supabaseAdminAuth('admin/users', {
      method: 'POST',
      body: JSON.stringify({ email, password, email_confirm: true }),
    });
    if (!createRes.ok) throw new Error(`Failed to create auth user ${email}: ${createRes.status} ${await createRes.text()}`);
    const created = await createRes.json();
    userId = created.id || created.user?.id;
    creds[email] = password;
    console.log(`Created auth account ${email}.`);
  } else {
    console.log(`Auth account ${email} already exists — reusing.`);
  }

  const memberCheck = await supabaseRest(`org_members?org_id=eq.${orgId}&user_id=eq.${userId}&select=id`);
  const existingMember = await memberCheck.json();
  if (existingMember.length) {
    console.log(`  Already a member of ${UAT_ORG_NAME} as ${tester.role}.`);
    return;
  }

  const insertRes = await supabaseRest('org_members', {
    method: 'POST',
    body: JSON.stringify({ org_id: orgId, user_id: userId, role: tester.role, name: tester.displayName }),
  });
  if (!insertRes.ok) throw new Error(`Failed to add ${email} to org: ${insertRes.status} ${await insertRes.text()}`);
  console.log(`  Added to ${UAT_ORG_NAME} as ${tester.role}.`);
}

async function seedRoster(orgId) {
  const rows = ROSTER.map(([name, job_title, location]) => ({ org_id: orgId, name, job_title, location }));
  const res = await supabaseRest('employee_records', {
    method: 'POST',
    headers: { Prefer: 'resolution=ignore-duplicates,return=representation' },
    body: JSON.stringify(rows),
  });
  if (!res.ok) throw new Error(`Failed to seed employee_records: ${res.status} ${await res.text()}`);
  const inserted = await res.json();
  console.log(`Employee roster: ${inserted.length} new record(s) inserted (existing names skipped via the org_id+name unique constraint).`);
}

async function main() {
  requireNonProductionSupabase();

  const domain = process.env.UAT_TESTER_DOMAIN;
  if (!domain) {
    console.error('Set UAT_TESTER_DOMAIN in the environment first (e.g. UAT_TESTER_DOMAIN=yourdomain.com) — see Document J §5, Manual Action #1.');
    process.exit(1);
  }

  const orgId = await findOrCreateOrg();

  const creds = loadCreds();
  for (const tester of TESTERS) {
    await findOrCreateTester(tester, orgId, domain, creds);
  }
  saveCreds(creds);
  console.log(`\nAny newly generated passwords are in ${CREDS_FILE} (gitignored — never commit this file).`);

  await seedRoster(orgId);

  console.log('\nSeed complete.');
}

main().catch(err => {
  console.error(err.message);
  process.exit(1);
});
