import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Phase 5 of the gap-analysis build-out: the "+ New case" modal previously
// had no owner, priority, or evidence fields, and cases.manager was never
// actually persisted to Supabase at all (no column existed before this
// build-out's Phase 0 migration). This proves evidence staged during
// creation lands on the real case, and that priority is actually written
// and read back through Supabase — round-tripping through the Cases list's
// own priority filter, not just checked against local state.
test('evidence staged during case creation lands on the case, and priority round-trips through the priority filter', async ({ page }) => {
  const employeeName = `E2E CaseFields ${Date.now()}`;
  const today = new Date().toISOString().split('T')[0];

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.locator('label:text-is("Priority") + select').selectOption('high');

  await page.locator('input[type="file"]').setInputFiles({
    name: 'incident-photo.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('photographic evidence placeholder'),
  });
  await expect(page.getByText('incident-photo.txt')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // Evidence staged before creation shows up in the case's own Evidence tab.
  await page.getByRole('button', { name: 'Evidence', exact: true }).click();
  await expect(page.getByText('incident-photo.txt')).toBeVisible({ timeout: 10000 });

  // Priority round-trips: filtering the Cases list by "High" (scoped to
  // today, since the shared test org accumulates cases across every spec
  // run) finds it; "Low" does not.
  await page.getByRole('button', { name: '← Cases' }).click();
  await expect(page.getByRole('heading', { name: 'Cases' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /More filters/ }).click(); // Phase 2B - date range moved behind More filters
  await page.getByLabel('From', { exact: true }).fill(today);
  await page.locator('select').filter({ hasText: 'All priorities' }).selectOption('high');
  await expect(page.getByText(employeeName)).toBeVisible({ timeout: 10000 });
  await page.locator('select').filter({ hasText: 'All priorities' }).selectOption('low');
  await expect(page.getByText(employeeName)).not.toBeVisible();
});
