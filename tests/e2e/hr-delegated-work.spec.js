import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Manager Enablement (Phase 4, MP18, §14) — HR Delegated Work dashboard.
// Unlike ManagerPortalScreen (MP16), this screen is HR-only and reachable
// by the real E2E login. The shared E2E org has only one real member
// (documented in case-roles.spec.js), so this assigns HR to itself as
// investigator — same established workaround as investigation-assignment.spec.js.
// Interview checklist steps are toggled directly from the Tasks tab
// (ordinary case_tasks, toggleable by anyone with case access, not
// gated to whoever the investigator is) to reach the "attention
// suggested" state without needing a second identity to actually
// conduct interviews.
test('a delegated investigation with completed interviews but an unreviewed allegation is flagged for HR attention', async ({ page }) => {
  const employeeName = `E2E Delegated ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Allegations', exact: true }).click();
  await expect(page.getByText('Allegations (0)')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Left site without authorisation');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (1)')).toBeVisible();
  // Deliberately left "unreviewed" — never touched.

  // Phase 2A — "Assign investigator..." moved into the header's "More
  // actions" menu; the primary button is occupied by the real next-step
  // recommendation instead.
  await page.getByRole('button', { name: /More actions/ }).click();
  await page.getByRole('menuitem', { name: 'Assign investigator...' }).click();
  await expect(page.getByText('Investigator', { exact: true })).toBeVisible({ timeout: 10000 });
  const accessSaved = page.waitForResponse(r => r.url().includes('/rest/v1/case_access') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Assign investigator', exact: true }).click();
  await accessSaved;

  const caseTabBar = page.locator('div')
    .filter({ has: page.getByRole('button', { name: 'Overview', exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Documents', exact: true }) })
    .last();
  await caseTabBar.getByRole('button', { name: /^Tasks/ }).click();
  await expect(page.getByText('Interview witnesses', { exact: true })).toBeVisible({ timeout: 10000 });

  const checkTask = async (name) => {
    const row = page.getByText(name, { exact: true }).locator('xpath=ancestor::div[2]');
    const taskSaved = page.waitForResponse(r => r.url().includes('/rest/v1/case_tasks') && r.request().method() === 'POST');
    await row.getByRole('checkbox').check();
    await taskSaved;
  };
  await checkTask('Interview witnesses');
  await checkTask('Interview the employee');

  await page.locator('aside, header').getByRole('button', { name: 'Delegated Work', exact: true }).click();
  await expect(page.getByText('Delegated Work', { exact: true }).first()).toBeVisible({ timeout: 10000 });

  const row = page.getByText(employeeName, { exact: true }).locator('xpath=ancestor::div[3]');
  await expect(row).toBeVisible({ timeout: 10000 });
  await expect(row.getByText('HR attention suggested', { exact: true })).toBeVisible();
  await expect(row.getByText(/Interviews are complete but an allegation is still unreviewed/)).toBeVisible();
  await expect(row.getByText('Progress: 2 of 7 steps', { exact: true })).toBeVisible();
});
