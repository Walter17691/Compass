import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Organisational ER Intelligence (Phase 6, OP3, §1) — the Insights
// workspace's default "Organisational Intelligence" tab. Proves the real
// org_insights_overview() RPC (OP2's migration) round-trips end-to-end
// against the real, deployed Supabase project — the component tests in
// OrganisationalIntelligenceOverview.test.jsx already cover its own
// rendering/caveat logic against a mocked RPC, so this only needs to
// prove the real network path works and lands on real numbers, not
// an error or an infinite loading state.
test('the Organisational Intelligence dashboard loads real org-wide stats', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  // The RPC can resolve fast enough that the loading text never gets
  // caught by an assertion — only the terminal states matter here: real
  // stat tiles rendered, not stuck loading and not an error.
  await expect(page.getByText('Open cases', { exact: true })).toBeVisible({ timeout: 15000 });
  await expect(page.getByText("Couldn't load organisational statistics")).not.toBeVisible();
  await expect(page.getByText('Opened this month', { exact: true })).toBeVisible();
  await expect(page.getByText('Overdue cases', { exact: true })).toBeVisible();
  await expect(page.getByText('Cases by type', { exact: true })).toBeVisible();
  await expect(page.getByText('Repeat case themes', { exact: true })).toBeVisible();

  // Organisational ER Intelligence (Phase 6, OP4, §5) — site intelligence,
  // reading org_insights_location_fix_2026-08-19.sql's nested breakdowns.
  await expect(page.getByText('Site intelligence', { exact: true })).toBeVisible();

  // Organisational ER Intelligence (Phase 6, OP5, §14) — benchmarking,
  // reading org_insights_benchmarking_2026-08-19.sql's new field.
  await expect(page.getByText('Avg case duration by department', { exact: true })).toBeVisible();
  await expect(page.getByText('Sanction consistency by case type', { exact: true })).toBeVisible();

  // Organisational ER Intelligence (Phase 6, OP10, §7) — process
  // bottlenecks by site. No new RPC/migration for this phase — reuses
  // the already-loaded cases/employeeRecords arrays client-side, so no
  // pending-migration caveat applies here unlike the RPC-backed panels
  // above.
  await expect(page.getByText('Process bottlenecks by site', { exact: true })).toBeVisible();

  // Organisational ER Intelligence (Phase 6, OP11, §8) — appeal
  // intelligence. Also no new RPC/migration — pure client-side
  // aggregation over the already-loaded allegations/caseSignals arrays.
  await expect(page.getByText('Appeal intelligence', { exact: true })).toBeVisible();
});
