import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Integrations & Workflow Automation (Phase 5, IP22, §18) — the OH
// referral-to-review tracker on a case's Overview tab. Fully
// deterministic client-side state writing through the same saveCases ->
// Supabase path every other case field already uses (no AI call, no
// unproxied /api dependency), so this exercises the real round-trip:
// advance through every step, reload the page (a real Supabase refetch,
// not just client state), and confirm both the process itself and its
// mirrored legacy date fields survived.
test('advancing the OH process through every step persists across a reload, including the mirrored legacy date fields', async ({ page }) => {
  const employeeName = `E2E OhProcess ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await expect(page.getByText('Occupational health process')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Concern identified')).toBeVisible();

  // concern_identified -> consider_referral
  await page.getByRole('button', { name: 'Mark done' }).click();
  // consider_referral -> consent (consent checkbox + confirm)
  await page.getByRole('checkbox', { name: /Employee has given consent/ }).check();
  await page.getByRole('button', { name: 'Confirm consent' }).click();
  // consent -> prepare
  await page.getByRole('button', { name: 'Mark done' }).click();
  // prepare -> submit (mirrors OH referral date)
  await page.getByRole('button', { name: 'Mark done' }).click();
  await expect(page.getByText('Referral submitted')).toBeVisible();

  // The legacy "Key dates" panel's own OH referral date field should now
  // be auto-filled from the submit step, not left blank.
  await expect(page.locator('label:text-is("OH referral date") + input')).not.toHaveValue('');

  // submit -> await_report
  await page.getByRole('button', { name: 'Mark done' }).click();
  // await_report -> received (mirrors OH report received date)
  await page.getByRole('button', { name: 'Mark done' }).click();
  await expect(page.locator('label:text-is("OH report received") + input')).not.toHaveValue('');

  // received -> hr_review (recommendations)
  await page.getByRole('button', { name: 'Mark done' }).click();
  await page.getByPlaceholder('What did the OH report recommend?').fill('Phased return over 4 weeks, standing desk.');
  await page.getByRole('button', { name: 'Save recommendations' }).click();
  await expect(page.getByText('Recommendations recorded')).toBeVisible();

  // recommendations -> adjustments_considered -> manager_discussion
  await page.getByRole('button', { name: 'Mark done' }).click();
  await page.getByRole('button', { name: 'Mark done' }).click();

  // manager_discussion -> review_date
  await page.getByRole('button', { name: 'Mark done' }).click();
  await page.locator('label:text-is("Review date") + input[type="date"]').fill('2026-09-15');
  await page.getByRole('button', { name: 'Confirm review date' }).click();
  await expect(page.getByRole('button', { name: 'Update review date' })).toBeVisible({ timeout: 10000 });

  // saveCases writes optimistic local state into localStorage on every
  // call regardless of whether the Supabase write actually succeeded
  // (App.jsx's own compass_cases cache, read back on mount) — clearing it
  // before reloading forces the app to re-fetch cases from Supabase, so
  // this genuinely proves the database round-trip rather than replaying
  // the browser's own local cache.
  await page.evaluate(() => localStorage.removeItem('compass_cases'));
  await page.reload();
  await expect(page.getByText('Occupational health process')).toBeVisible({ timeout: 10000 });
  await expect(page.locator('label:text-is("OH referral date") + input')).not.toHaveValue('');
  await expect(page.locator('label:text-is("OH report received") + input')).not.toHaveValue('');
  await expect(page.locator('label:text-is("Review date") + input[type="date"]')).toHaveValue('2026-09-15');
  // hr_review is now behind us — its recommendations textarea should no
  // longer render, only the review-date step's own fields should.
  await expect(page.getByPlaceholder('What did the OH report recommend?')).not.toBeVisible();
});
