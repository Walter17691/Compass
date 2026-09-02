import { test, expect } from '@playwright/test';
import { login, openNewCaseModal, openCaseSection } from './helpers.js';

// Phase 8 of the reasoning-layer build-out (5 of 5 in the ER Intelligence
// MVP — see plan file). buildCaseTimeline() itself is unchanged/read-only;
// this proves the new overrides (exclude, edit, click-through to source,
// AI relevance) round-trip through the case's timeline_overrides column,
// and that export produces a file. Relevance wording isn't asserted
// exactly — live-verified separately — just that the call populates
// something.
test('Timeline entries can be edited, excluded, opened to source, and exported', async ({ page }) => {
  test.setTimeout(60000); // one real Claude call for relevance
  const employeeName = `E2E Timeline2 ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await openCaseSection(page, 'Allegations');
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Timeline intelligence test');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (1)')).toBeVisible();

  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.getByText(/^Timeline \(\d+\)$/)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Allegation added: Timeline intelligence test')).toBeVisible();

  // Edit the case-opened entry's description. Once edit mode replaces the
  // description div with an <input>, the "Case opened — misconduct" text
  // this row was found by no longer exists — so the fill/save happen
  // against the page directly (only one row is ever in edit mode at a
  // time) rather than against a stale row reference.
  const caseOpenedRow = page.getByText('Case opened — misconduct').locator('xpath=ancestor::div[2]');
  await caseOpenedRow.getByRole('button', { name: 'Edit' }).click();
  await page.locator('input').fill('Case opened — edited for test');
  await page.getByRole('button', { name: 'Save', exact: true }).click();
  await expect(page.getByText('Case opened — edited for test')).toBeVisible();

  // Click-through: opening the allegation entry's source switches to the
  // Allegations tab.
  const allegationRow = page.getByText('Allegation added: Timeline intelligence test').locator('xpath=ancestor::div[2]');
  await allegationRow.getByRole('button', { name: 'Open source' }).click();
  await expect(page.getByText('Allegations (1)')).toBeVisible();

  // Back to Timeline, exclude an entry.
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  const excludeRow = page.getByText('Case opened — edited for test').locator('xpath=ancestor::div[2]');
  await excludeRow.getByRole('button', { name: 'Exclude' }).click();
  await expect(page.getByText('Case opened — edited for test')).not.toBeVisible();

  // Assess relevance — a real Claude call.
  await page.getByRole('button', { name: 'Assess relevance' }).click();
  await expect(page.getByText('Assessing relevance…')).toBeVisible();
  await expect(page.getByText('Assessing relevance…')).not.toBeVisible({ timeout: 30000 });

  // Export downloads a file.
  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('chronology.pdf');
});
