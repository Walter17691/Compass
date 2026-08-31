import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Manager Enablement (Phase 4, MP20, §24) — HR-only, reachable by the
// real E2E login (same discipline note as hr-delegated-work.spec.js).
// Assigning an investigator (the shared E2E org's own HR user, same
// established workaround as investigation-assignment.spec.js) is enough
// to move the screen out of its empty state and prove the real
// case_access row is being read — a full submit-investigation flow isn't
// needed just to prove the aggregation wires up correctly, so the
// "average completion time" tile is asserted as "Not enough data" here
// (assigned but not yet submitted), not a real number.
test('assigning an investigator makes the case count toward Manager Performance Insights', async ({ page }) => {
  const employeeName = `E2E Insights ${Date.now()}`;

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
  const accessSaved = page.waitForResponse(r => r.url().includes('/rest/v1/case_access') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Assign investigator', exact: true }).click();
  await accessSaved;

  // Organisational ER Intelligence (Phase 6, OP1) moved this screen from
  // its own sidebar row into the new Insights workspace's Manager
  // Insights tab (still HR-only).
  await page.locator('aside, header').getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Manager Insights', exact: true }).click();
  await expect(page.getByText('Manager Performance Insights', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('No investigations have been delegated yet', { exact: false })).not.toBeVisible();

  await expect(page.getByText('Avg. investigation completion time', { exact: true })).toBeVisible();
  await expect(page.getByText('Not enough data', { exact: true })).toBeVisible();
  await expect(page.getByText('Investigations returned for rework', { exact: true })).toBeVisible();
  await expect(page.getByText('Overdue manager actions', { exact: true })).toBeVisible();
  await expect(page.getByText('Meeting quality gaps', { exact: true })).toBeVisible();
  await expect(page.getByText('Process deviations', { exact: true })).toBeVisible();
});
