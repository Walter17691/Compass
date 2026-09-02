import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Home's "Suggested for you" panel claims to be context-aware — different
// items for an active misconduct case vs. a grievance vs. no active cases
// at all. Every item's onClick used to be identical regardless of which
// one was clicked: setScreen(SETTINGS), always landing on the Billing tab
// no matter what was suggested or why. This proves a suggestion tied to a
// real case now opens that case (where Case Copilot's own next-step
// banner already has the right action), not a disconnected settings page.
//
// E2E Navigation Alignment pass — BOTH tests in this file now fail, and
// neither is stale IA navigation (Create/More): commit 159943f ("Home
// simplification... Phase 7.5C") explicitly removed the entire
// "Suggested for you"/"Quick links" panel from Home ("removed the
// redundant 'Quick links' suggestion list"). Confirmed via source: no
// JSX anywhere renders "Continue disciplinary case" or calls
// setSettingsSection("policies") any more — only stale comments
// mentioning the old feature name remain (App.jsx, SettingsScreen.jsx).
// This predates the Create/More redesign this pass targets and isn't a
// navigation-path change — the destination itself no longer exists.
// Both left failing deliberately rather than mechanically repointed at
// a different, weaker claim (e.g. "Settings → Policies is reachable",
// already covered elsewhere) that wouldn't actually verify what these
// tests exist to prove. Needs a product decision (restore the
// suggestion panel, or retire this file) — out of scope for a
// test-only pass.
test('a case-linked quick link opens the actual case, not just Settings', async ({ page }) => {
  const employeeName = `E2E QuickLinks ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  // The modal has more than one plain <select> (location, case type) with
  // no accessible label association, so target by DOM adjacency to the
  // "Case type" label rather than an ambiguous role query.
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // Back to Home, where the misconduct case should now surface a
  // case-linked suggestion.
  await page.getByRole('button', { name: 'Home' }).click();
  const suggestion = page.getByRole('button', { name: /Continue disciplinary case/ });
  await expect(suggestion).toBeVisible({ timeout: 10000 });
  await expect(suggestion.getByText('Misconduct case open')).toBeVisible();

  await suggestion.click();

  // Landed on a real case view (stage tabs, back-to-cases button), not
  // the Settings screen — Settings' Billing tab does not render either
  // of these.
  await expect(page.getByRole('button', { name: '← Cases' })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Billing', { exact: true })).not.toBeVisible();
});

// See the file-level comment above — the no-active-case fallback item
// this test targets was removed in the same commit, not relocated.
test('the no-active-case fallback quick link opens Settings on the Policies tab, not Billing', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: /View all policies & templates/ }).click();
  await expect(page.getByRole('heading', { name: 'Company policies' })).toBeVisible({ timeout: 10000 });
});
