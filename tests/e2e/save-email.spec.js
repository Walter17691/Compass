import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Phase 24 of the reasoning-layer build-out — Email integration
// groundwork. Real Outlook/Gmail integration needs OAuth app registration
// only the org owner can do, so this is the manual half: paste an email,
// Compass suggests which case it belongs to, and the user explicitly
// confirms before anything is saved. Designed so a later webhook adapter
// feeds the same pipeline (lib/emailIngestion.js) rather than a new one.
test('pasting an email suggests the matching case and saves it as evidence once confirmed', async ({ page }) => {
  test.setTimeout(60000); // one real Claude call
  const employeeName = `E2E SaveEmail ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // Save email to case lives inside the "HR Processes" sidebar group,
  // which now starts collapsed (Home Composition Review, final
  // refinement item 3).
  await page.locator('aside, header').getByRole('button', { name: 'HR Processes' }).click();
  await page.locator('aside, header').getByRole('button', { name: 'Save email to case', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Save email to case' })).toBeVisible({ timeout: 10000 });

  await page.getByPlaceholder(/From: manager@company.com/).fill(
    `From: linemanager@company.com\n` +
    `Subject: Following up on ${employeeName}\n` +
    `Date: 12/08/2026\n\n` +
    `Hi HR,\n\nJust flagging that I spoke with ${employeeName} again today about the ongoing matter. ` +
    `They confirmed they understood the process and asked when the next meeting would be.\n\nThanks.`
  );
  await page.getByRole('button', { name: 'Read this email' }).click();
  await expect(page.getByText('Reading the email…')).toBeVisible();
  await expect(page.getByText('Compass read this email as')).toBeVisible({ timeout: 30000 });

  // The employee is named clearly and uniquely enough that Compass should
  // suggest the real case — but this doesn't assert on the auto-match
  // itself (an AI call), only that confirming a case is always required
  // before saving: select it explicitly if no match pre-filled the value.
  const caseSelect = page.locator('select');
  if (!(await caseSelect.inputValue())) {
    const optionValue = await caseSelect.locator('option', { hasText: employeeName }).getAttribute('value');
    await caseSelect.selectOption(optionValue);
  }

  const saveButton = page.getByRole('button', { name: 'Save to this case' });
  await expect(saveButton).toBeEnabled();
  const evidenceSaved = page.waitForResponse(r => r.url().includes('/rest/v1/cases') && ['PATCH','POST'].includes(r.request().method()));
  await saveButton.click();
  await evidenceSaved;

  // Saving navigates straight into the case (App.jsx's saveEmailToCase).
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Evidence' }).click();
  await expect(page.getByText(new RegExp(`Email: Following up on ${employeeName}|Pasted email`))).toBeVisible({ timeout: 10000 });
});
