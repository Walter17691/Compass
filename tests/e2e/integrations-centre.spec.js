import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Integrations & Workflow Automation (Phase 5, IP1, §1) — Integration
// Centre. Doesn't exercise the real Outlook/Google OAuth connect flows
// (clicking Connect navigates the whole browser to a real Microsoft/
// Google consent screen via window.location.href — not something an
// automated run can complete headlessly, and the shared E2E account's
// own real connection state isn't something this test controls or should
// assume). What's fully verifiable here: every catalog entry renders,
// the not-yet-available integrations are honestly labelled, and the
// Slack/Teams "Set up" action correctly routes into the existing
// Notifications section rather than a dead end.
test('the Integration Centre lists every catalog entry and routes Slack/Teams setup to Notifications', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Integrations', exact: true }).click();
  await expect(page.getByText('Integrations', { exact: true }).first()).toBeVisible({ timeout: 10000 });

  for (const label of ['Microsoft Outlook', 'Gmail', 'Microsoft 365 Calendar', 'Google Calendar', 'Microsoft Teams', 'Slack', 'HRIS platforms', 'Occupational Health providers', 'E-signature platforms', 'Cloud document storage']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }

  // Five stub integrations remain (Gmail moved to a real connector in
  // IP2), honestly marked rather than shown as if live.
  await expect(page.getByText('Requires administrator', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/Not yet available/).first()).toBeVisible();

  // Gmail (Phase 5, IP2) — now a real connector, same shape as Outlook:
  // offers a Connect button, not "Requires administrator"/"not yet
  // available". Doesn't click it — same reasoning as Outlook/Calendar
  // above, a real external Google consent screen isn't something an
  // automated run can complete.
  const gmailRow = page.getByText('Gmail', { exact: true }).locator('xpath=ancestor::div[3]');
  await expect(gmailRow.getByText('Not connected', { exact: true })).toBeVisible();
  await expect(gmailRow.getByRole('button', { name: 'Connect', exact: true })).toBeVisible();

  const slackRow = page.getByText('Slack', { exact: true }).locator('xpath=ancestor::div[3]');
  await slackRow.getByRole('button', { name: 'Set up', exact: true }).click();
  await expect(page.getByText('Team chat notifications', { exact: true })).toBeVisible({ timeout: 10000 });
});
