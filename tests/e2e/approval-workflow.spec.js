import { test, expect } from '@playwright/test';
import { login, startMeeting, openCaseSection } from './helpers.js';

// Process Intelligence Phase 3 (P9) — hr_review_requests already existed
// for exactly one step ("record", meeting-record review) with no UI to
// ever respond to it. OutcomeModal now opens a second, genuinely
// different kind of review request for the spec's own approval-gated
// outcome types (final written warning, dismissal, ...) — same
// requestHrReview/respondToReview functions, generalized rather than
// duplicated. New ApprovalsPanel is the first real "respond to a review"
// UI in the app at all. Advisory tracking, not a hard send-block — see
// approvals.js's own note on that scope decision.
test('issuing an approval-gated outcome opens a visible, actionable approval request', async ({ page }) => {
  test.setTimeout(90000); // one real meeting-record generation

  await login(page);
  const employeeName = `E2E Approval ${Date.now()}`;
  await startMeeting(page);
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

  await openCaseSection(page, 'Outcome');
  await page.getByRole('button', { name: 'Issue outcome →' }).click();
  // .last() — the OutcomeTab card underneath the modal has the exact same
  // heading text ("Issue disciplinary outcome"); the modal's own copy
  // renders after it in the DOM.
  await expect(page.getByText('Issue disciplinary outcome', { exact: true }).last()).toBeVisible({ timeout: 10000 });

  // Scoped by its own placeholder option — the case header's investigator
  // select is still on the page underneath the modal and would otherwise
  // be the first <select> match.
  const outcomeSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Select outcome…' }) });
  await outcomeSelect.selectOption('Final written warning');
  await expect(page.getByText(/Final written warning requires sign-off/)).toBeVisible();
  // Process Intelligence (P11) — computeDecisionQualityGaps flags an
  // outcome with no documented rationale; this case has no allegations
  // recorded at all, so outcomeNotes is the only place that rationale
  // could live. Filling it in keeps this test on the direct "Issue
  // outcome" path — the quality-check gate itself has its own dedicated
  // coverage in decision-quality-check.spec.js.
  await page.getByPlaceholder('Any additional notes…').fill('Consistent with the disciplinary policy given the severity of the conduct.');

  const reviewSaved = page.waitForResponse(r => r.url().includes('/rest/v1/hr_review_requests') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Issue outcome & generate letter' }).click();
  await reviewSaved;
  await expect(page.getByText('Outcome recorded — approval requested', { exact: true })).toBeVisible({ timeout: 10000 });

  // Issuing the outcome also drafts a letter and navigates straight to its
  // editing screen (same as every other letter-generating action in the
  // app), and its own "← Back"/"Save to case" controls both re-save the
  // meeting and land elsewhere — not a route back to this case. Reach it
  // again the same way action-detection.spec.js does: Cases' own search
  // (Home Experience Redesign removed Home's own case search along with
  // the Active Cases table it belonged to).
  await expect(page.getByText('This letter was drafted by AI', { exact: false })).toBeVisible({ timeout: 90000 });
  await page.getByRole('button', { name: 'Cases', exact: true }).click();
  await page.getByPlaceholder('Search by employee…').fill(employeeName);
  await page.getByText(employeeName).first().click();
  await page.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByText('Approvals', { exact: true })).toBeVisible({ timeout: 10000 });
  // Scoped by the Approve button, not just hasText — a hasText-only chain
  // resolves to the innermost matching div, which is the label+status flex
  // row (it alone already contains both "Final written warning" and
  // "Awaiting approval"), not the outer card that also holds "Requested
  // by" and the Approve/Reject buttons.
  const approvalCard = page.locator('div').filter({ hasText: 'Final written warning' }).filter({ has: page.getByRole('button', { name: 'Approve', exact: true }) }).last();
  await expect(approvalCard).toBeVisible({ timeout: 10000 });
  await expect(approvalCard).toContainText('Awaiting approval');
  await expect(approvalCard).toContainText('Requested by', { timeout: 10000 });

  const reviewUpdated = page.waitForResponse(r => r.url().includes('/rest/v1/hr_review_requests') && r.request().method() === 'PATCH');
  await approvalCard.getByRole('button', { name: 'Approve', exact: true }).click();
  await reviewUpdated;
  // The label and status render as adjacent sibling <span>s with no
  // separating whitespace in the DOM, so their concatenated text is
  // "Final written warningApproved" — an anchored /^Approved$/ never
  // matches. Scope by "Requested by" (unique to the outer card, same as
  // above) and use toContainText for a plain substring check instead.
  const approvedCard = page.locator('div').filter({ hasText: 'Final written warning' }).filter({ hasText: 'Requested by' }).last();
  await expect(approvedCard).toContainText('Approved', { timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Approve', exact: true })).not.toBeVisible();
});
