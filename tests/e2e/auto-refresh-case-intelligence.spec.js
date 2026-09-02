import { test, expect } from '@playwright/test';
import { login, startMeeting } from './helpers.js';

// Meeting Intelligence Phase 2 (M7) — saving a meeting used to leave every
// ER Intelligence panel (Next Best Action, Unanswered Questions, Evidence
// Matrix) exactly as it was until HR manually clicked a "generate" button
// on each one separately. saveMeetingToCase() now silently fires
// generateInconsistencies/generateUnansweredQuestions/
// generateEvidenceSuggestions/generateNextBestAction for the just-saved
// case right after saving.
//
// Verified via Next Best Action specifically: CaseViewScreen only shows
// the "Ask Compass for its take" button when no next_action signal exists
// yet for the case (CaseViewScreen.jsx:298) — if a real signal already
// exists the moment the case view opens, that button is never shown at
// all, replaced by the signal's own card. That's a direct, reliable proof
// the auto-refresh actually ran, without asserting on the AI's wording.
test('saving a meeting auto-generates Next Best Action without a manual click', async ({ page }) => {
  test.setTimeout(90000); // one real meeting-record generation + one real Next Best Action call, fired in parallel with the other three silent passes
  const employeeName = `E2E AutoRefresh ${Date.now()}`;

  await login(page);
  await startMeeting(page);
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: /^Investigation/ }).click();
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  const notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });

  await notepad.fill('HR: Can you describe what happened on the day in question?\n');
  await notepad.fill('Employee: I was asked by my manager to cover an extra shift at short notice, and there was some confusion about the handover.\n');
  await notepad.fill('HR: Thank you, that context is helpful for the investigation.\n');

  await page.getByRole('button', { name: 'End meeting' }).click();
  await expect(page.getByText('Processing...')).not.toBeVisible({ timeout: 60000 });
  const saveButton = page.getByRole('button', { name: 'Save and go to case →' });
  await expect(saveButton).toBeVisible({ timeout: 10000 });
  await saveButton.click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Overview', exact: true }).click();

  // The auto-refresh call runs silently right after save, so by the time
  // this loads there should already be a real signal — never the
  // "generate it yourself" button.
  await expect(page.getByRole('button', { name: 'Ask Compass for its take' })).not.toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();
});
