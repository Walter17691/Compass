import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Manager Enablement (Phase 4, MP8, §9) — distinct from the fixed generic
// 7-step checklist (investigationChecklist.js, seeded automatically on
// assignment): this is a real AI call producing concrete, case-specific
// action items grounded only in the allegations/evidence already on file.
// HR reaches it from the Tasks tab (CaseTasksPanel); the investigator's
// own restricted view of the same plan (InvestigatorChecklistView) can't
// be reached by the shared E2E account (same single-test-account
// constraint as every other restricted-view spec this phase) and is
// covered instead by InvestigatorChecklistView.test.jsx. Same discipline
// as concerns.spec.js's own AI assertions: structure, not exact wording.
test('generating an investigation plan adds case-specific tasks, tagged and visible in the Tasks tab', async ({ page }) => {
  test.setTimeout(60000); // one real AI call
  const employeeName = `E2E InvPlan ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Allegations', exact: true }).click();
  await expect(page.getByText('Allegations (0)')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Left site without authorisation, witnessed by Priya Shah');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (1)')).toBeVisible();

  // The case workspace's own "Tasks" tab shares its label with the
  // top-nav "Tasks" destination visible on the same page — scope to the
  // tab bar itself (same pattern as tasks.spec.js/case-changes.spec.js).
  const caseTabBar = page.locator('div')
    .filter({ has: page.getByRole('button', { name: 'Overview', exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Documents', exact: true }) })
    .last();
  await caseTabBar.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByText('Tasks (0 open)')).toBeVisible({ timeout: 10000 });

  const generateBtn = page.getByRole('button', { name: 'Generate investigation plan' });
  await expect(generateBtn).toBeVisible();
  await generateBtn.click();
  await expect(page.getByRole('button', { name: 'Compass is drafting a plan…' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Compass is drafting a plan…' })).not.toBeVisible({ timeout: 30000 });

  await expect(page.getByText('Plan', { exact: true }).first()).toBeVisible({ timeout: 10000 });
});
