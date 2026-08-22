import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Phase 21 of the reasoning-layer build-out — Case Memory hardening.
// buildCaseContext() (lib/caseContext.js) previously never included an
// allegation's decision reasoning at all, despite it being the single
// most decision-relevant fact on a concluded allegation. This proves the
// data actually reaches the AI's context, not just that the UI plumbing
// compiles: Ask Compass is asked a question whose answer only exists in
// the decision reasoning text, using a distinctive detail invented for
// this test so a correct answer can only mean the context genuinely
// carried it through App.jsx's buildHardenedCaseContext.
test('decision reasoning reaches Ask Compass through the hardened case context', async ({ page }) => {
  test.setTimeout(60000);
  const employeeName = `E2E Memory ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Allegations', exact: true }).click();
  await expect(page.getByText('Allegations (0)')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Unauthorised absence');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (1)')).toBeVisible();

  await page.getByText('Unauthorised absence').last().click();
  const statusSaved = page.waitForResponse(r => r.url().includes('/rest/v1/allegations') && ['POST','PATCH'].includes(r.request().method()));
  await page.locator('label:text-is("Status") + select').selectOption('substantiated');
  await statusSaved;
  const reasoningField = page.getByPlaceholder(/Summarise what the evidence showed/);
  const reasoningSaved = page.waitForResponse(r => r.url().includes('/rest/v1/allegations') && ['POST','PATCH'].includes(r.request().method()));
  // A distinctive, made-up detail (an exact badge-out time) that has no
  // plausible source other than this exact field reaching the AI's
  // context — a generic-sounding reasoning string wouldn't prove
  // anything, since a model could produce something plausible-sounding
  // regardless of what it actually received.
  await reasoningField.fill('Swipe-card records show the employee badged out at 15:47 without authorisation, confirmed by their line manager.');
  await reasoningField.blur();
  await reasoningSaved;

  await page.getByRole('button', { name: 'AI Assistant', exact: true }).click();
  await expect(page.getByText('AI case overview')).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder(/What evidence supports/).fill('According to the decision reasoning on the Unauthorised absence allegation, what exact time did the employee badge out?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText('Thinking…')).toBeVisible();
  await expect(page.locator('div').filter({ hasText: /^Thinking…$/ })).toHaveCount(0, { timeout: 30000 });
  await expect(page.getByText('15:47')).toBeVisible();
});
