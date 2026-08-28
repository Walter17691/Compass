import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Redundancy selection criteria were fixed to 5 hardcoded criteria with
// only the weight editable — no way to rename one, add a role-specific
// criterion (e.g. a technical certification), or remove one that doesn't
// apply to this pool. Real UK redundancy selection requires criteria
// relevant to the specific pool, not a one-size-fits-all fixed set.
test('redundancy selection criteria can be renamed, added to, and removed', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Redundancy', exact: true }).click();

  // Redundancy cases persist server-side per org, so a case from an
  // earlier run (this one, or a prior one) may already be active, in
  // which case the "Start new redundancy process" picker never appears
  // at all — race the two possible states instead of assuming either one.
  const startPicker = page.getByText('Individual redundancy', { exact: true });
  const stepNav = page.getByRole('button', { name: 'Selection', exact: true });
  await Promise.race([
    startPicker.waitFor({ state: 'visible', timeout: 15000 }),
    stepNav.waitFor({ state: 'visible', timeout: 15000 }),
  ]);
  if (await startPicker.isVisible()) {
    await startPicker.click();
    await page.getByPlaceholder(/restructure, site closure/).fill('E2E test redundancy — safe to delete');
    await page.getByRole('button', { name: 'Start process', exact: true }).click();
    await stepNav.waitFor({ state: 'visible', timeout: 10000 });
  }
  await stepNav.click();
  await page.getByText('Selection criteria', { exact: true }).waitFor({ timeout: 10000 });

  // Rename the first default criterion.
  const firstCriterionInput = page.locator('input[placeholder="Criterion name"]').first();
  await firstCriterionInput.fill('Technical certification (forklift licence)');
  await expect(firstCriterionInput).toHaveValue('Technical certification (forklift licence)');

  // Add a new criterion.
  const criteriaCountBefore = await page.locator('input[placeholder="Criterion name"]').count();
  await page.getByRole('button', { name: '+ Add criterion' }).click();
  await page.getByPlaceholder('e.g. Technical certification').fill('Customer feedback score');
  await page.getByPlaceholder(/measures and how/).fill('Average customer satisfaction rating over 12 months');
  await page.getByPlaceholder('e.g. 10').fill('15');
  await page.getByRole('button', { name: 'Add criterion', exact: true }).click();
  await expect(page.locator('input[placeholder="Criterion name"]')).toHaveCount(criteriaCountBefore + 1);
  await expect(page.locator('input[placeholder="Criterion name"]').last()).toHaveValue('Customer feedback score');

  // Remove a criterion.
  await page.locator('button[aria-label="Remove criterion"]').first().click();
  await expect(page.locator('input[placeholder="Criterion name"]')).toHaveCount(criteriaCountBefore);
});

// Phase 7.5C — the onboarding-template test that used to live here was
// removed along with the Onboarding/Offboarding feature itself (Settings'
// "Checklist templates" section, the starter form, NewStarterScreen).
