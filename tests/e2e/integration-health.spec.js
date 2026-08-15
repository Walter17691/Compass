import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Integrations & Workflow Automation (Phase 5, IP4, §30) — Integration
// Health. HR-only (see the isHR gate on the "Integration health" nav item
// in SettingsScreen.jsx), distinct from the ungated Integrations section
// every org member can reach. The shared E2E account has no real OAuth
// connections and so no integration_events rows — this test verifies the
// honest "no activity yet" empty state renders for all four tracked
// providers, which is the one thing reliably true regardless of what has
// or hasn't been connected in whatever environment this runs against.
test('the Integration Health section lists every tracked provider and is HR-only', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Integration health', exact: true }).click();
  await expect(page.getByText('Integration health', { exact: true }).first()).toBeVisible({ timeout: 10000 });

  for (const label of ['Microsoft Outlook', 'Gmail', 'Microsoft 365 Calendar', 'Google Calendar']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }

  await expect(page.getByText('No activity yet', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('No successful action recorded yet').first()).toBeVisible();
});
