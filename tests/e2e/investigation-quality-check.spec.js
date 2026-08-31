import { test, expect } from '@playwright/test';
import { login, openNewCaseModal, confirmOverrideReason } from './helpers.js';

// Manager Enablement (Phase 4, MP10, §16) — "Conclude investigation &
// generate report" (and every other trigger — the case's next-step
// banner, and the assigned investigator's own "Submit investigation"
// step) now runs computeInvestigationQualityGaps first. This covers the
// gaps-present path specifically; investigation-report.spec.js's own
// existing flow (a case with no allegations at all) already covers the
// no-gaps path unchanged — this test deliberately leaves a recorded
// allegation in the default "unreviewed" status to trigger a real gap.
//
// Also covers MP11, §17 — finalizeInvestigationSubmission creates a real
// hr_review_request once the report is generated, which the HR Review
// Gate panel (Overview tab) should show as awaiting review. Reuses this
// same flow rather than a separate E2E test: HrReviewGatePanel's own
// action-set/history logic is already covered directly by
// HrReviewGatePanel.test.jsx, so this only needs to prove the real
// submission path actually produces a visible request, not re-test the
// panel's own rendering rules.
test('an unreviewed allegation triggers the Investigation Quality Check, and submitting creates a real HR Review Gate request', async ({ page }) => {
  test.setTimeout(150000); // one real ~65s report-generation call, per investigation-report.spec.js's own measured margin
  const employeeName = `E2E InvQuality ${Date.now()}`;

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
  // Deliberately left in its default "unreviewed" status — never touched.

  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Start meeting' }).first().click();
  await page.getByText('Investigation', { exact: true }).click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  await page.getByPlaceholder(/Type or speak your meeting notes here/).waitFor({ timeout: 10000 });
  await page.getByPlaceholder(/Type or speak your meeting notes here/).fill(
    'HR: We are investigating the allegation. Employee: I have nothing further to add.'
  );
  await page.getByRole('button', { name: 'End meeting' }).click();
  // The now-linked case's own recorded (but unexplored) allegation trips
  // Meeting Intelligence's own, separate quality gate (M9's
  // computeMeetingQualityGaps: "Allegation not discussed in this
  // meeting") — same optional-dialog handling as case-roles.spec.js.
  const meetingQualityModal = page.getByRole('dialog').filter({ hasText: 'Meeting Quality Check' });
  const gotMeetingQualityCheck = await meetingQualityModal.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  if (gotMeetingQualityCheck) {
    await meetingQualityModal.getByRole('button', { name: 'Proceed anyway' }).click();
    await confirmOverrideReason(page);
  }
  await page.getByText('Meeting Dialogue', { exact: false }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /Save and go to case/ }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  const caseTabBar = page.locator('div')
    .filter({ has: page.getByRole('button', { name: 'Overview', exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Documents', exact: true }) })
    .last();
  await caseTabBar.getByRole('button', { name: 'Meetings', exact: true }).click();
  await expect(page.getByRole('button', { name: /Conclude investigation/ })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /Conclude investigation/ }).click();

  const qualityModal = page.getByRole('dialog').filter({ hasText: 'Investigation Quality Check' });
  await expect(qualityModal).toBeVisible({ timeout: 10000 });
  await expect(qualityModal.getByText('Allegation not yet explored: "Left site without authorisation"')).toBeVisible();

  await qualityModal.getByRole('button', { name: 'Proceed anyway' }).click();
  await confirmOverrideReason(page);
  await expect(page.getByText(/Report generated/)).toBeVisible({ timeout: 120000 });

  await caseTabBar.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByText('HR Review Gate', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Awaiting HR review', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Approve' })).toBeVisible();
});
