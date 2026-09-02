import { test, expect } from '@playwright/test';
import { login, openNewCaseModal, openCaseSection } from './helpers.js';

// Process Intelligence Phase 3 (P15, §13) — the Case Risk Panel
// (Overview tab) is an aggregator over what earlier phases already
// compute (P6's guardrail signals, P7's policy deviation audit
// entries, P8's role conflicts, P13's appeal grounds) plus a few new
// deterministic checks — evidence gap and missing medical info are the
// two that need no meeting/AI generation at all to exercise, so this
// test stays lightweight. See caseRisk.test.js for the other
// categories' unit coverage.
test('case risk panel surfaces an evidence gap and missing medical info, with a working "Ask why" drill-down', async ({ page }) => {
  test.setTimeout(60000);
  await login(page);
  const employeeName = `E2E CaseRisk ${Date.now()}`;

  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  // The quick-create dropdown's raw value is "absence", not "attendance"
  // — getProcessType still maps it to the "attendance" process type
  // (lib/processStages.js's own matches list), which is what
  // computeCaseRisk's missing-medical-info check is gated behind.
  await page.locator('label:text-is("Case type") + select').selectOption('absence');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await openCaseSection(page, 'Allegations');
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Unauthorised absence');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (1)')).toBeVisible();

  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByText('Case risk', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('A list of things worth a second look', { exact: false })).toBeVisible();

  await expect(page.getByText('Evidence gap (1)', { exact: true })).toBeVisible();
  const evidenceGapItem = page.getByText('No evidence linked: "Unauthorised absence"', { exact: true });
  await expect(evidenceGapItem).toBeVisible();

  await expect(page.getByText('Missing medical info (1)', { exact: true })).toBeVisible();
  await expect(page.getByText('No wellbeing or medical context recorded for this employee', { exact: true })).toBeVisible();

  // "Ask why" only renders for items with a source to show — the
  // evidence-gap item has one (the allegation itself), missing-medical-
  // info deliberately doesn't.
  const evidenceGapCard = evidenceGapItem.locator('xpath=..');
  await evidenceGapCard.getByRole('button', { name: 'Ask why' }).click();
  await expect(page.getByText('Why Compass is saying this', { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(page.getByRole('heading', { name: 'No evidence linked: "Unauthorised absence"' })).toBeVisible();
});
