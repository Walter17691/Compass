import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Phase 17 of the reasoning-layer build-out (scale/commercialisation
// wave, after manager investigation mode). Read-only and entirely
// client-side — cases/allegations are already loaded org-wide, so no new
// backend was needed. Grouped only by case type, never by anything
// employee-identifying, per the spec's own hard constraint.
//
// computeOutcomeDistribution's actual distribution math (percentages,
// exclusion of the current case, ignoring non-finding statuses, the
// minimum-sample-size floor) is covered thoroughly by
// src/test/outcomeConsistency.test.js's 7 unit tests. Reaching a genuine
// "3+ closed cases of the same type with a recorded finding" state
// through the UI needs a full sign-off flow (closing a case requires a
// signed meeting record) which isn't practical to stand up three times
// over in an E2E test — this instead proves the one thing that IS
// reliably UI-testable without that setup: a fresh case with no
// comparable history correctly shows no distribution panel at all,
// rather than a misleading one built on too few (or zero) prior cases.
test('a case with no comparable closed-case history shows no outcome distribution panel', async ({ page }) => {
  const employeeName = `E2E Consistency ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Allegations', exact: true }).click();
  await expect(page.getByText('Allegations (0)')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Unauthorised absence');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  // .last() — the Evidence Matrix (rendered above the card list) also has
  // an "Unauthorised absence" cell sharing this text with the allegation
  // card's title; this page only ever shows the one case just navigated
  // to, so both matches are this case's own content, never another case's.
  await page.getByText('Unauthorised absence').last().click();

  await expect(page.locator('label:text-is("Status") + select')).toBeVisible();
  await expect(page.getByText('How similar cases have been decided')).not.toBeVisible();
});
