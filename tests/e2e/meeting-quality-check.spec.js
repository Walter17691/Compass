import { test, expect } from '@playwright/test';
import { login, confirmOverrideReason } from './helpers.js';

// Meeting Intelligence Phase 2 (M9) — "End meeting" used to jump straight
// to handleReview with no check at all, so an essential prep question left
// unasked (or a witness/evidence mention never actioned) just silently
// disappeared into the record with nothing flagging it back to HR. Now
// "End meeting" always calls attemptEndMeeting first: computeMeetingQualityGaps
// is a deterministic re-read of state M1/M3/M4 already computed, and if it
// finds anything a non-blocking modal appears with Return to meeting /
// Create follow-up action / Proceed anyway. Never a gate — every exit path
// still ends the meeting.
test('an unasked essential question surfaces a non-blocking quality check before the meeting ends', async ({ page }) => {
  test.setTimeout(120000); // real prep-pack generation (markdown + structured questions) plus meeting record generation
  const employeeName = `E2E QualityCheck ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: 'Start meeting' }).first().click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: /^Investigation/ }).click();
  await page.getByRole('button', { name: 'Prepare meeting' }).click();
  await page.getByPlaceholder(/Previous warnings, allegations/).fill(
    'Employee is alleged to have left their shift early on 5 August without authorisation.'
  );
  await page.getByRole('button', { name: 'Generate prep pack' }).click();

  await expect(page.getByText('Prep pack ready')).toBeVisible({ timeout: 60000 });
  const questionRows = page.locator('input[placeholder="Question text..."]');
  await expect(questionRows.first()).toBeVisible({ timeout: 45000 });

  // Add our own question and mark it essential — guarantees at least one
  // essential, unambiguous, never-asked question regardless of what the AI
  // happened to generate or mark essential on its own.
  await page.getByRole('button', { name: '+ Add question' }).click();
  await questionRows.last().fill('Can you confirm the exact time you left the building?');
  await page.getByRole('button', { name: 'Mark as essential' }).last().click();
  await expect(page.getByRole('button', { name: 'Essential — click to unmark' }).last()).toBeVisible();

  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  const notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });

  // Deliberately never ask the essential question — just some unrelated notes.
  await notepad.fill('HR: Thank you for coming in today.\n');
  await notepad.fill('Employee: Of course, happy to help.\n');

  await page.getByRole('button', { name: 'End meeting' }).click();

  const qualityModal = page.getByRole('dialog');
  await expect(qualityModal.getByText('Meeting Quality Check', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(qualityModal.getByText(/Essential question not yet asked.*Can you confirm the exact time you left the building/)).toBeVisible();

  // "Return to meeting" dismisses the modal without ending the meeting.
  await page.getByRole('button', { name: 'Return to meeting' }).click();
  await expect(qualityModal).not.toBeVisible();
  await expect(notepad).toBeVisible();

  // End meeting again and this time proceed past the check — the meeting
  // should still end normally, exactly as it always has.
  await page.getByRole('button', { name: 'End meeting' }).click();
  await expect(qualityModal.getByText('Meeting Quality Check', { exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Proceed anyway' }).click();
  // P1 — proceeding past an unresolved gap now asks for an optional
  // reason before actually proceeding.
  await confirmOverrideReason(page);

  await expect(page.getByText('Processing...')).not.toBeVisible({ timeout: 60000 });
  await expect(page.getByRole('button', { name: 'Save and go to case →' })).toBeVisible({ timeout: 10000 });
});
