import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Integrations & Workflow Automation (Phase 5, IP28, §22-23) — the
// Settings -> Automations config screen itself. Fully deterministic,
// no AI call, and (unlike /api/signing or /api/calendar) writes straight
// to organisations via the Supabase client library, not an unproxied API
// route, so this is genuinely achievable locally including a real
// persistence check across a reload.
test('changing an automation level persists across a reload, and the rule stays visible at every level', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Automations', exact: true }).click();
  await expect(page.getByText('Chase signature on stale meeting records', { exact: true })).toBeVisible({ timeout: 10000 });

  // Defaults to Suggest, with its own explanatory copy — the rule is
  // never a black box at any level.
  await expect(page.getByText(/Compass flags it for HR to review/)).toBeVisible();

  await page.getByRole('button', { name: 'Prepare', exact: true }).click();
  await expect(page.getByText(/Compass drafts the action; HR reviews/)).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Automate', exact: true }).click();
  await expect(page.getByText(/Compass performs the action automatically/)).toBeVisible({ timeout: 10000 });

  // The rule's own label/detail must still be visible at Automate —
  // automating it never hides what it does or why.
  await expect(page.getByText('Chase signature on stale meeting records', { exact: true })).toBeVisible();
  await expect(page.getByText(/sent for signature 5\+ days ago/)).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Automations', exact: true }).click();
  await expect(page.getByText(/Compass performs the action automatically/)).toBeVisible({ timeout: 10000 });
});
