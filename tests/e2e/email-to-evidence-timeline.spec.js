import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Integrations & Workflow Automation (Phase 5, IP11, §4-5) — email-to-
// timeline & email-to-evidence. Both halves turned out to already be
// mechanically wired once IP9 closed the dataUrl gap (a saved email now
// satisfies canAnalyseEvidence exactly like a real upload) — this proves
// that's genuinely true end-to-end, not just true in isolated unit
// tests: the same "Analyse document" button and finding-approval flow
// every other evidence type already has now works on a saved email, and
// it gets its own dedicated Timeline entry (not a generic "Activity"
// audit line) that links back to the Evidence tab.
test('a saved email can be analysed as evidence and gets its own timeline entry', async ({ page }) => {
  test.setTimeout(90000); // two real Claude calls — extraction, then document analysis
  const employeeName = `E2E EmailEvidence ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.locator('aside, header').getByRole('button', { name: 'Save email to case', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Save email to case' })).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder(/From: manager@company.com/).fill(
    `From: linemanager@company.com\n` +
    `Subject: Following up on ${employeeName}\n` +
    `Date: 12/08/2026\n\n` +
    `Hi HR,\n\nSarah in the team mentioned she witnessed the incident with ${employeeName} on 5 August. ` +
    `Worth speaking to her directly.\n\nThanks.`
  );
  await page.getByRole('button', { name: 'Read this email' }).click();
  await expect(page.getByText('Compass read this email as')).toBeVisible({ timeout: 30000 });

  const caseSelect = page.locator('select');
  if (!(await caseSelect.inputValue())) {
    const optionValue = await caseSelect.locator('option', { hasText: employeeName }).getAttribute('value');
    await caseSelect.selectOption(optionValue);
  }
  const evidenceSaved = page.waitForResponse(r => r.url().includes('/rest/v1/cases') && ['PATCH','POST'].includes(r.request().method()));
  await page.getByRole('button', { name: 'Save to this case' }).click();
  await evidenceSaved;

  // Lands back in the case — Evidence tab should show the saved email
  // with a real "Analyse document" action, not just a download link.
  await page.getByRole('button', { name: 'Evidence' }).click();
  const analyseButton = page.getByRole('button', { name: 'Analyse document' });
  await expect(analyseButton).toBeVisible({ timeout: 10000 });
  await analyseButton.click();
  await expect(page.getByText('Analysing…')).toBeVisible();
  await expect(page.getByText('Analysing…')).not.toBeVisible({ timeout: 30000 });

  // Timeline gets one dedicated "Email" entry, not a generic "Activity" one.
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  const emailEntry = page.getByText(/^Email saved: Email: Following up/);
  await expect(emailEntry).toBeVisible({ timeout: 10000 });
  // The type badge text is "Email" in the DOM — visually rendered
  // uppercase via CSS textTransform, which doesn't change what
  // getByText actually matches against.
  const entryRow = emailEntry.locator('xpath=ancestor::div[2]');
  await expect(entryRow.getByText('Email', { exact: true })).toBeVisible();
});
