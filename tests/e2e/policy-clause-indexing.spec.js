import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Process Intelligence Phase 3 (P4) — before this, an uploaded policy was
// just one undifferentiated blob of raw text, only ever consumed as
// context stuffed into an AI prompt (getPolicyCtx) — no way to cite a
// specific provision. handlePolicyUpload now also awaits a real AI call
// (indexPolicyClauses) extracting short, quotable clauses per policy,
// stored on the policy object and shown inline in the library. This is
// the foundation P5/P6/P10 build their own policy citations on (via the
// new PolicyCitation component) — not yet wired into those features
// here, but genuinely indexed and visible on upload.
test('an uploaded policy is indexed into quotable clauses, visible inline in the library', async ({ page }) => {
  test.setTimeout(60000); // real clause-extraction AI call
  await login(page);
  await page.getByRole('button', { name: /View all policies & templates/ }).click();
  await expect(page.getByRole('heading', { name: 'Company policies' })).toBeVisible({ timeout: 10000 });

  const policyName = `E2E ClauseIndex ${Date.now()}`;
  await page.locator('input[type="file"]').setInputFiles({
    name: `${policyName}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Disciplinary Policy\n\n' +
      'Employees should normally receive at least 48 hours written notice of a disciplinary hearing.\n\n' +
      'Employees have the right to be accompanied by a colleague or trade union representative at any formal disciplinary hearing.\n\n' +
      'Any decision to dismiss must be confirmed in writing within 5 working days of the hearing, and must set out the right of appeal.'
    ),
  });

  const row = page.locator('div').filter({ hasText: policyName }).filter({ has: page.locator('select') }).last();
  await expect(row.locator('select')).toBeVisible({ timeout: 45000 });

  const clausesToggle = row.getByRole('button', { name: /clauses? indexed/ });
  await expect(clausesToggle).toBeVisible();
  await clausesToggle.click();

  // Structure over exact AI wording, same discipline as every other
  // generated-content test in this suite — some clause with real quoted
  // text should be visible, not asserting the model's specific phrasing.
  await expect(page.locator('div').filter({ hasText: /^“.+”$/ }).first()).toBeVisible();

  await clausesToggle.click();
  await expect(page.locator('div').filter({ hasText: /^“.+”$/ })).toHaveCount(0);
});

test('the policy category list includes Reasonable Adjustments and Hybrid Working', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: /View all policies & templates/ }).click();
  await expect(page.getByRole('heading', { name: 'Company policies' })).toBeVisible({ timeout: 10000 });

  await page.locator('input[type="file"]').setInputFiles({
    name: `E2E CategoryCheck ${Date.now()}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from('Placeholder policy text.'),
  });
  const select = page.locator('select').last();
  await expect(select).toBeVisible({ timeout: 45000 });
  await expect(select.locator('option', { hasText: 'Reasonable Adjustments' })).toHaveCount(1);
  await expect(select.locator('option', { hasText: 'Hybrid Working' })).toHaveCount(1);
});
