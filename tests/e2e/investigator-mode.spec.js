import { test, expect } from '@playwright/test';
import { login, openNewCaseModal, openCaseSection } from './helpers.js';

// Phase 15 of the reasoning-layer build-out (Manager Investigation Mode).
// Reuses case_access (existed since baseline_schema_2026-08-06.sql for
// the disciplinary-officer/case-owner flows, but never loaded client-side
// until now) and the currently-unused investigator role. The E2E test
// org only has one member — the HR test account itself — so this covers
// the HR-facing side (assign an investigator, see the seeded checklist,
// watch the progress indicator move) rather than the restricted
// investigator view itself: self-assigning as HR never triggers it
// (isAssignedInvestigator requires !isHR), the same single-test-account
// limitation documented in concerns.spec.js for ConcernsScreen's non-HR
// view.
test('assigning an investigator seeds the checklist as case tasks and HR sees progress', async ({ page }) => {
  const employeeName = `E2E Investigator ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  const accessSaved = page.waitForResponse(r => r.url().includes('/rest/v1/case_access') && r.request().method() === 'POST');
  await page.locator('select').filter({ has: page.locator('option', { hasText: 'Assign investigator' }) }).selectOption({ label: 'Test Compass' });
  await accessSaved;

  // The select's own placeholder option also reads "Investigator: Test
  // Compass" once assigned, but <option> text isn't independently visible
  // to Playwright (the browser renders <select> natively) — this checks
  // the actual progress line in the Copilot banner instead.
  await expect(page.getByText('Investigation by Test Compass: 0 of 7 steps complete')).toBeVisible({ timeout: 10000 });

  // The checklist landed as ordinary case_tasks — visible on this case's
  // own Tasks tab, same data the cross-case Tasks screen reads.
  await openCaseSection(page, 'Tasks');
  await expect(page.getByText('Review the allegation(s)')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Interview the employee')).toBeVisible();
  await expect(page.getByText('Submit findings to HR')).toBeVisible();

  const reviewAllegationsRow = page.locator('div').filter({ hasText: 'Review the allegation(s)' }).filter({ has: page.locator('input[type="checkbox"]') }).last();
  await reviewAllegationsRow.locator('input[type="checkbox"]').click();

  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByText('Investigation by Test Compass: 1 of 7 steps complete')).toBeVisible({ timeout: 10000 });
});
