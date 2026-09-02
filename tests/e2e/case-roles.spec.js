import { test, expect } from '@playwright/test';
import { login, startMeeting } from './helpers.js';

// Process Intelligence Phase 3 (P8) — case_access already existed for
// the disciplinary-officer/case-owner handoff flows (assignInvestigator
// was Phase 15's first read of it) but had no dedicated assignment UI at
// all for four of the spec's role types. CaseRolesPanel adds exactly
// those (Appeal Manager, Notetaker, Employee's Manager, Approver) —
// Investigator/Case Owner/Hearing Manager keep their existing flows
// untouched. Assigning someone as Appeal Manager who also chaired the
// original disciplinary hearing surfaces a new procedural guardrail —
// same SignalCard/PolicyCitation/override machinery every other
// guardrail already uses, no new UI for the conflict itself.
//
// The E2E test org only has one real member (the HR test account, "Test
// Compass" — documented in investigator-mode.spec.js) — so the conflict
// is deliberately engineered around that single available assignee
// rather than a second person, the same constraint that spec already
// works within.
test('assigning a case role is visible immediately, and assigning the same person as Appeal Manager and original decision-maker flags a conflict', async ({ page }) => {
  test.setTimeout(90000); // one real meeting-record generation

  await login(page);
  const employeeName = `E2E CaseRoles ${Date.now()}`;
  await startMeeting(page);
  await page.getByText('Disciplinary', { exact: true }).click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByPlaceholder('e.g. Tom Norton').fill('Test Compass');
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  const notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });
  await notepad.fill('HR: We are here to discuss the outcome of the investigation.\n');
  await notepad.fill('Employee: Understood.\n');
  await page.getByRole('button', { name: 'End meeting' }).click();

  const qualityModal = page.getByRole('dialog').filter({ hasText: 'Meeting Quality Check' });
  const gotQualityCheck = await qualityModal.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
  if (gotQualityCheck) {
    await page.getByRole('button', { name: 'Proceed anyway' }).click();
    await page.getByRole('dialog', { name: 'Proceed anyway?' }).getByRole('button', { name: 'Proceed', exact: true }).click();
  }
  await expect(page.getByText('Compass HR Advisor', { exact: true })).toBeVisible({ timeout: 90000 });
  await page.getByRole('button', { name: /Save and go to case/ }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await expect(page.getByText('Case roles', { exact: true })).toBeVisible({ timeout: 10000 });
  // Assign a role no conflict check cares about first, proving the panel
  // itself works and updates immediately (no reload needed).
  const notetakerRow = page.locator('div').filter({ hasText: 'Notetaker' }).filter({ has: page.getByRole('combobox', { name: 'Assign Notetaker' }) }).last();
  const accessSaved1 = page.waitForResponse(r => r.url().includes('/rest/v1/case_access') && r.request().method() === 'POST');
  await notetakerRow.getByRole('combobox', { name: 'Assign Notetaker' }).selectOption({ label: 'Test Compass' });
  await accessSaved1;
  await expect(notetakerRow.getByText('Test Compass').first()).toBeVisible({ timeout: 10000 });

  // Now assign Appeal Manager to the same person who chaired the
  // disciplinary hearing — a real conflict.
  await expect(page.getByText('Procedural guardrails', { exact: true })).not.toBeVisible();
  const appealManagerRow = page.locator('div').filter({ hasText: 'Appeal Manager' }).filter({ has: page.getByRole('combobox', { name: 'Assign Appeal Manager' }) }).last();
  const accessSaved2 = page.waitForResponse(r => r.url().includes('/rest/v1/case_access') && r.request().method() === 'POST');
  await appealManagerRow.getByRole('combobox', { name: 'Assign Appeal Manager' }).selectOption({ label: 'Test Compass' });
  await accessSaved2;

  await expect(page.getByText('Procedural guardrails', { exact: true })).toBeVisible({ timeout: 10000 });
  const signalCard = page.getByText('The Appeal Manager made the original decision').locator('xpath=ancestor::div[2]');
  await expect(signalCard).toBeVisible({ timeout: 10000 });
  await expect(signalCard.getByText('Test Compass')).toBeVisible();
  await expect(signalCard.getByRole('button', { name: 'Proceed anyway' })).toBeVisible();
});
