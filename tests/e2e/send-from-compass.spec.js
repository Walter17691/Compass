import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Integrations & Workflow Automation (Phase 5, IP13, §7) — send-from-
// Compass coordinated workflow. Clicking "Send email" here fires a real
// Resend API call and sends a real outbound email — not something this
// suite should trigger on every run (same reasoning integrations-
// centre.spec.js gives for never clicking a real OAuth Connect button).
// This test stops at "the approved letter's Send from Compass button
// opens the send modal" — fully deterministic and real. The actual
// coordination logic that runs after a successful send (save sent copy,
// timeline event, task completion, audit event) is covered by
// letterSend.test.js and caseTimeline.test.js instead.
test('an approved letter offers Send from Compass and opens the send modal', async ({ page }) => {
  test.setTimeout(90000); // one real Claude call to draft the letter
  const employeeName = `E2E SendCompass ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await page.getByRole('button', { name: 'Witness invitation' }).click();
  await expect(page.getByText('Drafting...')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Drafting...')).not.toBeVisible({ timeout: 60000 });

  // Not yet approved — Send from Compass stays disabled, same as the
  // pre-existing Gmail/Outlook send buttons.
  await expect(page.getByRole('button', { name: 'Send from Compass' })).toBeDisabled();

  await page.getByRole('button', { name: 'Approve for sending' }).click();
  await expect(page.getByRole('button', { name: 'Send from Compass' })).toBeEnabled();

  await page.getByRole('button', { name: 'Send from Compass' }).click();
  await expect(page.getByRole('heading', { name: 'Email letter' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByPlaceholder('employee@company.com')).toBeVisible();
});
