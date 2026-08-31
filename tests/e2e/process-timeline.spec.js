import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Process Intelligence Phase 3 (P3) — the Timeline tab used to be a
// purely flat chronological event list (caseTimeline.js), with no sense
// of where the case sits in its own process or what's still to come.
// TimelinePanel now also renders a stage-aware progress row above it
// (src/lib/processTimeline.js's computeStageProgress, built directly on
// P2's per-type stage registry) — completed stages, the current one, and
// upcoming ones, purely derived from the same case data. Missing-step
// detection itself is exhaustively covered by processTimeline.test.js's
// unit tests (it needs a case that reached a stage without that stage's
// own evidence — awkward to manufacture through the real guided flow,
// which naturally keeps evidence consistent); this proves the simpler,
// equally important thing: the progress row is really wired into the
// screen and updates as a real case actually advances.
test('the Timeline tab shows a stage-aware progress row that advances as the case does', async ({ page }) => {
  test.setTimeout(90000); // one real meeting-record generation
  const employeeName = `E2E ProcessTimeline ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.getByText('Misconduct process', { exact: true })).toBeVisible({ timeout: 10000 });

  // Fresh case: "Concern raised" is the current stage (highlighted, not
  // a checkmark), everything else is upcoming. CaseViewScreen only mounts
  // the active tab's content, so no other tab competes for these texts.
  await expect(page.getByText('Concern raised', { exact: true })).toBeVisible();
  await expect(page.getByText('✓ Concern raised', { exact: true })).not.toBeVisible();
  await expect(page.getByText('Investigation', { exact: true })).toBeVisible();
  await expect(page.getByText('Disciplinary hearing', { exact: true })).toBeVisible();

  // Hold a real investigation meeting for this case and end it — the
  // guided flow's own "Next best action" is how a real user would get
  // here, same as every other case-progression test in this suite.
  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Start meeting' }).first().click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: /^Investigation/ }).click();
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  const notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });
  await notepad.fill('HR: Can you talk me through what happened?\n');
  await notepad.fill('Employee: Yes, of course.\n');
  await page.getByRole('button', { name: 'End meeting' }).click();

  // This case has no allegations and no prep, so no quality-check gaps
  // are expected — but handle the modal defensively in case one appears
  // (e.g. a live-detected suggestion left pending), same as other specs.
  const qualityModal = page.getByRole('dialog').filter({ hasText: 'Meeting Quality Check' });
  const gotQualityCheck = await qualityModal.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
  if (gotQualityCheck) {
    await page.getByRole('button', { name: 'Proceed anyway' }).click();
    const overridePrompt = page.getByRole('dialog', { name: 'Proceed anyway?' });
    await overridePrompt.getByRole('button', { name: 'Proceed', exact: true }).click();
  }

  await expect(page.getByText('Compass HR Advisor', { exact: true })).toBeVisible({ timeout: 90000 });
  await page.getByRole('button', { name: 'Save and go to case →' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.getByText('✓ Concern raised', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Investigation', { exact: true }).first()).toBeVisible();
});
