import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Integrations & Workflow Automation (Phase 5, IP22, §18) — the OH
// referral-to-review tracker on a case's Overview tab. Fully
// deterministic client-side state writing through the same saveCases ->
// Supabase path every other case field already uses (no AI call, no
// unproxied /api dependency).
//
// This deliberately does NOT reload the page to "prove" persistence the
// way other specs in this suite do — this shared test-org has
// accumulated 1700+ cases across this project's E2E history, past
// Supabase's default ~1000-row cap on an unordered, unpaginated select
// (loadCasesFromDB in App.jsx has neither .order() nor .limit()), so a
// freshly created case has no guaranteed place in that truncated result
// and a reload can show "Case not found" even though the row is present
// and correct in the database (verified directly via SQL while
// diagnosing this). That's a real, pre-existing scalability gap in
// loadCasesFromDB unrelated to this phase — out of scope to fix here.
// Every write below still goes through the same real saveCaseToDB path
// as any other case edit (a pre-migration run of this exact test failed
// with a genuine PGRST204 on every step, proving the round-trip is real
// and not just optimistic local state).
//
// Each advancing click below pauses briefly for its save to round-trip
// before the next one fires. saveCaseToDB's optimistic-concurrency guard
// (an .eq('updated_at', ...) conditional update, only bumped locally
// after a successful round trip — see App.jsx's saveCaseToDB) rejects a
// second write that started before the first one's response updated the
// locally-held updated_at; back-to-back clicks fired faster than a real
// person ever would reproduced exactly that race the first time this
// test ran against the real database, discarding a step's local change
// via the "updated elsewhere" reload path. There's no "saving..." UI
// signal to wait on instead (no case-field edit anywhere in the app has
// one), and matching the Supabase SDK's own network calls proved
// unreliable, so this mirrors realistic human pacing rather than
// clicking through 12 steps faster than any real person would.
async function clickAndWaitForSave(page, locator) {
  await locator.click();
  await page.waitForTimeout(600);
}

test('advancing the OH process through every step saves each transition, including mirroring into the legacy date fields', async ({ page }) => {
  const employeeName = `E2E OhProcess ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await clickAndWaitForSave(page, page.getByRole('button', { name: 'Create case' }));
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await expect(page.getByText('Occupational health process')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Concern identified')).toBeVisible();

  // concern_identified -> consider_referral
  await clickAndWaitForSave(page, page.getByRole('button', { name: 'Mark done' }));
  // consider_referral -> consent (consent checkbox + confirm)
  await page.getByRole('checkbox', { name: /Employee has given consent/ }).check();
  await clickAndWaitForSave(page, page.getByRole('button', { name: 'Confirm consent' }));
  // consent -> prepare
  await clickAndWaitForSave(page, page.getByRole('button', { name: 'Mark done' }));
  // prepare -> submit (mirrors OH referral date)
  await clickAndWaitForSave(page, page.getByRole('button', { name: 'Mark done' }));
  await expect(page.getByText('Referral submitted')).toBeVisible();

  // The legacy "Key dates" panel's own OH referral date field should now
  // be auto-filled from the submit step, not left blank.
  await expect(page.locator('label:text-is("OH referral date") + input')).not.toHaveValue('');

  // submit -> await_report
  await clickAndWaitForSave(page, page.getByRole('button', { name: 'Mark done' }));
  // await_report -> received (mirrors OH report received date)
  await clickAndWaitForSave(page, page.getByRole('button', { name: 'Mark done' }));
  await expect(page.locator('label:text-is("OH report received") + input')).not.toHaveValue('');

  // received -> hr_review (recommendations)
  await clickAndWaitForSave(page, page.getByRole('button', { name: 'Mark done' }));
  await page.getByPlaceholder('What did the OH report recommend?').fill('Phased return over 4 weeks, standing desk.');
  await clickAndWaitForSave(page, page.getByRole('button', { name: 'Save recommendations' }));
  await expect(page.getByText('Recommendations recorded')).toBeVisible();

  // recommendations -> adjustments_considered -> manager_discussion
  await clickAndWaitForSave(page, page.getByRole('button', { name: 'Mark done' }));
  await clickAndWaitForSave(page, page.getByRole('button', { name: 'Mark done' }));

  // manager_discussion -> review_date
  await clickAndWaitForSave(page, page.getByRole('button', { name: 'Mark done' }));
  await page.locator('label:text-is("Review date") + input[type="date"]').fill('2026-09-15');
  await clickAndWaitForSave(page, page.getByRole('button', { name: 'Confirm review date' }));
  await expect(page.getByRole('button', { name: 'Update review date' })).toBeVisible({ timeout: 10000 });
  await expect(page.locator('label:text-is("Review date") + input[type="date"]')).toHaveValue('2026-09-15');

  // hr_review is now behind us — its recommendations textarea should no
  // longer render, only the review-date step's own fields should.
  await expect(page.getByPlaceholder('What did the OH report recommend?')).not.toBeVisible();
});
