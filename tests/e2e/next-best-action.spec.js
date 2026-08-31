import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Phase 1 of the AI-copilot reasoning-layer build-out: Next Best Action is
// getNextStep()'s deterministic banner (unchanged) plus an AI-generated,
// persisted case_signal alongside it that can be accepted/dismissed/
// marked-not-relevant/asked-why — live-verified separately against the
// real Claude API for reasoning quality. This just proves the UI wiring
// and the disposition actions round-trip, not the recommendation's exact
// wording.
test('Compass generates a Next Best Action recommendation that can be asked-why and dismissed', async ({ page }) => {
  test.setTimeout(60000); // one real Claude call
  const employeeName = `E2E NextAction ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByPlaceholder('Brief summary of the issue…').fill('Alleged unauthorised absence from shift on 5 August.');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Ask Compass for its take' }).click();
  await expect(page.getByText('Compass is thinking…')).toBeVisible();

  // The deterministic banner's own label stays visible throughout — the
  // AI signal is additive, never a replacement.
  await expect(page.getByText(/^Next: /)).toBeVisible();

  const signalCard = page.getByText('Next best action').locator('xpath=ancestor::div[2]');
  await expect(signalCard.getByRole('button', { name: 'Accept' })).toBeVisible({ timeout: 30000 });
  await expect(signalCard.getByRole('button', { name: 'Create task' })).toBeVisible();
  await expect(signalCard.getByRole('button', { name: 'Not relevant' })).toBeVisible();
  await expect(signalCard.getByRole('button', { name: 'Dismiss' })).toBeVisible();

  await signalCard.getByRole('button', { name: 'Ask why' }).click();
  await expect(page.getByText('Why Compass is saying this')).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Why Compass is saying this')).not.toBeVisible();

  await signalCard.getByRole('button', { name: 'Dismiss' }).click();
  await expect(page.getByText('Next best action')).not.toBeVisible();
  await expect(page.getByRole('button', { name: 'Ask Compass for its take' })).toBeVisible();
});
