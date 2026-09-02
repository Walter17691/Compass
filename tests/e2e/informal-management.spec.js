import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Manager Enablement (Phase 4, MP6, §6) — "Deal with informally" used to
// just flip the referral's status with nothing to show for it. It now
// launches a real, guided conversation (the existing "Informal / 1-1"
// meeting type) pre-filled from the referral, and closes the loop back
// onto the referral once the meeting is actually saved to a brand-new
// case (tagged caseType:"informal"). Two real Claude calls happen in this
// flow (the MP5 triage summary on submit, and the meeting record on "End
// meeting") — same discipline as concerns.spec.js and
// post-meeting-review.spec.js: assert structure, not exact AI wording.
test('dealing with a concern informally launches a real conversation and closes the loop', async ({ page }) => {
  test.setTimeout(90000);
  const employeeName = `E2E Informal ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: 'Work', exact: true }).click();
  await page.getByRole('button', { name: 'Concerns', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'People concerns' })).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: '+ Raise a concern' }).click();
  await page.getByPlaceholder("Who is this about?").fill(employeeName);
  await page.getByPlaceholder(/What happened/).fill('Turned up late to three shifts this month with no explanation given.');
  const saveResponse = page.waitForResponse(r => r.url().includes('/rest/v1/concern_referrals') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Submit concern' }).click();
  await saveResponse;

  const referralCard = page.locator('div').filter({ hasText: employeeName }).filter({ hasText: 'Deal with informally' }).last();
  await expect(referralCard).toBeVisible({ timeout: 10000 });
  await referralCard.getByRole('button', { name: 'Deal with informally' }).click();

  // Lands on the meeting-setup screen with the employee and meeting type
  // already pre-filled (startInformalConversation, App.jsx) — nothing to
  // re-enter here, unlike a from-scratch meeting.
  await expect(page.getByRole('heading', { name: 'New meeting' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByPlaceholder('e.g. Sarah Johnson')).toHaveValue(employeeName);

  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  const notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });
  await notepad.fill('Discussed the recent lateness with the employee, agreed on-time arrival expectations going forward and set a two-week review point.');

  await page.getByRole('button', { name: 'End meeting' }).click();
  await expect(page.getByText('Processing...')).not.toBeVisible({ timeout: 60000 });

  const caseSaved = page.waitForResponse(r => r.url().includes('/rest/v1/cases') && ['POST','PATCH'].includes(r.request().method()));
  await page.getByRole('button', { name: 'Save and go to case →' }).click();
  await caseSaved;
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: '← Cases' })).toBeVisible();

  // Closes the loop — back on the Concerns screen the same referral now
  // shows as handled informally with a link into the record it produced,
  // instead of still sitting in the open queue.
  await page.getByRole('button', { name: 'Concerns', exact: true }).click();
  const resolvedCard = page.locator('div').filter({ hasText: employeeName }).filter({ hasText: 'View the conversation record' }).last();
  await expect(resolvedCard).toBeVisible({ timeout: 10000 });
  await expect(resolvedCard.getByText('Handled informally')).toBeVisible();
});
