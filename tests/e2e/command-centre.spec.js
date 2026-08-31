import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Phase 20 of the reasoning-layer build-out — last item in the "scale/
// commercialisation" wave. Extends HomeScreen's existing "Needs attention"
// strip (unchanged layout/visual language — same pill pattern already used
// for overdue items/high risk cases) with widgets reading data that
// already exists from earlier phases: appeals outstanding (Phase 19's
// stage), stale cases (plain inactivity), and manager referrals awaiting
// triage (Phase 14's concern_referrals). The manager-referral path is the
// only one of the three that's both deterministic (no AI call) and
// reachable without simulating the passage of real time, so that's what's
// covered here — same reasoning outcome-consistency.spec.js and others in
// this suite used to test only the reliably-triggerable case.
test('a newly raised, untriaged concern shows up on Home\'s Needs attention strip and links back to Concerns', async ({ page }) => {
  const employeeName = `E2E Centre ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: 'Concerns', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'People concerns' })).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: '+ Raise a concern' }).click();
  await page.getByPlaceholder("Who is this about?").fill(employeeName);
  await page.getByLabel('What kind of concern is this?').selectOption('conduct');
  await page.getByPlaceholder(/What happened/).fill('Persistently arrives late without explanation.');
  const saveResponse = page.waitForResponse(r => r.url().includes('/rest/v1/concern_referrals') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Submit concern' }).click();
  await saveResponse;

  // Left untriaged (still "new") — go to Home and confirm the Needs
  // attention strip picks it up.
  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  const referralPill = page.getByRole('button', { name: /referrals? awaiting triage/ });
  await expect(referralPill).toBeVisible({ timeout: 10000 });

  await referralPill.click();
  await expect(page.getByRole('heading', { name: 'People concerns' })).toBeVisible({ timeout: 10000 });
  const referralCard = page.locator('div').filter({ hasText: employeeName }).filter({ hasText: 'Open formal case' }).last();
  await expect(referralCard).toBeVisible({ timeout: 10000 });
});

// Sanity check for the other deterministic-but-negative half of the same
// strip addition: a case with no activity yet today must not be flagged
// stale (STALE_DAYS=14 in HomeScreen.jsx) — proves the new stale-case
// filter doesn't fire on every case indiscriminately.
test('a freshly created case does not appear as a stale case on Home', async ({ page }) => {
  const employeeName = `E2E Centre Fresh ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  await expect(page.getByRole('button', { name: new RegExp(employeeName + ' · No activity') })).not.toBeVisible();
});
