import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Phase 22 of the reasoning-layer build-out — Global Compass AI. A new,
// additive entry point ("Ask Compass" in the sidebar) alongside the
// existing per-case AI Assistant tab, not a replacement. App.jsx's
// sendGlobalChat classifies the question first, then routes to a real
// scoped query — org_case_stats() (a Supabase RPC,
// supabase/global_ai_stats_2026-08-12.sql) for aggregate questions, or
// buildHardenedCaseContext (Phase 21) for a specific named case — before
// generating the actual answer. Confidentiality enforcement for the new
// RPC itself was verified directly against the database (simulated
// sessions, not just app-level testing) before this shipped — see the
// migration file's own comment for that verification. This spec proves
// the feature works end-to-end through the UI: a stats question gets a
// real, grounded number back, and a specific-case question surfaces a
// link into that actual case.
test('Ask Compass answers an org-wide stats question with a real, grounded number', async ({ page }) => {
  test.setTimeout(90000); // two real Claude calls (classify, then answer) plus the RPC in between

  await login(page);
  await page.getByRole('button', { name: 'Ask Compass', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ask Compass' })).toBeVisible({ timeout: 10000 });

  // sendGlobalChat makes two real Claude calls back-to-back (classify,
  // then answer) before the RPC even fires — a generous timeout here
  // accommodates that without masking a genuine failure.
  const statsResponse = page.waitForResponse(r => r.url().includes('/rest/v1/rpc/org_case_stats'), { timeout: 40000 });
  await page.getByPlaceholder('Ask Compass anything about your cases…').fill('How many total cases do we have on file?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText('Thinking…')).toBeVisible();
  const rpcRes = await statsResponse;
  expect(rpcRes.ok()).toBeTruthy();
  const stats = await rpcRes.json();
  expect(stats.total_cases).toBeGreaterThan(0);

  await expect(page.locator('div').filter({ hasText: /^Thinking…$/ })).toHaveCount(0, { timeout: 30000 });
  // Not asserting exact wording (a real AI call) — just that the real
  // total_cases figure from the RPC actually appears in the answer,
  // proving the number is grounded in the live query, not guessed.
  // Scoped to the assistant's own chat bubble (data-role="assistant",
  // GlobalAssistantScreen.jsx) rather than a bare page-wide text search,
  // which can collide with an unrelated sidebar notification (e.g. an
  // overdue DSAR item's own reference number) that happens to contain the
  // same digits as a substring.
  // The AI now formats large totals with a thousands separator (the org
  // has crossed 1,000 cases), so match either "1867" or "1,867" rather
  // than a bare digit substring.
  const assistantBubble = page.locator('[data-role="assistant"]').last();
  await expect(assistantBubble).toContainText(new RegExp(String(stats.total_cases).replace(/\B(?=(\d{3})+(?!\d))/g, ',?')), { timeout: 10000 });

  // Organisational ER Intelligence (Phase 6, OP20, §20) — every "stats"
  // answer now also grounds itself in org_insights_overview()/
  // org_trend_detection() and infers a real Insights tab to drill into
  // (globalAnalytics.js's inferInsightsTab). Confirms the drill-down link
  // both appears and actually routes into the Insights screen, not just
  // that it's rendered inert.
  const insightsLink = page.getByRole('button', { name: 'View in Insights →' });
  await expect(insightsLink).toBeVisible({ timeout: 10000 });
  await insightsLink.click();
  await expect(page.getByRole('heading', { name: 'Insights' })).toBeVisible({ timeout: 10000 });
});

test('Ask Compass answers a specific-case question and links back to that case', async ({ page }) => {
  test.setTimeout(60000);
  const employeeName = `E2E GlobalAI ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByPlaceholder('Brief summary of the issue…').fill('Alleged unauthorised absence from shift on 5 August.');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.locator('aside, header').getByRole('button', { name: 'Ask Compass', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Ask Compass' })).toBeVisible({ timeout: 10000 });

  await page.getByPlaceholder('Ask Compass anything about your cases…').fill(`What is ${employeeName}'s case about?`);
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText('Thinking…')).toBeVisible();
  await expect(page.locator('div').filter({ hasText: /^Thinking…$/ })).toHaveCount(0, { timeout: 30000 });

  const openCaseButton = page.getByRole('button', { name: 'Open this case →' });
  await expect(openCaseButton).toBeVisible({ timeout: 10000 });
  await openCaseButton.click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: '← Cases' })).toBeVisible();
});
