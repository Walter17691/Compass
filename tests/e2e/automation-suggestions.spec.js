import { test, expect } from '@playwright/test';
import { login, openNewCaseModal, openCaseSection } from './helpers.js';

// Integrations & Workflow Automation (Phase 5, IP5, §22) — the one rule
// that's straightforwardly deterministic to trigger through the real UI
// without waiting on real wall-clock days to pass: an open task with a
// due date already in the past. Proves the Overview tab's new "Suggested
// for this case" panel (lib/automationRules.js's evaluateAutomationRules)
// actually renders from a genuine case_tasks row, not just in isolated
// component/unit tests.
test('an overdue task surfaces a suggestion on the case Overview tab', async ({ page }) => {
  const employeeName = `E2E Automation ${Date.now()}`;
  const taskName = `Chase witness statement ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await openCaseSection(page, 'Tasks');
  await page.getByRole('button', { name: '+ Add task' }).click();
  await page.getByPlaceholder('Task').fill(taskName);
  await page.locator('input[type="date"]').fill('2020-01-01');
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByText(taskName, { exact: true })).toBeVisible();

  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByText('Suggested for this case', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Review overdue task', { exact: true })).toBeVisible();
  await expect(page.getByText(`"${taskName}" was due 2020-01-01.`, { exact: true })).toBeVisible();
});
