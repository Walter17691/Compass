import { expect } from '@playwright/test';

// Reads E2E_TEST_EMAIL/E2E_TEST_PASSWORD from the environment rather than
// hardcoding credentials in spec files — set these against a dedicated
// throwaway test-org account, never the real production org, since every
// spec run creates real case/DSAR data against whatever account signs in.
export async function login(page) {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
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
