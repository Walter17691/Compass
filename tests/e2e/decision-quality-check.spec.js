import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Process Intelligence Phase 3 (P11) — computeDecisionQualityGaps
// (src/lib/decisionQuality.js) gates OutcomeModal's "Issue outcome &
// generate letter" the same way computeMeetingQualityGaps gates ending a
// meeting: advisory only, never a hard block. "Go back" leaves the
// outcome unissued; "Create follow-up action" creates a real case task
// (same createCaseTask path CaseTasksPanel's own "+ Add task" uses) and
// still proceeds — mirrors MeetingQualityCheckModal's own two non-block
// exits exactly.
test('issuing an outcome with an undecided allegation is flagged, and can be sent back or actioned before proceeding', async ({ page }) => {
  test.setTimeout(90000); // one real meeting-record generation

  await login(page);
  const employeeName = `E2E QualityCheck ${Date.now()}`;
  await page.getByRole('button', { name: 'Start meeting' }).first().click();
  await page.getByText('Disciplinary', { exact: true }).click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  const notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });
  await notepad.fill('HR: We are here to discuss the outcome of the investigation.\n');
  await notepad.fill('Employee: Understood.\n');
  await page.getByRole('button', { name: 'End meeting' }).click();

  const qualityModal = page.getByRole('dialog').filter({ hasText: 'Meeting Quality Check' });
  const gotQualityCheck = await qualityModal.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
  if (gotQualityCheck) {
    await page.getByRole('button', { name: 'Proceed anyway' }).click();
    await page.getByRole('dialog', { name: 'Proceed anyway?' }).getByRole('button', { name: 'Proceed', exact: true }).click();
  }
  await expect(page.getByText('Compass HR Advisor', { exact: true })).toBeVisible({ timeout: 90000 });
  await page.getByRole('button', { name: /Save and go to case/ }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  const caseTabBar = page.locator('div')
    .filter({ has: page.getByRole('button', { name: 'Overview', exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Documents', exact: true }) })
    .last();

  // An allegation left undecided (still "unreviewed") is the simplest,
  // most reliable way to guarantee at least one gap.
  await caseTabBar.getByRole('button', { name: 'Allegations', exact: true }).click();
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Unauthorised absence');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (1)')).toBeVisible();

  await caseTabBar.getByRole('button', { name: 'Outcome', exact: true }).click();
  await page.getByRole('button', { name: 'Issue outcome →' }).click();
  await expect(page.getByText('Issue disciplinary outcome', { exact: true }).last()).toBeVisible({ timeout: 10000 });
  const outcomeSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Select outcome…' }) });
  await outcomeSelect.selectOption('No further action');
  await page.getByRole('button', { name: 'Issue outcome & generate letter' }).click();

  // aria-labelledby points at the h3 subtitle, not the "Decision Quality
  // Check" eyebrow label above it — match on that instead.
  const qualityCheck = page.getByRole('dialog', { name: 'A few things worth checking before this outcome goes out' });
  await expect(qualityCheck).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Decision Quality Check', { exact: true })).toBeVisible();
  await expect(qualityCheck.getByText('Allegation not yet decided: "Unauthorised absence"')).toBeVisible();

  // "Go back" — the outcome is not issued, OutcomeModal is still open.
  await qualityCheck.getByRole('button', { name: 'Go back' }).click();
  await expect(qualityCheck).not.toBeVisible();
  await expect(page.getByText('Issue disciplinary outcome', { exact: true }).last()).toBeVisible();

  // Try again — this time "Create follow-up action": a real task is
  // created and the outcome still proceeds (never a hard block). Checked
  // by OutcomeModal closing, not by waiting for the letter itself to
  // finish drafting — that AI call, and its success, is already covered
  // by approval-workflow.spec.js; re-waiting on it here just couples this
  // test's stability to an unrelated, independently-flaky AI response.
  await page.getByRole('button', { name: 'Issue outcome & generate letter' }).click();
  await expect(qualityCheck).toBeVisible({ timeout: 10000 });
  await qualityCheck.getByRole('button', { name: 'Create follow-up action' }).click();
  await expect(qualityCheck).not.toBeVisible();
  await expect(page.getByText('Issue disciplinary outcome', { exact: true })).not.toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByPlaceholder('Search cases…').fill(employeeName);
  await page.getByText(employeeName).first().click();
  await caseTabBar.getByRole('button', { name: /^Tasks/ }).click();
  await expect(page.getByText(/Follow up on:.*Allegation not yet decided/)).toBeVisible({ timeout: 10000 });
});
