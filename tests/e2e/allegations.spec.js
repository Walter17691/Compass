import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Allegations were entirely missing as data before this — evidence had no
// way to say which specific issue it spoke to, or whether it supported or
// contradicted it. This proves the whole loop: create a case, record an
// allegation, upload evidence, link it to that allegation with a stance,
// and change the allegation's status — all persisting to the new
// `allegations` table (supabase/case_structure_2026-08-09.sql), not just
// local state.
test('an allegation can be added, evidence linked with a stance, and its status changed', async ({ page }) => {
  const employeeName = `E2E Allegations ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();

  // Lands directly on the case view, investigation stage, where
  // Allegations now renders above Evidence.
  await expect(page.getByText('Allegations (0)')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Left site without authorisation');
  await page.getByPlaceholder('5 August 2026').fill('5 August 2026');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();

  await expect(page.getByText('Allegations (1)')).toBeVisible();
  await expect(page.getByText('Left site without authorisation')).toBeVisible();
  await expect(page.getByText('Unreviewed', { exact: true })).toBeVisible();

  // Expand the card to reach status/evidence controls.
  await page.getByText('Left site without authorisation').click();

  // Upload a piece of evidence directly (drop zone's hidden file input).
  await page.locator('input[type="file"]').setInputFiles({
    name: 'cctv-log.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Site exit logged 14:32, no return recorded.'),
  });
  await expect(page.locator('div').filter({ hasText: /^cctv-log\.txt$/ })).toBeVisible({ timeout: 10000 });

  // Link that evidence to the allegation with a stance.
  await page.locator('select').filter({ hasText: 'Link existing evidence...' }).selectOption({ label: 'cctv-log.txt' });
  await expect(page.getByText('Linked evidence (1)')).toBeVisible();

  // Change the allegation's status.
  await page.locator('label:text-is("Status") + select').selectOption('substantiated');
  await expect(page.locator('span').filter({ hasText: 'Substantiated' })).toBeVisible();
});
