import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Covers two real bugs found in the same flow:
//
// 1. ReviewScreen's primary "Save and go to case →" button only ever
//    called saveMeetingToCase() with no navigation after it — despite the
//    label promising it, the user was silently left on the Review screen.
//    saveMeetingToCase() now navigates to the saved case itself (mirroring
//    what the witness-interview branch, and the signature-completion flow,
//    already did correctly).
//
// 2. "Conclude investigation & generate report" used to just concatenate
//    each investigation meeting's raw record — which itself contains a
//    literal "## Meeting Dialogue" section, by design, since that's the
//    correct content for a *meeting record* — under an "Investigation
//    Report" heading. No synthesis, no allegations, no findings, no
//    recommendation. concludeInvestigation() now feeds the full meeting
//    content to the AI with the report-appropriate prompt instead.
test('investigation meeting saves straight into the case, and the generated report synthesises findings instead of pasting the dialogue', async ({ page }) => {
  // The report call is non-streaming (stream:false, matching handleLetter's
  // existing pattern for every other letter/report type in the app) so
  // nothing renders until the full ~3000-token completion is done server
  // side — observed ~65s for a short two-line test meeting. Generous
  // margins here reflect real AI latency, not flakiness.
  test.setTimeout(150000);
  const employeeName = `E2E InvReport ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: 'Start meeting' }).click();
  await page.getByText('Investigation', { exact: true }).click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  await page.getByPlaceholder(/Type or speak your meeting notes here/).waitFor({ timeout: 10000 });

  await page.getByPlaceholder(/Type or speak your meeting notes here/).fill(
    'HR: We are investigating the allegation that you left your shift early on 3 August without authorisation.\n' +
    'Employee: I told my supervisor Dave and he said it was fine, my child was ill.\n' +
    'HR: We will confirm that with Dave before reaching any findings.'
  );
  await page.getByRole('button', { name: 'End meeting' }).click();
  await page.getByText('Meeting Dialogue', { exact: false }).waitFor({ timeout: 30000 });

  // Bug 1: this used to leave the user stranded on the Review screen.
  await page.getByRole('button', { name: /Save and go to case/ }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  // "Conclude investigation" lives on the Meetings tab (case workspace
  // tab restructure) — not the default landing tab (Overview).
  await page.getByRole('button', { name: 'Meetings', exact: true }).click();
  await expect(page.getByRole('button', { name: /Conclude investigation/ })).toBeVisible({ timeout: 10000 });

  // Bug 2: generate the report and check it's a synthesis, not a dialogue dump.
  await page.getByRole('button', { name: /Conclude investigation/ }).click();
  await expect(page.getByText(/Report generated/)).toBeVisible({ timeout: 120000 });
  await page.getByRole('button', { name: 'View report' }).click();

  const reportText = await page.locator('body').innerText();
  expect(reportText).not.toContain('Meeting Dialogue');
  expect(reportText.toLowerCase()).toMatch(/allegation/);
  expect(reportText.toLowerCase()).toMatch(/finding|recommend/);
});
