import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Organisational ER Intelligence (Phase 6, OP6, §3) — the HR-editable
// theme taxonomy itself. Deliberately scoped to taxonomy CRUD only
// (deterministic, no AI call, real organisation_themes round-trip via
// the Supabase client library) — the AI-suggest-then-confirm flow on a
// case (ThemesTab) needs a real Claude call and is covered by
// ThemesTab.test.jsx's component tests instead, same discipline
// signature-sync.spec.js/org-intelligence.spec.js already established
// for AI-heavy flows.
test('HR can add a theme to the taxonomy and it persists across a reload', async ({ page }) => {
  const themeName = `E2E Theme ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Trends & Themes', exact: true }).click();
  await expect(page.getByText('Theme taxonomy', { exact: true })).toBeVisible({ timeout: 10000 });

  await page.getByPlaceholder('New theme name').fill(themeName);
  await page.getByPlaceholder('Description (optional)').fill('An E2E test theme');
  const themeSaved = page.waitForResponse(r => r.url().includes('/rest/v1/organisation_themes') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Add theme' }).click();
  await themeSaved;
  await expect(page.getByText(themeName, { exact: true })).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Trends & Themes', exact: true }).click();
  await expect(page.getByText(themeName, { exact: true })).toBeVisible({ timeout: 10000 });
});

// Organisational ER Intelligence (Phase 6, OP7, §2) — proves
// org_trend_detection() (extending OP2's foundation) round-trips
// end-to-end against the real, deployed Supabase project. Structural
// only (loads without erroring, real heading present) — the specific
// wording/threshold logic is covered by trendDetection.test.js/
// TrendsPanel.test.jsx against fixed, controlled data.
test('the Trends & Themes tab loads real trend data without erroring', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Trends & Themes', exact: true }).click();
  // Phase 2C — heading reworded to lead with the question it answers.
  await expect(page.getByText(/What is changing\? \(last 90 days vs previous 90 days\)/)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText("Couldn't load trend data right now.")).not.toBeVisible();
});

// Organisational ER Intelligence (Phase 6, OP8, §4) — root-cause
// exploration. Unlike OP7's smoke test, this drives a real trend into
// existence rather than hoping the shared test org already has one:
// creates a fresh theme, tags 3 new cases with it (enough to clear
// isSignificantTrend's MIN_SAMPLE_SIZE, and previousCount is
// necessarily 0 for a theme that didn't exist before this test), then
// proves the whole real chain — org_trend_detection() surfacing it,
// clicking Explore, org_theme_root_cause() answering with the real
// case count. Fully deterministic — case creation and theme tagging are
// both plain Supabase client-library writes, no AI call anywhere in
// this path.
test('tagging 3 cases with a new theme surfaces a trend and its root-cause exploration', async ({ page }) => {
  test.setTimeout(60000);
  const themeName = `E2E RootCause ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Trends & Themes', exact: true }).click();
  await expect(page.getByText('Theme taxonomy', { exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByPlaceholder('New theme name').fill(themeName);
  const themeSaved = page.waitForResponse(r => r.url().includes('/rest/v1/organisation_themes') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Add theme' }).click();
  await themeSaved;

  for (let i = 0; i < 3; i++) {
    const employeeName = `E2E RootCause Case ${Date.now()}-${i}`;
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await openNewCaseModal(page);
    await page.getByPlaceholder('Full name').fill(employeeName);
    await page.getByRole('combobox').nth(2).selectOption('misconduct');
    const createBtn = page.getByRole('button', { name: 'Create case', exact: true });
    await expect(createBtn).toBeEnabled();
    await createBtn.click();
    await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Themes', exact: true }).click();
    const themePicker = page.getByRole('combobox').filter({ has: page.getByRole('option', { name: 'Add an existing theme…' }) });
    await expect(themePicker).toBeVisible({ timeout: 10000 });
    await themePicker.selectOption({ label: themeName });
    const themeAssigned = page.waitForResponse(r => r.url().includes('/rest/v1/case_themes') && r.request().method() === 'POST');
    await page.getByRole('button', { name: 'Add', exact: true }).click();
    await themeAssigned;
    await expect(page.getByText(themeName).first()).toBeVisible();
  }

  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Trends & Themes', exact: true }).click();
  await expect(page.getByText(new RegExp(themeName + ' had no recorded cases in the previous comparison period, and 3 in the current period'))).toBeVisible({ timeout: 10000 });

  const trendCard = page.locator('div').filter({ hasText: themeName }).filter({ has: page.getByRole('button', { name: 'Explore' }) }).last();

  // Organisational ER Intelligence (Phase 6, OP17, §23) — "Show
  // evidence" opens InsightEvidenceModal with this same trend's real
  // underlying counts, not just the prose sentence already on the card.
  await trendCard.getByRole('button', { name: 'Show evidence' }).click();
  await expect(page.getByText('Current period count', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('3', { exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  // Organisational ER Intelligence (Phase 6, OP21, §17) — actions from
  // insights. "Create action" generalises case_tasks (previously always
  // case-scoped) to an org-level row via createCaseTask(null, fields);
  // confirms it's a real, persisted row by finding it on the cross-case
  // Tasks screen afterward, carrying the trend's own insightRef label in
  // place of a case link.
  const actionName = `Review ${themeName} pattern`;
  const actionOwner = `E2E Owner ${Date.now()}`;
  await trendCard.getByRole('button', { name: 'Create action' }).click();
  await trendCard.getByPlaceholder('Action to take…').fill(actionName);
  await trendCard.getByPlaceholder('Owner').fill(actionOwner);
  const actionSaved = page.waitForResponse(r => r.url().includes('/rest/v1/case_tasks') && r.request().method() === 'POST');
  await trendCard.getByRole('button', { name: 'Save action' }).click();
  await actionSaved;
  await expect(trendCard.getByText(/Action created/)).toBeVisible({ timeout: 10000 });

  // The shared test org accumulates hundreds of real open tasks across
  // every run, and undated tasks (this one has no due date) sort last —
  // filtering by this action's own unique owner (rather than scrolling/
  // paginating through the whole list) is what actually makes finding it
  // deterministic.
  await page.locator('aside, header').getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible({ timeout: 10000 });
  await page.locator('select').filter({ has: page.getByRole('option', { name: 'All owners' }) }).selectOption(actionOwner);
  const actionRow = page.locator('div').filter({ hasText: actionName }).filter({ has: page.getByRole('checkbox') }).last();
  await expect(actionRow).toBeVisible();
  await expect(actionRow.getByText(new RegExp('Trend: ' + themeName))).toBeVisible();

  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Trends & Themes', exact: true }).click();
  await expect(page.getByText(new RegExp(themeName + ' had no recorded cases'))).toBeVisible({ timeout: 10000 });

  await trendCard.getByRole('button', { name: 'Explore' }).click();
  await expect(page.getByText('Root-cause exploration — ' + themeName)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(new RegExp('"' + themeName + '" appears in 3 cases this period'))).toBeVisible({ timeout: 10000 });

  // Organisational ER Intelligence (Phase 6, OP9, §12) — the same 3
  // cases created above (all within the last few minutes) also fall
  // inside Early Signals' shorter 6-week window, proving
  // org_trend_detection()'s p_period_days parameterisation genuinely
  // varies the result — not just that the RPC returns SOMETHING for
  // any input.
  await page.getByRole('button', { name: 'Early Signals', exact: true }).click();
  await expect(page.getByText(new RegExp('Emerging theme: 3 cases.*refer to "' + themeName + '"'))).toBeVisible({ timeout: 10000 });
});
