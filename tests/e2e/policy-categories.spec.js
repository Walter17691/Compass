import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Phase 11 of the reasoning-layer build-out (process intelligence).
// getPolicyCtx() grouping/labelling by category is live-verified
// separately (feeding into a real AI prompt); this proves the UI side —
// a new upload defaults to "Other" and can be re-categorised. Persistence
// itself is a plain localStorage write (lsSet, unchanged by this phase),
// not worth a UI round-trip through reload to re-prove.
test('an uploaded policy defaults to Other and can be recategorised', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: /View all policies & templates/ }).click();
  await expect(page.getByRole('heading', { name: 'Company policies' })).toBeVisible({ timeout: 10000 });

  const policyName = `E2E Policy ${Date.now()}`;
  await page.locator('input[type="file"]').setInputFiles({
    name: `${policyName}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from('Investigation outcomes should normally be communicated within five working days.'),
  });

  const row = page.locator('div').filter({ hasText: policyName }).filter({ has: page.locator('select') }).last();
  await expect(row.locator('select')).toHaveValue('other', { timeout: 10000 });

  await row.locator('select').selectOption('disciplinary');
  await expect(row.locator('select')).toHaveValue('disciplinary');

  await row.getByRole('button', { name: 'Remove' }).click();
  await expect(page.getByText(policyName)).not.toBeVisible();
});
