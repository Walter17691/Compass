import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Phase 10 of the gap-analysis build-out: getCaseStage()/getNextStep()
// generalized from one hardcoded disciplinary-shaped lifecycle into a
// small per-case-type table (disciplinary default + grievance — probation
// stays on DevelopScreen's own separate flow, per the confirmed decision
// not to fold it in). This proves a grievance case gets grievance-shaped
// guidance from creation, not the disciplinary "Schedule investigation
// meeting" default, and that the Meetings tab shows a "Grievance" pill
// instead of the disciplinary Investigation/Disciplinary split.
test('a grievance case gets grievance-shaped Copilot guidance and meeting grouping, not the disciplinary default', async ({ page }) => {
  const employeeName = `E2E Grievance ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('grievance');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // Case Copilot recommends the grievance-shaped first step, not the
  // disciplinary default.
  await expect(page.getByText('Next: Schedule grievance meeting')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Schedule investigation meeting')).not.toBeVisible();

  // Meetings tab groups by "Grievance", not Investigation/Disciplinary.
  await page.getByRole('button', { name: 'Meetings', exact: true }).click();
  await expect(page.getByRole('button', { name: /^Grievance/ })).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: /^Investigation/ })).not.toBeVisible();
  await expect(page.getByRole('button', { name: /^Disciplinary/ })).not.toBeVisible();
  await expect(page.getByText('No grievance meetings yet')).toBeVisible();

  // Clicking the Copilot's primary action starts a meeting pre-set to
  // the "Grievance" type, not "Disciplinary". Go back to Overview first
  // since the banner is visible from every tab.
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await page.getByRole('button', { name: /Schedule grievance meeting →/ }).click();
  await expect(page.getByRole('button', { name: 'Start meeting', exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Grievance', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  await expect(page.getByPlaceholder(/Type or speak your meeting notes here/)).toBeVisible({ timeout: 10000 });
});
