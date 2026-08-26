import { expect } from '@playwright/test';

// Reads E2E_TEST_EMAIL/E2E_TEST_PASSWORD from the environment rather than
// hardcoding credentials in spec files — set these against a dedicated
// throwaway test-org account, never the real production org, since every
// spec run creates real case/DSAR data against whatever account signs in.
//
// Phase 6.5 hardening (production regression suite) — creds is an
// optional {email, password} override for tests/e2e/tenant-isolation.spec.js,
// which needs a genuinely different, real second tenant (E2E_TEST_EMAIL_2/
// E2E_TEST_PASSWORD_2 — see .env's own comment for how that account was
// provisioned and what it's a member of) to prove real cross-org
// isolation, not just re-testing the same single org every other spec in
// this suite already uses.
export async function login(page, creds) {
  const email = creds?.email || process.env.E2E_TEST_EMAIL;
  const password = creds?.password || process.env.E2E_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error('E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set — see tests/e2e/README.md');
  }
  await page.goto('/');
  await page.getByPlaceholder('you@company.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/^Good (morning|afternoon|evening)/)).toBeVisible({ timeout: 15000 });

  // A brand-new org hits three possible first-run overlays in sequence,
  // each blocking clicks until dismissed: the mandatory GDPR consent
  // modal, an inline "1/7" onboarding tour (App.jsx's ONBOARD_STEPS,
  // triggered by accepting GDPR), and OnboardingWizard.jsx (a second,
  // separate onboarding tour, gated to only show once both of the above
  // are clear — it opens on step 1 of 4, where its only exit is the ×
  // "Close" button; "Skip and explore on my own" only exists on the
  // final step). Each only mounts once the previous one is dismissed, so
  // each wait is independent rather than a single fixed delay. Playwright
  // doesn't persist localStorage across spec files (each gets its own
  // browser context), so this account hits all three again on every spec
  // file's first login, not once overall.
  //
  // getByRole name matching is substring by default — 'Close' would also
  // match the "Closed" case-status filter chip on Home, so exact:true is
  // required here (it isn't needed for the other two, which have no
  // similar collision).
  const dismissDialog = async (name) => {
    const button = page.getByRole('button', { name, exact: true });
    try {
      await button.waitFor({ state: 'visible', timeout: 4000 });
      await button.click();
    } catch {
      // Not shown this time — fine, move on.
    }
  };
  await dismissDialog('I understand — continue');
  await dismissDialog('Skip');
  await dismissDialog('Close');
}

// Phase 6.5 hardening (production regression suite) — the second
// account's own credentials, exported once here rather than re-reading
// process.env in every spec that needs them.
export const SECOND_TENANT_CREDS = {
  email: process.env.E2E_TEST_EMAIL_2,
  password: process.env.E2E_TEST_PASSWORD_2,
};

export function hasSecondTenant() {
  return !!(SECOND_TENANT_CREDS.email && SECOND_TENANT_CREDS.password);
}

// Phase 6.5 hardening (structural remediation, Prompt 12 — Test
// Infrastructure invariant). tenant-isolation.spec.js — the ONE spec
// that actually proves cross-tenant data doesn't leak, everything else
// in this suite runs against a single shared org and can't test this at
// all — used to plain test.skip() whenever SECOND_TENANT_CREDS was
// missing. Confirmed live: .github/workflows/ci.yml's E2E job only wires
// E2E_TEST_EMAIL/E2E_TEST_PASSWORD through as secrets, never
// E2E_TEST_EMAIL_2/E2E_TEST_PASSWORD_2 — so this spec has been silently
// skipping on EVERY CI run, and CI has been reporting green without ever
// once actually checking tenant isolation. A skip and a real pass are
// indistinguishable in a green checkmark; for a security-critical spec
// that gap is the whole problem. In CI (process.env.CI, set by GitHub
// Actions on every runner) a missing second tenant is now a hard
// failure with a message pointing at the actual fix, not a skip — a
// contributor's local machine without the second account configured
// still gets the softer skip, since that's a legitimate, common case
// this function's original behaviour already served correctly.
export function requireSecondTenantOrFail() {
  if (hasSecondTenant()) return;
  if (process.env.CI) {
    throw new Error(
      'E2E_TEST_EMAIL_2/E2E_TEST_PASSWORD_2 are not set in CI — tenant-isolation.spec.js cannot run, ' +
      'which means CI is NOT verifying cross-tenant isolation at all. Add both as repo secrets and wire them into ' +
      '.github/workflows/ci.yml\'s "Write .env for the dev server" step (matching E2E_TEST_EMAIL/E2E_TEST_PASSWORD ' +
      'already there) — this failure is intentional so that gap can never be silent again.'
    );
  }
}

