import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

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
