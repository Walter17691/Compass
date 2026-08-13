import { test, expect } from '@playwright/test';
import { login, confirmOverrideReason } from './helpers.js';

// Meeting Intelligence Phase 2 (M8) — a witness or action suggestion
// raised live but left undecided (HR too busy taking notes to act on it
// there and then) used to just vanish once the meeting ended — nothing
// carried it forward. ReviewScreen now shows a "Compass proposes these
// updates" panel for anything still pending once "End meeting" is
// clicked, reusing the exact same accept/dismiss handlers M3 already
// built rather than a second review mechanism. Approving here creates the
// real task exactly as accepting live would have.
test('a suggestion left undecided during the meeting can still be approved on the review screen', async ({ page }) => {
  test.setTimeout(90000);
  const employeeName = `E2E PostMeetingReview ${Date.now()}`;

  await login(page);

  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Start meeting' }).first().click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: /^Investigation/ }).click();
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  const notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });

  await notepad.fill('HR: Can you talk me through what happened that day?\n');
  await notepad.fill('Employee: Priya Shah was standing right next to me and saw the whole thing happen.\n');
  await notepad.fill('HR: Thank you, that is useful — I will follow up on that.\n');

  // The suggestion appears live but is deliberately left undecided here —
  // no Accept/Dismiss click in the live sidebar.
  await expect(page.getByText('Evidence mentioned', { exact: true })).toBeVisible({ timeout: 30000 });

  // A suggestion still pending is exactly the kind of thing M9's Meeting
  // Quality Check now flags — "Proceed anyway" is the equivalent of the
  // old direct End meeting click; nothing about that path changed.
  await page.getByRole('button', { name: 'End meeting' }).click();
  const qualityModal = page.getByRole('dialog');
  await expect(qualityModal.getByText('Meeting Quality Check', { exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Proceed anyway' }).click();
  // P1 — proceeding past an unresolved gap now asks for an optional
  // reason before actually proceeding.
  await confirmOverrideReason(page);
  await expect(page.getByText('Processing...')).not.toBeVisible({ timeout: 60000 });

  await expect(page.getByText('Compass proposes these updates', { exact: true })).toBeVisible({ timeout: 10000 });
  // .first() — the AI can occasionally also surface a same-named action
  // suggestion (e.g. "Follow up with Priya Shah...") alongside the
  // witness suggestion; either is equally valid proof the pending item
  // made it onto this screen.
  await expect(page.getByText(/Priya Shah/).first()).toBeVisible();
  await page.getByRole('button', { name: 'Approve' }).first().click();

  const saveButton = page.getByRole('button', { name: 'Save and go to case →' });
  await expect(saveButton).toBeVisible();
  await saveButton.click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  const caseTabBar = page.locator('div')
    .filter({ has: page.getByRole('button', { name: 'Overview', exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Documents', exact: true }) })
    .last();
  await caseTabBar.getByRole('button', { name: /^Tasks/ }).click();
  await expect(page.getByText(/Priya Shah/)).toBeVisible({ timeout: 10000 });
});
