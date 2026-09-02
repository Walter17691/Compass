import { test, expect } from '@playwright/test';
import { login, startMeeting } from './helpers.js';

// Meeting Intelligence Phase 2 (M2) — the live sidebar's "Questions asked/
// remaining" used to be two free-text arrays the AI regenerated from
// scratch each pass, with no way to correct them. Once a meeting has a
// real structured question list (M1), RecordScreen now renders it as an
// interactive checklist — one status dropdown per question — available
// immediately when the meeting starts, not gated behind the first live AI
// pass (which needs three utterances to fire). This proves the checklist
// appears with real questions and that a manual status change sticks;
// updateMeetingIntelligence never overwriting a user-set status is covered
// directly by the pure-function unit tests (prepQuestions.test.js), since
// asserting a live AI pass doesn't revert it would need waiting on a real
// call with no deterministic outcome to check.
test('the live question checklist appears immediately after prep and a manual status change sticks', async ({ page }) => {
  test.setTimeout(120000); // two real Claude calls in parallel during prep
  const employeeName = `E2E LiveQuestions ${Date.now()}`;

  await login(page);
  await startMeeting(page);
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

  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  await page.getByPlaceholder(/Type or speak your meeting notes here/).waitFor({ timeout: 10000 });

  // The checklist shows straight away — no need to type anything first,
  // unlike the rest of the Meeting intelligence panel.
  await expect(page.getByText('Meeting intelligence', { exact: true })).toBeVisible();
  await expect(page.getByText('Questions', { exact: true })).toBeVisible();
  const statusSelects = page.locator('select[aria-label^="Status for:"]');
  await expect(statusSelects.first()).toBeVisible();
  const questionCount = await statusSelects.count();
  expect(questionCount).toBeGreaterThan(0);
  await expect(statusSelects.first()).toHaveValue('not_asked');

  // Manually mark the first question answered — sticks without needing
  // any AI call.
  await statusSelects.first().selectOption('answered');
  await expect(statusSelects.first()).toHaveValue('answered');
});
