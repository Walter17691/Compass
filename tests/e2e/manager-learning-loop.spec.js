import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Manager Enablement (Phase 4, MP21, §25) — Manager Learning Loop. Sends
// one real HR Intervention guidance note (MP19's own flow — a real,
// source-tagged case_task) to give collectInterventionSignals something
// genuine to analyse, then generates a real Manager Capability Insight
// from it. Includes a real AI call, same discipline as concerns.spec.js's
// own triage-summary assertion: only structure is asserted (a category
// card and a suggested-response block exist), never exact AI wording.
test('sending HR guidance produces a real signal a Manager Capability Insight can be generated from', async ({ page }) => {
  test.setTimeout(60000); // includes one real AI call
  const employeeName = `E2E Learning ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Assign investigator...' }).click();
  await expect(page.getByText('Investigator', { exact: true })).toBeVisible({ timeout: 10000 });
  const accessSaved = page.waitForResponse(r => r.url().includes('/rest/v1/case_access') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Assign investigator', exact: true }).click();
  await accessSaved;

  await page.getByRole('button', { name: 'HR Intervention', exact: true }).click();
  await expect(page.getByText('HR Intervention', { exact: true }).first()).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder('What should the investigator know?').fill('Investigator did not follow up on the CCTV lead HR flagged earlier.');
  await page.getByRole('button', { name: 'Send guidance', exact: true }).click();

  await page.locator('aside, header').getByRole('button', { name: 'Performance Insights', exact: true }).click();
  await expect(page.getByText('Manager Performance Insights', { exact: true })).toBeVisible({ timeout: 10000 });

  const generateBtn = page.getByRole('button', { name: 'Generate insight', exact: true });
  await expect(generateBtn).toBeEnabled({ timeout: 10000 });
  await generateBtn.click();

  await expect(page.getByText('Generating…', { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/Generated .+ · based on \d+ recorded intervention/)).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Suggested response:', { exact: true })).toBeVisible();
});
