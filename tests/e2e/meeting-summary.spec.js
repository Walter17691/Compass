import { test, expect } from '@playwright/test';
import { login, confirmOverrideReason } from './helpers.js';

// Meeting Intelligence Phase 2 (M10) — handleReview only ever produced one
// long, formally-structured meeting record (Meeting Details / Meeting
// Dialogue / HR Advisor Notes) — genuinely useful as the legal record, but
// nothing anyone could scan in a few seconds to see what actually
// happened. A second, short, distinct AI generation now runs alongside it
// (kicked off before the full record is awaited, so both stream
// concurrently rather than one waiting on the other) — key facts,
// disputed points, outstanding questions, allegation impact — stored as
// meeting.summary and shown as its own collapsible card on ReviewScreen,
// never replacing the full record.
test('ending a meeting produces a separate, collapsible meeting summary alongside the full record', async ({ page }) => {
  test.setTimeout(90000); // full record + summary stream concurrently, then risk score after
  const employeeName = `E2E MeetingSummary ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: 'Start meeting' }).first().click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: /^Investigation/ }).click();
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  const notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });

  await notepad.fill('HR: Thank you for coming in. Can you talk me through what happened on 5 August?\n');
  await notepad.fill('Employee: I was running late that day because the bus was cancelled, so I arrived twenty minutes after my shift started.\n');
  await notepad.fill('HR: Thank you, that is helpful context.\n');

  await page.getByRole('button', { name: 'End meeting' }).click();

  // A pending evidence/action suggestion would trigger M9's quality check
  // modal here — proceed past it if so, same as any real user would.
  const qualityModal = page.getByRole('dialog');
  const gotQualityCheck = await qualityModal.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
  if (gotQualityCheck) {
    await page.getByRole('button', { name: 'Proceed anyway' }).click();
    // P1 — proceeding past an unresolved gap now asks for an optional
    // reason before actually proceeding.
    await confirmOverrideReason(page);
  }

  await expect(page.getByText('Meeting record', { exact: true })).toBeVisible({ timeout: 60000 });
  await expect(page.getByText('Meeting summary', { exact: true })).toBeVisible({ timeout: 60000 });

  // Distinct content from the full record — its own structured headings.
  const summaryHeading = page.getByText(/Key Facts Established|Outstanding Questions|New Information/);
  await expect(summaryHeading).toBeVisible();

  // Collapsible: defaults open, Hide/Show toggles it.
  await page.getByText('Hide', { exact: true }).click();
  await expect(summaryHeading).not.toBeVisible();
  await page.getByText('Show', { exact: true }).click();
  await expect(summaryHeading).toBeVisible();
});
