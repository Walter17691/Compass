import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Organisational ER Intelligence (Phase 6, OP18, §15) — ER Executive
// Brief. Real AI call (grounded in the real org_insights_overview()/
// org_trend_detection() RPCs), so this asserts structure over literal
// AI text, matching org-intelligence.spec.js's own established
// discipline for ErReportScreen's sibling "Generate AI summary" button.
test('Generate brief produces a persisted narrative with supporting data, not an error state', async ({ page }) => {
  test.setTimeout(60000);

  await login(page);
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await expect(page.getByText('ER Executive Brief', { exact: true })).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Generate brief', exact: true }).click();
  await expect(page.getByText('Generating…')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Generating…')).not.toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Couldn't generate the brief/)).not.toBeVisible();
  await expect(page.getByText('Supporting data', { exact: true }).first()).toBeVisible();
  await expect(page.getByText(/\d+ total cases/).first()).toBeVisible();

  // Persistence: the brief must still be there after a reload, not just
  // held in local component state.
  await page.reload();
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await expect(page.getByText('Supporting data', { exact: true }).first()).toBeVisible({ timeout: 10000 });
});
