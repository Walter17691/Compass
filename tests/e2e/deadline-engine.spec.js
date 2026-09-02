import { test, expect } from '@playwright/test';
import { login, startMeeting } from './helpers.js';

// Phase 12 of the reasoning-layer build-out (process intelligence, after
// company policies/procedural guardrails). computeDueSoon (lib/deadlines.js)
// already merged case/DSAR/task deadlines into one unified output — this
// threads three more real, already-captured date sources into that same
// output (WellbeingScreen's followUpDate, RedundancyScreen's
// consultationStartDate, and the existing ACAS "outcome" deadline gains a
// one-click "create task" affordance), rather than inventing new data
// capture for deadline types nothing in the app actually tracks yet (fit
// notes, probation review dates, OH referrals, suspension review — none of
// these exist as structured dates anywhere in the codebase).
test('a wellbeing follow-up date surfaces as a due-soon item with no create-task affordance', async ({ page }) => {
  const employeeName = `E2E Deadline Wellbeing ${Date.now()}`;
  const followUpDate = new Date(Date.now() + 5 * 86400000).toISOString().slice(0, 10);

  await login(page);
  // Wellbeing lives inside the "HR Processes" sidebar group, which now
  // starts collapsed (Home Composition Review, final refinement item 3).
  await page.getByRole('button', { name: 'HR Processes' }).click();
  await page.getByRole('button', { name: 'Wellbeing', exact: true }).click();
  await expect(page.getByText('Mental health & wellbeing')).toBeVisible();
  await page.getByRole('button', { name: '+ Add note' }).click();
  await page.getByPlaceholder('e.g. James Wilson').fill(employeeName);
  await page.getByPlaceholder(/What was discussed/).fill('E2E deadline-engine wellbeing conversation.');
  await page.locator('input[type="date"]').nth(1).fill(followUpDate);
  const saveResponse = page.waitForResponse(r => r.url().includes('/rest/v1/wellbeing_notes') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText('E2E deadline-engine wellbeing conversation.')).toBeVisible({ timeout: 10000 });
  await saveResponse;

  await page.getByRole('button', { name: 'Organisation', exact: true }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  const row = page.locator('div').filter({ hasText: employeeName }).filter({ hasText: 'Wellbeing follow-up due' }).last();
  await expect(row).toBeVisible({ timeout: 10000 });
  // Not case-scoped, so there's nothing a case_task could be created against.
  await expect(row.getByRole('button', { name: '+ Create task' })).not.toBeVisible();
});

test('a disciplinary outcome deadline offers a create-task affordance that lands a real task', async ({ page }) => {
  test.setTimeout(60000); // one meeting-record save
  const employeeName = `E2E Deadline Outcome ${Date.now()}`;

  await login(page);
  await startMeeting(page);
  await page.getByText('Disciplinary', { exact: true }).click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  await page.getByPlaceholder(/Type or speak your meeting notes here/).waitFor({ timeout: 10000 });
  await page.getByPlaceholder(/Type or speak your meeting notes here/).fill(
    'HR: We are here to discuss the outcome of the investigation.\nEmployee: Understood.'
  );
  await page.getByRole('button', { name: 'End meeting' }).click();
  await page.getByText('Meeting Dialogue', { exact: false }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /Save and go to case/ }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Organisation', exact: true }).click();
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Notifications', exact: true }).click();
  // Exact match on the label matters here: creating the task adds a
  // *second*, genuinely different due-soon item for the task's own due
  // date ("Task due: Disciplinary outcome letter due…"), which itself
  // briefly qualifies for its own "+ Create task" button — a substring
  // match on the label would land on that new row instead of confirming
  // the original one's button is gone. The row itself is the label span's
  // grandparent (span -> text-only sub-div -> the flex row that also
  // holds the button), same two-level walk-up used elsewhere in this
  // suite for a similarly-nested card shape.
  const row = page.getByText('Disciplinary outcome letter due (ACAS: 5 working days)', { exact: true })
    .locator('xpath=ancestor::div[2]')
    .filter({ hasText: employeeName });
  await expect(row).toBeVisible({ timeout: 10000 });
  await row.getByRole('button', { name: '+ Create task' }).click();
  // The button disappears once the matching task exists — a second click
  // would just spam duplicate tasks.
  await expect(row.getByRole('button', { name: '+ Create task' })).not.toBeVisible();

  await page.locator('aside, header').getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible({ timeout: 10000 });
  const taskRow = page.locator('div')
    .filter({ hasText: 'Disciplinary outcome letter due' })
    .filter({ has: page.getByRole('button', { name: employeeName }) })
    .last();
  await expect(taskRow).toBeVisible();
});
