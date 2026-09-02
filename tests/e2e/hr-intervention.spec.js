import { test, expect } from '@playwright/test';
import { login, openNewCaseModal, openCaseSection } from './helpers.js';

// Manager Enablement (Phase 4, MP19, §15) — HR Intervention actions.
// Reachable by the real HR E2E login (CaseViewScreen's own header
// button). Covers two representative actions end to end rather than all
// seven: "Send guidance" (writes a real, source-tagged case_task,
// verified via the Tasks tab) and "Pause investigation" (a real boolean
// on the case, verified via both the case header itself and MP18's own
// Delegated Work dashboard picking it up). The other five actions
// (add question / request witness / return for further work / reassign
// / take over) share the same two underlying mechanisms
// (sendHrGuidance's note-tagging, or the same case-save/audit shape as
// pause) and are already covered directly by HrInterventionModal.test.jsx.
test('sending guidance creates a real task, and pausing an investigation is reflected everywhere', async ({ page }) => {
  const employeeName = `E2E Intervene ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // Phase 2A (Compass Design Vision) — the case header's five equal-
  // weight action buttons (Mark confidential/Reassign/Assign
  // investigator/HR Intervention/+New meeting) collapsed into one
  // primary action + a "More actions" menu; every action below now
  // opens that menu first, same handlers, same effects, just one extra
  // click to reach them.
  await page.getByRole('button', { name: /More actions/ }).click();
  await page.getByRole('menuitem', { name: 'Assign investigator...' }).click();
  await expect(page.getByText('Investigator', { exact: true })).toBeVisible({ timeout: 10000 });
  const accessSaved = page.waitForResponse(r => r.url().includes('/rest/v1/case_access') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Assign investigator', exact: true }).click();
  await accessSaved;

  await page.getByRole('button', { name: /More actions/ }).click();
  await page.getByRole('menuitem', { name: 'HR Intervention' }).click();
  await expect(page.getByText('HR Intervention', { exact: true }).first()).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder('What should the investigator know?').fill('Please re-check the loading bay CCTV timestamps.');
  // Verified via the UI rather than a network-response race: local state
  // updates synchronously regardless of the background save, and
  // assignInvestigator's own checklist seeding (MP7) fires 7 of its own
  // case_tasks writes around the same time, making a generic
  // method+URL(+body) response filter unreliable to pin to this one
  // specific request.
  await page.getByRole('button', { name: 'Send guidance', exact: true }).click();

  await openCaseSection(page, 'Tasks');
  await expect(page.getByText('Guidance from HR: Please re-check the loading bay CCTV timestamps.', { exact: true })).toBeVisible({ timeout: 15000 });

  // Pause — a persistent "Paused" indicator now sits next to the case
  // status badge (Phase 2A), separate from the menu action that toggles
  // it, since that's genuine status information, not just an action.
  await page.getByRole('button', { name: /More actions/ }).click();
  await page.getByRole('menuitem', { name: 'HR Intervention' }).click();
  const caseSaved = page.waitForResponse(r => r.url().includes('/rest/v1/cases') && ['POST','PATCH'].includes(r.request().method()));
  await page.getByRole('button', { name: 'Pause investigation', exact: true }).click();
  await caseSaved;
  await expect(page.getByText('Paused', { exact: true }).first()).toBeVisible({ timeout: 10000 });

  // MP18's own dashboard picks the same flag up.
  await page.locator('aside, header').getByRole('button', { name: 'Work', exact: true }).click();
  await page.locator('aside, header').getByRole('button', { name: 'Delegated Work', exact: true }).click();
  await expect(page.getByText(employeeName, { exact: true })).toBeVisible({ timeout: 10000 });
  const row = page.getByText(employeeName, { exact: true }).locator('xpath=ancestor::div[3]');
  await expect(row.getByText('Paused', { exact: true })).toBeVisible();

  // Resume — flips the header button back.
  await row.getByRole('button', { name: 'Intervene', exact: true }).click();
  const caseResumed = page.waitForResponse(r => r.url().includes('/rest/v1/cases') && ['POST','PATCH'].includes(r.request().method()));
  await page.getByRole('button', { name: 'Resume investigation', exact: true }).click();
  await caseResumed;
  await expect(page.getByText(employeeName, { exact: true })).toBeVisible({ timeout: 10000 });
  const rowAfterResume = page.getByText(employeeName, { exact: true }).locator('xpath=ancestor::div[3]');
  await expect(rowAfterResume.getByText('Paused', { exact: true })).not.toBeVisible();
});
