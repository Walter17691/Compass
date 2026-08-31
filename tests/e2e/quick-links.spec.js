import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Home's "Suggested for you" panel claims to be context-aware — different
// items for an active misconduct case vs. a grievance vs. no active cases
// at all. Every item's onClick used to be identical regardless of which
// one was clicked: setScreen(SETTINGS), always landing on the Billing tab
// no matter what was suggested or why. This proves a suggestion tied to a
// real case now opens that case (where Case Copilot's own next-step
// banner already has the right action), not a disconnected settings page.
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

test('the no-active-case fallback quick link opens Settings on the Policies tab, not Billing', async ({ page }) => {
  await login(page);
  // No guarantee the shared E2E org has zero active cases (many other
  // tests create them), so this exercises the same deep-link path via
  // the always-present "View all policies & templates" link instead,
  // which takes the identical setSettingsSection("policies") route.
  await page.getByRole('button', { name: /View all policies & templates/ }).click();
  await expect(page.getByRole('heading', { name: 'Company policies' })).toBeVisible({ timeout: 10000 });
});
