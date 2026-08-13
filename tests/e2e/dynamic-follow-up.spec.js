import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Meeting Intelligence Phase 2 (M5) — a general "here's a good next
// question" suggestion, distinct from the existing same-meeting
// contradiction nudge (which stays scoped to conflicting statements only).
// Uses the spec's own worked example almost verbatim — a claim attributed
// to a third party with an obvious missing detail — since that's the
// clearest, most reliable case to expect a real AI call to recognise as
// worth a follow-up. Structure over exact wording, matching how the
// inconsistency nudge is already tested (meeting-intelligence.spec.js).
test('a clear follow-up opportunity produces a suggestion that can be inserted into the notes', async ({ page }) => {
  test.setTimeout(60000); // one real Claude call once enough transcript exists
  const employeeName = `E2E FollowUp ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: 'Start meeting' }).first().click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: /^Investigation/ }).click();
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  const notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });

  await notepad.fill('HR: Can you tell me more about what you understood about the area at the time?\n');
  await notepad.fill('Employee: I was told by James that the area was unsafe, so I stayed away from it.\n');
  await notepad.fill('HR: I see, thank you for explaining that.\n');

  await expect(page.getByText('Suggested follow-up', { exact: true })).toBeVisible({ timeout: 30000 });

  const notesBefore = await notepad.inputValue();
  await page.getByRole('button', { name: 'Insert question' }).click();
  const notesAfter = await notepad.inputValue();
  expect(notesAfter.length).toBeGreaterThan(notesBefore.length);

  // Inserting resolves the suggestion — the box disappears rather than
  // lingering (M5's "capped to one at a time" behaviour).
  await expect(page.getByText('Suggested follow-up', { exact: true })).not.toBeVisible();
});
