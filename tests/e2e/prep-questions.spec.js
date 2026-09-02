import { test, expect } from '@playwright/test';
import { login, startMeeting } from './helpers.js';

// Meeting Intelligence Phase 2 (M1) — the prep pack itself was always
// markdown-only text with no way to edit the questions it suggested.
// handlePrepare now fires a second, structured call (generatePrepQuestions)
// in parallel with the existing streamClaude one, producing an editable
// list on PrepScreen. This proves the list renders with real AI-generated
// content and that the manual controls (add/remove/mark essential) work —
// not the AI's exact wording, matching how the rest of this suite asserts
// structure over content for generated text.
test('prep pack generates an editable question list that can be added to, marked essential, and removed', async ({ page }) => {
  test.setTimeout(120000); // two real Claude calls in parallel (markdown prep pack + structured questions)
  const employeeName = `E2E PrepQuestions ${Date.now()}`;

  await login(page);
  await startMeeting(page);
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: /^Investigation/ }).click();
  await page.getByRole('button', { name: 'Prepare meeting' }).click();
  await page.getByPlaceholder(/Previous warnings, allegations/).fill(
    'Employee is alleged to have left their shift early on 5 August without authorisation. A colleague, James, reportedly witnessed this.'
  );
  await page.getByRole('button', { name: 'Generate prep pack' }).click();

  // "Prep pack ready" appears as soon as the streaming markdown call starts
  // producing output — near-instant — but generatePrepQuestions is a
  // separate, slower non-streaming call that hasn't necessarily resolved
  // yet at that point, so the question list needs its own generous wait
  // rather than inheriting a short one from the (already-visible) heading.
  await expect(page.getByText('Prep pack ready')).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('Key questions')).toBeVisible();

  // Manager Enablement (Phase 4, MP13, §10) — the two sections added to
  // this same prompt (Opening Script, Closing Points), reusing this
  // test's own real prep-pack generation rather than a second slow,
  // real-AI E2E test just to prove two more headers render.
  // Both stream in progressively — Opening Script sits early in the
  // response, Closing Points near the very end (after Key Questions/
  // Evidence to Explore/Unanswered Issues/Potential Inconsistencies), so
  // each needs its own generous wait rather than sharing one.
  await expect(page.getByText('Opening Script', { exact: true })).toBeVisible({ timeout: 45000 });
  await expect(page.getByText('Closing Points', { exact: true })).toBeVisible({ timeout: 45000 });

  const questionRows = page.locator('input[placeholder="Question text..."]');
  await expect(questionRows.first()).toBeVisible({ timeout: 45000 });
  const initialCount = await questionRows.count();
  expect(initialCount).toBeGreaterThan(0);

  // Add a manual question.
  await page.getByRole('button', { name: '+ Add question' }).click();
  await expect(questionRows).toHaveCount(initialCount + 1);
  await questionRows.last().fill('Was anyone else present at the time?');

  // Mark the newly-added question essential — its star toggles filled.
  // "Mark as essential" is unique to this component, so the last match on
  // the page is reliably the row just added. Several AI-generated questions
  // are commonly marked essential too, so scope the check to .last() rather
  // than asserting a single page-wide match.
  await page.getByRole('button', { name: 'Mark as essential' }).last().click();
  await expect(page.getByRole('button', { name: 'Essential — click to unmark' }).last()).toBeVisible();

  // Remove it again.
  await page.getByRole('button', { name: 'Remove question' }).last().click();
  await expect(questionRows).toHaveCount(initialCount);
});
