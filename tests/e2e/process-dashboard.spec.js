import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Process Intelligence Phase 3 (P17, §18) — the "Potential Bottlenecks"
// panel needs a case that's been sitting in a stage for well over
// DEFAULT_STAGE_TARGET_DAYS (10d) to show up at all. Nothing in the UI
// can backdate a case's real creation time, and this shared E2E org's own
// pre-existing cases are all only hours old (too recent to clear the
// 10-day target on their own), so this test drives the browser's own
// Date via Playwright's clock API instead: fix it far in the past, create
// the case (so withStageTransitionStamp's stamp, written by saveCases,
// is timestamped against that backdated "now"), then jump the clock
// forward to the real current time so computeStageBottlenecks recomputes
// against the true present. setFixedTime (not install/pauseAt) is used
// deliberately — it only overrides what `new Date()` returns, leaving
// setTimeout/setInterval running on real wall-clock time, so it can't
// stall the app's own retry/debounce timers or Supabase's auth session
// handling mid-test.
//
// "Long-term sickness" is used as the case type — of every process type
// selectable from "+ New case", it has the fewest pre-existing cases in
// this shared org (per a one-off count at the time this test was
// written), minimising how much this test's own backdated case can be
// diluted by other cases still sitting in the same opening stage from
// earlier, same-day spec runs.
test('a case left in its opening stage for a long time surfaces in Potential Bottlenecks', async ({ page }) => {
  test.setTimeout(60000);
  await login(page);

  const employeeName = `E2E Bottleneck ${Date.now()}`;
  const farPast = new Date();
  farPast.setDate(farPast.getDate() - 500);
  await page.clock.setFixedTime(farPast);

  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('long-term sickness');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // Jump back to the real present — the panel is computed from
  // `new Date()` at render time, not from anything cached at creation.
  await page.clock.setFixedTime(new Date());
  await page.getByRole('button', { name: 'Home', exact: true }).click();

  await expect(page.getByText('Potential Bottlenecks', { exact: true })).toBeVisible({ timeout: 10000 });
  // hasText resolves to the innermost matching div — that's the label
  // line itself (processType · stage), not the wrapper that also holds
  // the caseCount/avg line as a separate sibling div. xpath=.. reaches
  // that wrapper.
  const label = page.locator('div').filter({ hasText: 'Long-term sickness · Absence identified' }).last();
  await expect(label).toBeVisible();
  const row = label.locator('xpath=..');
  await expect(row).toContainText(/avg \d+(\.\d+)?d \(target 10d\)/);
});
