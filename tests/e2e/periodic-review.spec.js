import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Organisational ER Intelligence (Phase 6, OP19, §16) — Weekly/Monthly/
// Quarterly ER Review. Real AI call grounded in real RPC data, same
// structure-over-literal-text discipline as executive-brief.spec.js's
// own sibling test.
test('Generate review produces a persisted, period-labelled narrative', async ({ page }) => {
  test.setTimeout(60000);

  await login(page);
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await expect(page.getByText('Periodic ER review', { exact: true })).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Generate review', exact: true }).click();
  await expect(page.getByText('Generating…')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Generating…')).not.toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/Couldn't generate the review/)).not.toBeVisible();
  await expect(page.getByText(/Weekly ER Review · generated/).first()).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Reports', exact: true }).click();
  await expect(page.getByText(/Weekly ER Review · generated/).first()).toBeVisible({ timeout: 10000 });
});
