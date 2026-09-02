import { test, expect } from '@playwright/test';
import { login, startMeeting } from './helpers.js';

// Home's "Start meeting"/"Schedule meeting" and every case-contextual
// "start a meeting" button (Cases, a case's own page, PersonViewScreen)
// used to lead to two independently hand-built forms — HomeMeetingScreen
// and BriefScreen — that had drifted apart (BriefScreen supported 9 more
// meeting types; HomeMeetingScreen had invitation-letter drafting and
// witness-interview handling BriefScreen lacked). Consolidated into one
// form; this covers the previously-untested "Start meeting" entry path
// end to end, since no existing spec exercised it at all.
test('start meeting from Home offers every meeting type and reaches the live-meeting screen', async ({ page }) => {
  const employeeName = `E2E Meeting ${Date.now()}`;

  await login(page);
  await startMeeting(page);

  // Spot-check formal (non-"dev"-group) types that only existed in the
  // now-deleted BriefScreen — if these are missing, the consolidation
  // dropped real functionality. Dev-group types (Appraisal, Probation
  // Review, PDP/1-2-1) are covered separately below — they route straight
  // to DevelopScreen's own structured flow rather than joining this form.
  // The type list scrolls (maxHeight+overflowY:auto), so scroll each into
  // view first rather than asserting visibility from the initial scroll
  // position.
  for (const label of ['Formal Meeting', 'Redundancy Outcome', 'Dismissal Appeal']) {
    const item = page.getByText(label, { exact: true });
    await item.scrollIntoViewIfNeeded();
    await expect(item).toBeVisible();
  }

  await page.getByText('Investigation', { exact: true }).click();
  // ACAS guidance is BriefScreen-only content that needed porting over.
  await expect(page.getByText('ACAS guidance — Investigation')).toBeVisible();

  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();

  // Lands on the live-meeting recording screen (RecordScreen), not a
  // second setup form.
  await expect(page.getByPlaceholder(/Type or speak your meeting notes here/)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(employeeName).first()).toBeVisible();
});

// DevelopScreen (self-assessment, manager assessment, objectives, outcome
// letter — a real, fully-built flow) had no way to be reached anywhere in
// the product: Appraisal/Probation Review/PDP were excluded from both of
// the old duplicate meeting-setup screens' type lists, and nothing else
// called startSession with a dev-group type either. Clicking one now
// skips the ER-oriented form fields (DevelopScreen collects employee
// name/role/date itself in its own first step) and jumps straight there.
test('starting an Appraisal from the meeting-type list reaches DevelopScreen', async ({ page }) => {
  await login(page);
  await startMeeting(page);

  const appraisal = page.getByText('Appraisal', { exact: true });
  await appraisal.scrollIntoViewIfNeeded();
  await appraisal.click();

  await expect(page.getByText('Employee self-assessment').first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByPlaceholder('e.g. Sarah Johnson')).toBeVisible();
});
