import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Manager Enablement (Phase 4, MP17, §22/§23) — MP7's own investigator
// target completion date now feeds into the same shared dueSoon pipeline
// every other deadline already does, so it's visible identically to
// both the manager (ManagerPortalScreen's own grouped view — not
// E2E-reachable, covered by managerPortal.test.js/ManagerPortalScreen.test.jsx
// instead) and HR. Verified via Settings > Notifications rather than
// App.jsx's own global overdue banner: that banner is hard-capped to the
// 3 most-overdue items org-wide (sorted by daysOverdue descending), and
// this shared E2E org has accumulated deadlines thousands of days
// overdue over the life of this test suite — a fresh 3-day-overdue item
// would never make that cut. The Notifications section renders every
// dueSoon item in a scrollable list with no such cap.
test('an overdue investigator target completion date surfaces as a real deadline', async ({ page }) => {
  const employeeName = `E2E Deadline ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // Phase 2A — "Assign investigator..." moved into the header's "More
  // actions" menu.
  await page.getByRole('button', { name: /More actions/ }).click();
  await page.getByRole('menuitem', { name: 'Assign investigator...' }).click();
  await expect(page.getByText('Investigator', { exact: true })).toBeVisible({ timeout: 10000 });

  const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000);
  const isoDate = threeDaysAgo.toISOString().split('T')[0];
  await page.getByRole('dialog').locator('input[type="date"]').fill(isoDate);

  const accessSaved = page.waitForResponse(r => r.url().includes('/rest/v1/case_access') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Assign investigator', exact: true }).click();
  await accessSaved;

  await page.locator('aside, header').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  await expect(page.getByText('Deadline reminders', { exact: true })).toBeVisible({ timeout: 10000 });

  // The employeeName span and the day-count span are siblings under the
  // row's own flex container two levels up — same xpath-ancestor pattern
  // already used elsewhere in this suite (case-roles.spec.js) to scope a
  // "find the row, then check what's near it" assertion precisely.
  const row = page.getByText(employeeName, { exact: true }).locator('xpath=ancestor::div[2]');
  await expect(row).toBeVisible({ timeout: 10000 });
  await expect(row.getByText('Investigation target completion date', { exact: true })).toBeVisible();
  await expect(row.getByText('3d overdue', { exact: true })).toBeVisible();
});
