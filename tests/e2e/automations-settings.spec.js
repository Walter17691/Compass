import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Integrations & Workflow Automation (Phase 5, IP28, §22-23) — the
// Settings -> Automations config screen itself. Fully deterministic,
// no AI call, and (unlike /api/signing or /api/calendar) writes straight
// to organisations via the Supabase client library, not an unproxied API
// route, so this is genuinely achievable locally including a real
// persistence check across a reload.
//
// saveAutomationLevel (App.jsx) updates local state synchronously, then
// awaits the Supabase write — so the button's own description text
// updates (and this test's assertion passes) the instant the click
// handler runs, well before the network request resolves. A fixed
// pacing delay (600ms, the shape other specs in this suite use) wasn't
// enough here — this shared test-org's organisations row is under heavy,
// constant write/read load from the rest of this session's E2E history,
// and the trace for the first attempt at this test showed all three
// PATCH requests finishing with network status -1 (aborted — the
// browser context tore down while they were still in flight, not a
// server-side rejection). Waiting for the actual response instead of a
// guessed duration is the real fix.
async function clickAndWaitForSave(page, locator) {
  const responsePromise = page.waitForResponse(r => r.url().includes('/rest/v1/organisations') && r.request().method() === 'PATCH', { timeout: 15000 });
  await locator.click();
  await responsePromise;
}

test('changing an automation level persists across a reload, and the rule stays visible at every level', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: 'Organisation', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Automations', exact: true }).click();
  await expect(page.getByText('Chase signature on stale meeting records', { exact: true })).toBeVisible({ timeout: 10000 });

  // Reset to a known starting level first — a previous run (or manual
  // testing against this shared org) may have left this at something
  // other than Suggest, and the assertion below needs a clean baseline.
  await clickAndWaitForSave(page, page.getByRole('button', { name: 'Suggest', exact: true }));
  await expect(page.getByText(/Compass flags it for HR to review/)).toBeVisible();

  await clickAndWaitForSave(page, page.getByRole('button', { name: 'Prepare', exact: true }));
  await expect(page.getByText(/Compass drafts the action; HR reviews/)).toBeVisible({ timeout: 10000 });

  await clickAndWaitForSave(page, page.getByRole('button', { name: 'Automate', exact: true }));
  await expect(page.getByText(/Compass performs the action automatically/)).toBeVisible({ timeout: 10000 });

  // The rule's own label/detail must still be visible at Automate —
  // automating it never hides what it does or why.
  await expect(page.getByText('Chase signature on stale meeting records', { exact: true })).toBeVisible();
  await expect(page.getByText(/sent for signature 5\+ days ago/)).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Automations', exact: true }).click();
  await expect(page.getByText(/Compass performs the action automatically/)).toBeVisible({ timeout: 10000 });
});
