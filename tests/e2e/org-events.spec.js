import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Organisational ER Intelligence (Phase 6, OP15, §11) — organisational
// change correlation. Fully deterministic — logging an event and
// exploring correlation are both plain Supabase client-library
// operations, no AI call anywhere in this path.
test('HR can log an organisational event, it persists across a reload, and correlation can be explored', async ({ page }) => {
  const description = `E2E org event ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Organisational Events', exact: true }).click();
  await expect(page.getByText('Log an event', { exact: true })).toBeVisible({ timeout: 10000 });

  await page.locator('input[type="date"]').fill('2026-06-15');
  await page.getByPlaceholder('Description').fill(description);
  const eventSaved = page.waitForResponse(r => r.url().includes('/rest/v1/org_events') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Log event', exact: true }).click();
  await eventSaved;
  await expect(page.getByText(description, { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Organisational Events', exact: true }).click();
  await expect(page.getByText(description, { exact: true })).toBeVisible({ timeout: 10000 });

  const eventCard = page.locator('div').filter({ hasText: description }).filter({ has: page.getByRole('button', { name: 'Explore correlation' }) }).last();
  await eventCard.getByRole('button', { name: 'Explore correlation' }).click();
  await expect(eventCard.getByText(/before this event|Case volume|No cases recorded/)).toBeVisible({ timeout: 10000 });
});
