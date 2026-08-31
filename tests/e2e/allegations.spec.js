import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Allegations were entirely missing as data before this — evidence had no
// way to say which specific issue it spoke to, or whether it supported or
// contradicted it. This proves the whole loop: create a case, upload
// evidence (Evidence tab), record an allegation (Allegations tab), link
// that evidence to it with a stance, and change the allegation's status —
// all persisting to the new `allegations` table
// (supabase/case_structure_2026-08-09.sql), not just local state.
test('an allegation can be added, evidence linked with a stance, and its status changed', async ({ page }) => {
  const employeeName = `E2E Allegations ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // Upload evidence first, from its own tab.
  await page.getByRole('button', { name: 'Evidence' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'cctv-log.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from('Site exit logged 14:32, no return recorded.'),
  });
  await expect(page.locator('div').filter({ hasText: /^cctv-log\.txt$/ })).toBeVisible({ timeout: 10000 });

  // Record the allegation from its own tab.
  await page.getByRole('button', { name: 'Allegations', exact: true }).click();
  await expect(page.getByText('Allegations (0)')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Left site without authorisation');
  await page.getByPlaceholder('5 August 2026').fill('5 August 2026');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();

  await expect(page.getByText('Allegations (1)')).toBeVisible();
  // .last() — the Evidence Matrix (rendered above the card list) also has
  // an "Left site without authorisation" cell with the same text.
  await expect(page.getByText('Left site without authorisation').last()).toBeVisible();
  // .last() — the Evidence Matrix's status column also shows "Unreviewed".
  await expect(page.getByText('Unreviewed', { exact: true }).last()).toBeVisible();

  // Expand the card to reach status/evidence controls.
  await page.getByText('Left site without authorisation').last().click();

  // Link the previously-uploaded evidence to the allegation with a stance.
  await page.locator('select').filter({ hasText: 'Link existing evidence...' }).selectOption({ label: 'cctv-log.txt' });
  await expect(page.getByText('Linked evidence (1)')).toBeVisible();

  // Change the allegation's status.
  await page.locator('label:text-is("Status") + select').selectOption('substantiated');
  // .last() — the Evidence Matrix's status column also renders a
  // "Substantiated" badge for this allegation.
  await expect(page.locator('span').filter({ hasText: 'Substantiated' }).last()).toBeVisible();

  // Phase 6.5 hardening (P0, Clusters 6+7) — investigatorFinding now
  // persists on blur via a local draft (DraftTextarea) rather than on
  // every keystroke, and the save itself now goes through
  // saveAllegationToDB's optimistic-concurrency guard rather than a blind
  // upsert (this is the allegation's 3rd save overall — creation and the
  // status change above already ran the 1st/2nd, so this exercises the
  // real conditional-update branch, not just the first-ever-save upsert
  // fallback). Reloading proves the blur-triggered write actually reached
  // Supabase, not just local component state.
  const findingField = page.getByPlaceholder('What did the investigation itself conclude, before any hearing?');
  await findingField.fill('Swipe records confirm the employee left site at 14:32 and did not return.');
  await findingField.blur();
  await page.waitForTimeout(500); // let the blur-triggered save reach Supabase before reloading
  await page.reload();
  await page.getByRole('button', { name: 'Allegations', exact: true }).click();
  // Wait for the list to settle (this shared test org has thousands of
  // cases/allegations, so the post-reload fetch can re-render the list
  // more than once) before clicking a specific row, same reasoning as the
  // count assertion right after creation above.
  await expect(page.getByText('Allegations (1)')).toBeVisible({ timeout: 15000 });
  await page.getByText('Left site without authorisation').last().click();
  // A textarea's content lives in its value, not as visible text — assert
  // on the reloaded field's value, not getByText.
  await expect(page.getByPlaceholder('What did the investigation itself conclude, before any hearing?'))
    .toHaveValue('Swipe records confirm the employee left site at 14:32 and did not return.', { timeout: 10000 });
});
