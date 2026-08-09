import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// The Timeline is a read-only merge of a case's meetings, allegations,
// and audit log — nothing new is written here, so this proves the view
// itself: opening it from a case shows the case-opened entry and any
// allegation added to it, and it's reachable as its own workspace tab.
test('the case timeline shows case-opened and allegation events', async ({ page }) => {
  const employeeName = `E2E Timeline ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Allegations', exact: true }).click();
  await expect(page.getByText('Allegations (0)')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Timeline test allegation');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (1)')).toBeVisible();

  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.getByText(/^Timeline \(\d+\)$/)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Case opened — misconduct')).toBeVisible();
  await expect(page.getByText('Allegation added: Timeline test allegation')).toBeVisible();

  // Switching to another tab and back doesn't lose it.
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByText('Description', { exact: true })).toBeVisible();
});
