import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Phase 5 of the reasoning-layer build-out (3 of 5 in the ER Intelligence
// MVP — see plan file). Pure and deterministic, unlike Next Best Action/
// Unanswered Questions, so no AI call or loading state to account for
// here — the badge should reflect gaps immediately after an allegation is
// added with no employee response and no linked evidence.
test('Case readiness reflects real gaps and expands into a checklist', async ({ page }) => {
  const employeeName = `E2E Readiness ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Allegations', exact: true }).click();
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Unauthorised absence');
  await page.locator('textarea').first().fill('Left shift early without authorisation on 5 August.');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();

  // 3 of 5 checks met: allegations recorded, no open questions, no open
  // tasks (both vacuously true on a fresh case) — but no employee response
  // and no linked evidence, so those two register as real gaps.
  const badge = page.getByRole('button', { name: /Needs review · 60%/ });
  await expect(badge).toBeVisible({ timeout: 10000 });
  await badge.click();

  await expect(page.getByText(/Compass has identified \d+ matters?/)).toBeVisible();
  await expect(page.getByText('Employee given the opportunity to respond')).toBeVisible();
  await expect(page.getByText('Evidence linked to each allegation')).toBeVisible();
});
