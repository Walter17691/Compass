import { test, expect } from '@playwright/test';
import { login, openNewCaseModal, openCaseSection } from './helpers.js';

// Integrations & Workflow Automation (Phase 5, IP8, §27) — automatic
// hearing pack. Unlike Command Bar's own AI-parsing step, this is fully
// deterministic (buildHearingPackSections is pure aggregation, no Claude
// call — see lib/hearingPack.js's own header comment), so a real E2E
// download assertion is a good fit here, same pattern as
// timeline-intelligence.spec.js's own PDF export check.
test('Generate Hearing Pack downloads a PDF from the Documents tab', async ({ page }) => {
  const employeeName = `E2E Hearing Pack ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await openCaseSection(page, 'Allegations');
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Hearing pack test allegation');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (1)')).toBeVisible();

  await openCaseSection(page, 'Documents');
  await expect(page.getByRole('button', { name: 'Generate Hearing Pack' })).toBeVisible({ timeout: 10000 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Generate Hearing Pack' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toContain('Hearing_Pack.pdf');
});
