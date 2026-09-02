import { test, expect } from '@playwright/test';
import { login, startMeeting } from './helpers.js';

// Meeting Intelligence Phase 2 (M6) — the live inconsistency nudge only
// ever compared the current transcript against itself, so a contradiction
// with something said in an *earlier, already-saved* meeting on the same
// case went completely unnoticed live. updateMeetingIntelligence now
// pulls in a bounded excerpt of the case's recent prior meeting records
// when one exists for this employee, and is instructed to compare live
// statements against that too. Uses the spec's own worked example
// ("I did not speak with Sarah after the incident" vs. "When I spoke to
// Sarah afterwards...") across two real, separately-saved meetings —
// structure over exact wording, same as every other live-intelligence
// test in this suite.
test('a statement conflicting with an earlier saved meeting is flagged live in a later meeting', async ({ page }) => {
  test.setTimeout(180000); // two real meeting-record generations + one live-intelligence call
  const employeeName = `E2E CrossMeeting ${Date.now()}`;

  await login(page);

  // First meeting — establishes the earlier statement, then gets saved as
  // a real, completed meeting record on the case.
  await startMeeting(page);
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: /^Investigation/ }).click();
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  let notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });

  await notepad.fill('HR: Did you speak with Sarah at any point after the incident?\n');
  await notepad.fill('Employee: No, I did not speak with Sarah after the incident.\n');
  await notepad.fill('HR: Understood, thank you for confirming that.\n');

  await page.getByRole('button', { name: 'End meeting' }).click();
  await expect(page.getByText('Processing...')).not.toBeVisible({ timeout: 60000 });
  const saveButton = page.getByRole('button', { name: 'Save and go to case →' });
  await expect(saveButton).toBeVisible({ timeout: 10000 });
  await saveButton.click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // Second, separate meeting on the same employee — the conflicting
  // statement this time.
  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  await startMeeting(page);
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: /^Investigation/ }).click();
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });

  await notepad.fill('HR: Let\'s go back over the timeline once more.\n');
  await notepad.fill('Employee: When I spoke to Sarah afterwards, she mentioned something odd.\n');
  await notepad.fill('HR: I see, thank you for that detail.\n');

  await expect(page.getByText('Possible clarification required', { exact: true })).toBeVisible({ timeout: 30000 });
});
