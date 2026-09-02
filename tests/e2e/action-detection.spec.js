import { test, expect } from '@playwright/test';
import { login, openNewCaseModal, startMeeting, openCaseSection } from './helpers.js';

// Meeting Intelligence Phase 2 (M4) — "Actions identified" in the live
// sidebar was read-only text; a commitment made mid-meeting ("I'll send
// the screenshots tomorrow") had no path into the case's own task list
// without HR retyping it afterwards. Same treatment as M3's evidence
// mentions: updateMeetingIntelligence now returns structured
// {description, suggestedOwner, suggestedDueDate} objects, merged into a
// session-local actionable list; Accept creates a real case task via the
// existing createCaseTask, Dismiss just clears the suggestion.
test('accepting a live detected action creates a real task on the matching case', async ({ page }) => {
  test.setTimeout(90000); // one real Claude call once enough transcript exists
  const employeeName = `E2E ActionDetection ${Date.now()}`;

  await login(page);

  // Needs an existing case so acceptMeetingActionSuggestion (matches by
  // employee name, same as saveMeetingToCase() at save time) can attach a
  // real task immediately.
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  await startMeeting(page);
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: /^Investigation/ }).click();
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  const notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });

  await notepad.fill('HR: Is there anything that could help us verify what happened?\n');
  await notepad.fill('Employee: I have screenshots of the messages, I will send them to you tomorrow.\n');
  await notepad.fill('HR: That would be very helpful, thank you.\n');

  await expect(page.getByText('Actions identified', { exact: true })).toBeVisible({ timeout: 30000 });
  const acceptButton = page.getByRole('button', { name: 'Accept' }).first();
  await expect(acceptButton).toBeVisible();
  await acceptButton.click();

  await page.getByRole('button', { name: 'Leave without saving' }).click();
  await page.getByRole('button', { name: 'Leave', exact: true }).click();

  // Home Experience Redesign — Home no longer has its own case search
  // (that was the old Active Cases table's filter row, removed along with
  // the table itself); Cases screen still has one for exactly this.
  await page.getByRole('button', { name: 'Cases', exact: true }).click();
  await page.getByPlaceholder('Search by employee…').fill(employeeName);
  await page.getByText(employeeName).first().click();

  await openCaseSection(page, 'Tasks');
  await expect(page.getByText(/screenshot/i)).toBeVisible({ timeout: 10000 });
});
