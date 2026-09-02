import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Organisational ER Intelligence (Phase 6, OP16, §13) — organisational
// risk map. No new RPC/migration — reuses org_insights_overview()
// (OP2/OP4) plus computeStageBottlenecksByLocation (OP10) and the
// already-loaded orgEvents (OP15) client-side.
test('the Risk Map tab loads real site data without erroring', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Intelligence', exact: true }).click();
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Risk Map', exact: true }).click();
  await expect(page.getByText('Organisational risk map', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Couldn't load risk map data right now.")).not.toBeVisible();
  await expect(page.getByText(/never a ranking and never based on protected characteristics/)).toBeVisible();
});
