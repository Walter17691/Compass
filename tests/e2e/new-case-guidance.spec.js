import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Every case created by starting a meeting first gets Case Copilot's
// "Next: ..." guidance banner as soon as it exists, because getCaseStage()
// falls through to inferring "intake" for a case with no meetings and no
// tracked stage. Cases created via "+ New case" used to hardcode
// stage:"open" — a value getNextStep()'s switch doesn't recognise, so it
// silently returned null forever, even after meetings were added, unless
// the case happened to pass through one of the specific transitions that
// explicitly overwrite cs.stage. The single most visible "start a new
// case" button on Home produced cases with no next-step guidance at all.
test('a case created via "+ New case" gets Case Copilot guidance immediately, not just cases started from a meeting', async ({ page }) => {
  const employeeName = `E2E NewCaseGuidance ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();

  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/^Next: /)).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: /Schedule investigation meeting/ })).toBeVisible();
});
