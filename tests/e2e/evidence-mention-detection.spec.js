import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Meeting Intelligence Phase 2 (M3) — "Evidence mentioned" in the live
// sidebar used to be a read-only list; a witness or piece of evidence
// mentioned mid-meeting had to be manually re-entered later. It's now
// actionable: Accept creates a real case task immediately (mirroring
// acceptDocumentFinding's witness/evidence branches, Phase 7), Dismiss
// just removes the suggestion. Only asserts structure (a task got created)
// rather than the AI's exact wording, matching how document-ingestion.spec.js
// already tests the same accept-a-finding pattern.
test('accepting a live witness mention creates a real task on the matching case', async ({ page }) => {
  test.setTimeout(90000); // one real Claude call once enough transcript exists
  const employeeName = `E2E EvidenceMention ${Date.now()}`;

  await login(page);

  // A case for this employee has to exist already — acceptMeetingEvidenceSuggestion
  // resolves the target case the same way saveMeetingToCase() does at save
  // time (matching by employee name), not via a pre-set link.
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // Start a fresh meeting for the same employee — skip prep, this phase
  // doesn't depend on it. "Start meeting" is a Home-page action, so
  // navigate back there first (we're currently inside the case we just
  // created).
  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Start meeting' }).first().click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: /^Investigation/ }).click();
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  const notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });

  await notepad.fill('HR: Can you talk me through what happened that day?\n');
  await notepad.fill('Employee: Sarah Jones was standing right next to me and saw the whole thing happen.\n');
  await notepad.fill('HR: Thank you, that is useful — I will follow up on that.\n');

  await expect(page.getByText('Evidence mentioned', { exact: true })).toBeVisible({ timeout: 30000 });
  const acceptButton = page.getByRole('button', { name: 'Accept' }).first();
  await expect(acceptButton).toBeVisible();
  await acceptButton.click();

  // Leave the meeting without saving, then confirm a real task landed on
  // the case — the actual proof this created a database row, not just a
  // local status flip.
  await page.getByRole('button', { name: 'Leave without saving' }).click();
  await page.getByRole('button', { name: 'Leave', exact: true }).click();

  // Leaving a meeting always lands back on Home, not the case — reopen the
  // case from there using Home's own case search.
  await page.getByPlaceholder('Search cases…').fill(employeeName);
  await page.getByText(employeeName).first().click();

  const caseTabBar = page.locator('div')
    .filter({ has: page.getByRole('button', { name: 'Overview', exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Documents', exact: true }) })
    .last();
  await caseTabBar.getByRole('button', { name: /^Tasks/ }).click();
  await expect(page.getByText(/Sarah Jones/)).toBeVisible({ timeout: 10000 });
});
