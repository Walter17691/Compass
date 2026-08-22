import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// CasesScreen paginates employee groups 15 at a time (useLoadMore); this
// shared E2E test org has accumulated enough cases across this suite's own
// repeated runs that a freshly created case can land past the first page.
// See appeal-review.spec.js for the same helper and root cause.
async function revealCase(page, employeeName) {
  for (let i = 0; i < 20; i++) {
    if (await page.getByText(employeeName).first().isVisible().catch(() => false)) return;
    const loadMore = page.getByRole('button', { name: /^Load more/ });
    if (!(await loadMore.isVisible().catch(() => false))) break;
    await loadMore.click();
  }
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
}

// Phase 13 of the reasoning-layer build-out — the deferred item finally
// picked back up after the "scale/commercialisation" wave. case_views
// (case_id, user_id, last_viewed_at) is upserted every time a case is
// opened; the diff (lib/caseViews.js's computeChangesSinceView) compares
// the audit log against whatever was stored from the PREVIOUS open, so
// nothing shows on a case's very first-ever view (no prior last_viewed_at)
// — the AI one-line summary only fires once that diff is non-trivial,
// never on a quiet case.
test('a change made after the first view shows up as a dismissible banner on the next view, but not on the first', async ({ page }) => {
  test.setTimeout(60000);
  const employeeName = `E2E Changes ${Date.now()}`;
  const taskName = `Chase evidence ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // This is the case's first-ever view (opened right after "Create case")
  // — no prior case_views row exists yet, so the banner must not appear.
  const changesBanner = page.locator('div').filter({ hasText: /update.*since you last viewed|Since you last viewed this case|Compass is summarising/i }).last();
  await expect(changesBanner).not.toBeVisible();

  // Add a task from inside the case — this writes a real "Task added"
  // audit_log entry (App.jsx's audit()), timestamped after the first
  // view's just-recorded last_viewed_at.
  const caseTabBar = page.locator('div')
    .filter({ has: page.getByRole('button', { name: 'Overview', exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Documents', exact: true }) })
    .last();
  await caseTabBar.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByText(/^Tasks \(0 open\)$/)).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: '+ Add task' }).click();
  await page.getByPlaceholder('Task').fill(taskName);
  const taskSaved = page.waitForResponse(r => r.url().includes('/rest/v1/audit_log') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Add task' }).click();
  await taskSaved;

  // Leave the case, then come back via the Cases list — this is the
  // second view, diffed against the first view's stored timestamp.
  await page.getByRole('button', { name: '← Cases' }).click();
  await expect(page.getByRole('heading', { name: 'Cases' })).toBeVisible({ timeout: 10000 });
  const today = new Date().toISOString().split('T')[0];
  await page.getByLabel('From').fill(today);
  await page.getByLabel('Filter by case type').selectOption('misconduct');
  await revealCase(page, employeeName);
  const checkbox = page.getByText(employeeName).locator('xpath=following::input[@type="checkbox"][1]');
  await checkbox.locator('xpath=..').click();

  // The locator itself already requires matching one of the three banner
  // states (loading / AI summary / fallback count) via hasText, so its
  // visibility is the real assertion — no need for a second, redundant
  // content check that would just race the AI summary call regardless.
  await expect(changesBanner).toBeVisible({ timeout: 15000 });

  // Scoped to the whole page rather than re-using the broad "div hasText"
  // banner locator for the click itself — that filter matches every
  // ancestor div containing the banner text too (same ambiguity class
  // fixed in appeal-review.spec.js), and this case has no AI signals of
  // its own to produce a second "Dismiss" button (SignalCard's own),
  // so a single global match is unambiguous here.
  await page.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(changesBanner).not.toBeVisible();
});
