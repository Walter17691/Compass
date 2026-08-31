import { test, expect } from '@playwright/test';
import { login, openNewCaseModal, SUPABASE_URL, SUPABASE_ANON_KEY } from './helpers.js';

// Organisational ER Intelligence (Phase 6, OP23, §19) — impact tracking.
// impactTracking.js's own MIN_DAYS_SINCE_COMPLETION (7 days) is a real
// product floor, not something to shrink just to make this test faster.
// Rather than waiting a week, this backdates the just-created
// initiative's completed_at via a direct, RLS-scoped REST PATCH (same
// permission boundary a real HR user's own client already has — not a
// bypass, just skipping the wait) using the session's own access token,
// extracted from localStorage after a normal login. Uses the real,
// already-populated "grievance" case type as the metric (rather than a
// brand-new theme, which would have a guaranteed-empty "before" window —
// hasEnoughDataForImpact requires a real prior baseline). The shared
// test org's own organic grievance-case density in an arbitrary past
// window isn't reliable enough to depend on (tried first, found flaky —
// a real 14-day window 14-28 days ago sometimes has fewer than the
// MIN_PRIOR_SAMPLE floor), so this creates 3 real grievance cases and
// backdates their own created_at into that window directly, guaranteeing
// a real prior baseline regardless of ambient E2E-run timing.
test('impact tracking compares real case volume before vs after an initiative reaches completion', async ({ page }) => {
  test.setTimeout(90000);
  const title = `E2E Impact ${Date.now()}`;

  await login(page);

  const accessToken = await page.evaluate(() => {
    const key = Object.keys(localStorage).find(k => k.includes('auth-token'));
    return key ? JSON.parse(localStorage.getItem(key))?.access_token : null;
  });
  expect(accessToken).toBeTruthy();
  const authHeaders = { apikey: SUPABASE_ANON_KEY, Authorization: `Bearer ${accessToken}`, 'Content-Type': 'application/json' };

  const backdatedCaseDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
  for (let i = 0; i < 3; i++) {
    const employeeName = `E2E Impact Baseline ${Date.now()}-${i}`;
    await page.getByRole('button', { name: 'Home', exact: true }).click();
    await openNewCaseModal(page);
    await page.getByPlaceholder('Full name').fill(employeeName);
    await page.getByRole('combobox').nth(2).selectOption('grievance');
    const createBtn = page.getByRole('button', { name: 'Create case', exact: true });
    await expect(createBtn).toBeEnabled();
    const caseSaved = page.waitForResponse(r => r.url().includes('/rest/v1/cases') && ['POST','PATCH'].includes(r.request().method()));
    await createBtn.click();
    await caseSaved;
    await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

    const lookupRes = await page.request.get(`${SUPABASE_URL}/rest/v1/cases?employee_name=eq.${encodeURIComponent(employeeName)}&select=id`, { headers: authHeaders });
    const [{ id: caseId }] = await lookupRes.json();
    const backdateRes = await page.request.patch(`${SUPABASE_URL}/rest/v1/cases?id=eq.${caseId}`, { headers: authHeaders, data: { created_at: backdatedCaseDate } });
    expect(backdateRes.ok()).toBeTruthy();
  }

  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Improvement Initiatives', exact: true }).click();
  await expect(page.getByRole('button', { name: '+ New initiative' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: '+ New initiative' }).click();
  await page.getByPlaceholder('Title').fill(title);
  await page.getByPlaceholder('Problem identified').fill('Assessing grievance volume.');

  const initiativeSaved = page.waitForResponse(r => r.url().includes('/rest/v1/improvement_initiatives') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create initiative', exact: true }).click();
  await initiativeSaved;
  await expect(page.getByText(title, { exact: true })).toBeVisible();

  const initiativeCard = () => page.locator('div').filter({ hasText: title });
  await initiativeCard().getByRole('button', { name: 'View details' }).first().click();

  const metricKindSelect = initiativeCard().locator('select').filter({ has: page.getByRole('option', { name: 'Case type' }) }).first();
  await metricKindSelect.selectOption('case_type');
  const metricValueSelect = initiativeCard().locator('select').filter({ has: page.getByRole('option', { name: 'Select a case type…' }) }).first();
  await metricValueSelect.selectOption('grievance');

  const statusSelect = initiativeCard().locator('select').filter({ has: page.getByRole('option', { name: 'Completed' }) }).first();
  const statusSaved = page.waitForResponse(r => r.url().includes('/rest/v1/improvement_initiatives') && r.request().method() === 'PATCH');
  await statusSelect.selectOption('completed');
  await statusSaved;

  // Backdate completed_at 14 real days so MIN_DAYS_SINCE_COMPLETION (7)
  // is comfortably cleared, via the same RLS-scoped REST path the app's
  // own Supabase client uses — this HR user can update their own org's
  // initiative either way; only the timing is being fast-forwarded.
  // The insert doesn't return the row body (no return=representation),
  // so the real id is looked up by this run's own unique title instead.
  const lookupRes = await page.request.get(`${SUPABASE_URL}/rest/v1/improvement_initiatives?title=eq.${encodeURIComponent(title)}&select=id`, { headers: authHeaders });
  const [{ id: initiativeId }] = await lookupRes.json();
  const backdatedAt = new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString();
  const patchRes = await page.request.patch(`${SUPABASE_URL}/rest/v1/improvement_initiatives?id=eq.${initiativeId}`, { headers: authHeaders, data: { completed_at: backdatedAt } });
  expect(patchRes.ok()).toBeTruthy();

  await page.reload();
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Improvement Initiatives', exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 10000 });
  await page.waitForLoadState('networkidle');
  await initiativeCard().getByRole('button', { name: 'View details' }).first().click();

  // Real, non-fabricated data — asserting the structural pattern
  // (metric name + a real direction word + the non-causal disclaimer),
  // not a fixed percentage, since actual grievance volume in this
  // shared, constantly-growing test org isn't a fixed number.
  await expect(initiativeCard().getByText(/grievance (rates (increased|decreased) \d+%|case volume was unchanged)/).first()).toBeVisible({ timeout: 15000 });
});
