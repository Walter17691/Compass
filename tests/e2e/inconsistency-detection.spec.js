import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Phase 3 of the reasoning-layer build-out (meeting intelligence, after
// the ER Intelligence MVP). Compares meeting records pairwise for
// specific, quotable conflicts — live-verified separately for wording
// (never an accusation, per the spec's own constraint). This proves the
// UI wiring: two meetings with a real, deliberate time conflict produce a
// signal with two real source_refs, and the disposition actions work.
test('Compass flags a potential inconsistency between two meeting records and it can be explained away', async ({ page }) => {
  test.setTimeout(90000); // two meeting-record saves plus one inconsistency-check call
  const employeeName = `E2E Inconsistency ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: 'Start meeting' }).click();
  await page.getByText('Investigation', { exact: true }).click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  await page.getByPlaceholder(/Type or speak your meeting notes here/).waitFor({ timeout: 10000 });
  await page.getByPlaceholder(/Type or speak your meeting notes here/).fill(
    'HR: Can you talk me through what time you left the venue on the night of 6 August?\n' +
    'Employee: Yes, I left the staff car park at exactly 21:15 on 6 August, straight after my shift ended. I am completely certain of that time because I checked my watch specifically as I was leaving.\n' +
    'HR: Thank you, that is very clear.'
  );
  await page.getByRole('button', { name: 'End meeting' }).click();
  await page.getByText('Meeting Dialogue', { exact: false }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /Save and go to case/ }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // A second, linked meeting for the same case — "+ New meeting" in the
  // case header pre-fills the employee name from the case. Scoped to a
  // button role — the case's own stage badge also reads "Investigation"
  // as a plain <span> alongside the meeting-type button here.
  await page.getByRole('button', { name: '+ New meeting' }).click();
  await page.getByRole('button', { name: /^Investigation/ }).click();
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  await page.getByPlaceholder(/Type or speak your meeting notes here/).waitFor({ timeout: 10000 });
  await page.getByPlaceholder(/Type or speak your meeting notes here/).fill(
    'HR: What time did you last see the employee at the venue on 6 August?\n' +
    'Witness Teddy: I am confident the employee was still in the staff car park at 21:45 on 6 August — I spoke to them directly at that time, roughly half an hour after they now say they had already left the venue.\n' +
    'HR: That is a helpful and specific timing, thank you.'
  );
  await page.getByRole('button', { name: 'End meeting' }).click();
  await page.getByText('Meeting Dialogue', { exact: false }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /Save and go to case/ }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await expect(page.getByText('Potential inconsistencies', { exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Check for inconsistencies' }).click();
  await expect(page.getByText('Comparing meeting records…')).toBeVisible({ timeout: 10000 });

  const signalCard = page.getByText(/^Potential inconsistency:/).first().locator('xpath=ancestor::div[2]');
  await expect(signalCard).toBeVisible({ timeout: 30000 });
  await expect(signalCard.getByRole('button', { name: 'Mark explained' })).toBeVisible();
  await expect(signalCard.getByRole('button', { name: 'Not relevant' })).toBeVisible();

  // Ask why resolves both real meeting sources, not just the summary text.
  await signalCard.getByRole('button', { name: 'Ask why' }).click();
  await expect(page.getByText('Why Compass is saying this')).toBeVisible();
  await expect(page.getByText('Meeting', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await signalCard.getByRole('button', { name: 'Mark explained' }).click();
  await expect(page.getByText(/^Potential inconsistency:/)).not.toBeVisible();
});