// Signs the current session out and waits for the login screen to come
// back — used by tests that need to switch between two genuinely
// different accounts within one spec (Playwright doesn't persist
// anything across a full sign-out the way it might across page.goto()
// within the same authenticated session).
export async function logout(page) {
  await page.getByRole('button', { name: 'Sign out' }).click();
  await expect(page.getByPlaceholder('you@company.com')).toBeVisible({ timeout: 10000 });
}

const SUPABASE_URL = 'https://npeegfsoijhdnnvuqjin.supabase.co';
export const SUPABASE_ANON_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Im5wZWVnZnNvaWpoZG5udnVxamluIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODE0NTU2MjYsImV4cCI6MjA5NzAzMTYyNn0.IPdANRIK94XdCWy7aK1MOiIVqYgPKmvN8_ZJ6LCENBI';

// Reads the currently logged-in session's own access token out of
// localStorage — the same RLS-scoped credential the app's own Supabase
// client already uses, not a service-role bypass. Capture this BEFORE
// switching accounts/logging out; page.request works with an explicit
// Authorization header regardless of which account the browser session
// has since moved on to.
export async function currentAccessToken(page) {
  return page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.includes('auth-token'));
    return key ? JSON.parse(localStorage.getItem(key))?.access_token : null;
  });
}

// Phase 6.5 hardening (Prompt 14, Section 9 — CI multi-tenant E2E fixture
// hygiene). tenant-isolation.spec.js's own canary-case tests used to
// create a real case in a real (throwaway, but shared and reused across
// every CI run) tenant and never delete it — "each run adds its own
// canary and never cleans up," accumulating indefinitely. Deletes by the
// exact, run-unique employeeName this suite already generates
// (`Isolation Canary ${Date.now()}`), scoped by the caller's own
// access token — the same RLS boundary an HR user deleting their own
// case already has, not a bypass. Best-effort: a cleanup failure
// shouldn't fail the isolation assertion the test actually exists to
// prove, so this only logs rather than throws.
export async function deleteCaseByEmployeeName(page, accessToken, employeeName) {
  const headers = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}` };
  try {
    const res = await page.request.delete(`${SUPABASE_URL}/rest/v1/cases?employee_name=eq.${encodeURIComponent(employeeName)}`, { headers });
    if (!res.ok()) console.error(`deleteCaseByEmployeeName: cleanup failed for "${employeeName}" (${res.status()})`);
  } catch (e) {
    console.error(`deleteCaseByEmployeeName: cleanup threw for "${employeeName}"`, e.message);
  }
}

// Process Intelligence (P1) — clicking "Proceed anyway" on any advisory
// gate (Meeting Quality Check, and every later phase reusing
// requestOverrideReason) now opens a second "Proceed anyway?" prompt
// asking for an optional reason before the original action actually
// proceeds. Confirming with a blank reason is a fully valid submission —
// this is the equivalent of the old direct "Proceed anyway" click for any
// test that doesn't care about exercising the reason-capture itself.
export async function confirmOverrideReason(page, reason = '') {
  const prompt = page.getByRole('dialog', { name: 'Proceed anyway?' });
  await prompt.waitFor({ state: 'visible', timeout: 5000 });
  if (reason) await prompt.locator('input').fill(reason);
  await prompt.getByRole('button', { name: 'Proceed', exact: true }).click();
  await prompt.waitFor({ state: 'hidden', timeout: 5000 });
}
