import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Organisational ER Intelligence (Phase 6, OP15, §11) — organisational
// change correlation. Fully deterministic — logging an event and
// exploring correlation are both plain Supabase client-library
// operations, no AI call anywhere in this path.
test('HR can log an organisational event, it persists across a reload, and correlation can be explored', async ({ page }) => {
  const description = `E2E org event ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Organisational Events', exact: true }).click();
  await expect(page.getByText('Log an event', { exact: true })).toBeVisible({ timeout: 10000 });

  await page.locator('input[type="date"]').fill('2026-06-15');
  await page.getByPlaceholder('Description').fill(description);
  const eventSaved = page.waitForResponse(r => r.url().includes('/rest/v1/org_events') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Log event', exact: true }).click();
  await eventSaved;
  await expect(page.getByText(description, { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Organisational Events', exact: true }).click();
  await expect(page.getByText(description, { exact: true })).toBeVisible({ timeout: 10000 });

  // Pre-existing fragility found while verifying Phase 2C (not
  // introduced by it — the event row's DOM nesting depth under
  // OrgEventsPanel's own flex-column parent is unchanged from before):
  // `locator('div').filter({hasText})` matches every ANCESTOR div whose
  // full text content happens to include the description too, not just
  // the specific event's own row — with 2+ accumulated E2E events in
  // this shared test org (both sharing the same event type/date), a
  // broader ancestor match could pick up a *different* event's "Explore
  // correlation" button/result via .first(). getByText finds only the
  // description's own innermost element; its parent is the actual event
  // row (same xpath-to-parent pattern already used in case-changes.spec.js).
  const eventRow = page.getByText(description, { exact: true }).locator('xpath=..');
  await eventRow.getByRole('button', { name: 'Explore correlation' }).click();
  // Pre-existing bug found while verifying Phase 2C (unrelated to it —
  // orgEvents.js's describeEventCorrelation is untouched): a synthetic
  // E2E event genuinely has zero real cases around it, which
  // deterministically hits the "insufficient sample" branch
  // ("Not enough cases recorded around this event..."), a phrase none
  // of the original three regex alternatives matched. Widened to match
  // all four of describeEventCorrelation's real return branches.
  await expect(eventRow.getByText(/Not enough cases recorded|before this event|Case volume/)).toBeVisible({ timeout: 10000 });
});
