import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Phase 2 of the AI-copilot reasoning-layer build-out: a Covered / Still
// to explore panel on the case Overview tab, built on Phase 0's
// case_signals substrate — live-verified separately for reasoning
// quality. This proves the UI wiring: reviewing produces both halves of
// the panel, and a still-to-explore item's convert-to-task action creates
// a real task.
test('Compass reviews a case for covered vs still-to-explore topics, and a question converts to a task', async ({ page }) => {
  test.setTimeout(60000); // one real Claude call
  const employeeName = `E2E Unanswered ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByPlaceholder('Brief summary of the issue…').fill('Alleged unauthorised absence on 5 August. Manager Ryan says colleague Sarah Jones witnessed part of the conversation, but Sarah Jones has not yet been interviewed or contacted by HR in any way — this remains completely unexplored.');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await expect(page.getByText('Unanswered questions')).toBeVisible();
  await page.getByRole('button', { name: 'Review the case' }).click();
  await expect(page.getByText('Reviewing the case…')).toBeVisible();
  await expect(page.getByText('Still to explore')).toBeVisible({ timeout: 30000 });

  // exact: true — the panel header text is "Unanswered questions" (plural),
  // distinct from the SignalCard's own type label "Unanswered question".
  const questionCard = page.getByText('Unanswered question', { exact: true }).first().locator('xpath=ancestor::div[2]');
  await expect(questionCard.getByRole('button', { name: 'Create task' })).toBeVisible();
  await questionCard.getByRole('button', { name: 'Create task' }).click();

  // Asserts against the case workspace's own "Tasks" tab badge (which
  // shares its accessible name with the sidebar's global "Tasks" nav item,
  // so this avoids disambiguating a click between the two) rather than
  // navigating to the cross-case Tasks screen.
  await expect(page.getByRole('button', { name: /^Tasks\d+$/ })).toBeVisible();
});
