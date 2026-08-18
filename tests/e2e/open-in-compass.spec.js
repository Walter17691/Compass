import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Integrations & Workflow Automation (Phase 5, IP21, §15) — "Open in
// Compass" deep link. No live HRIS platform exists to link FROM (IP19 is
// a stub adapter only), so there's no real external sender to click
// through from — this exercises the RECEIVING end directly: a hand-built
// ?employee=<name> URL, exactly what a real HRIS "Open in Compass" button
// would generate. Fully deterministic client-side routing (no AI call, no
// unproxied /api dependency), so a real end-to-end run — not just a
// component test — is achievable here.
test('an ?employee= deep link lands on the Open in Compass screen, and its actions route into the right existing flows', async ({ page }) => {
  const employeeName = `E2E OpenInCompass ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // Simulate arriving fresh from an external HRIS profile link — a full
  // navigation (not in-app routing) carrying the employee's name.
  await page.goto(`/?employee=${encodeURIComponent(employeeName)}`);
  await expect(page.getByRole('heading', { name: employeeName })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'View existing cases (1)' })).toBeVisible();

  // "View active actions" — exactly one existing case, so it should land
  // directly inside it on the Tasks tab rather than showing a list.
  await page.getByRole('button', { name: 'View active actions' }).click();
  await expect(page.getByText(/^Tasks \(0 open\)$/)).toBeVisible({ timeout: 10000 });

  // Re-arrive at the deep link and this time open the case from the
  // existing-cases list itself, landing on the default Overview tab.
  await page.goto(`/?employee=${encodeURIComponent(employeeName)}`);
  await expect(page.getByRole('heading', { name: employeeName })).toBeVisible({ timeout: 10000 });
  await page.getByText('misconduct', { exact: false }).first().click();
  await expect(page.getByText('Description', { exact: true })).toBeVisible({ timeout: 10000 });
});

test('"Raise a concern" from an employee with no cases seeds the concern form with their name', async ({ page }) => {
  const employeeName = `E2E OpenInCompass NoCase ${Date.now()}`;

  await login(page);
  await page.goto(`/?employee=${encodeURIComponent(employeeName)}`);
  await expect(page.getByRole('heading', { name: employeeName })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('No existing cases for this employee.')).toBeVisible();

  await page.getByRole('button', { name: 'Raise a concern' }).click();
  await expect(page.getByText("Employee's name")).toBeVisible({ timeout: 10000 });
  await expect(page.getByPlaceholder('Who is this about?')).toHaveValue(employeeName);
});
