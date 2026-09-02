import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Phase 14 of the reasoning-layer build-out (first of the scale/
// commercialisation wave). The one screen any org member can reach
// regardless of role — the line_manager role (role_expansion_2026-08-09.sql)
// has existed since that migration but never actually gated anything
// until now. The E2E test account is HR, so this covers the HR-facing
// triage queue path (submit -> triage -> "open formal case" creates a
// real case, per concern_referrals_2026-08-12.sql); the non-HR
// intake-only view is covered by ConcernsScreen's own !isHR branch, not
// separately E2E-tested here since there's no non-HR test account to
// verify it against live RLS.
test('a raised concern can be triaged into a real formal case', async ({ page }) => {
  test.setTimeout(60000); // includes one real triage-summary AI call
  const employeeName = `E2E Concern ${Date.now()}`;

  await login(page);
  // The E2E test account is HR, so the nav label reads "Concerns" (the
  // full triage view) rather than "Raise a concern" (the non-HR
  // intake-only label) — see AppSidebar.jsx's isHR-conditional label.
  await page.getByRole('button', { name: 'Work', exact: true }).click();
  await page.getByRole('button', { name: 'Concerns', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'People concerns' })).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: '+ Raise a concern' }).click();
  await page.getByPlaceholder("Who is this about?").fill(employeeName);
  await page.getByLabel('What kind of concern is this?').selectOption('conduct');
  await page.getByPlaceholder(/What happened/).fill('Repeatedly left site during shift without authorisation, witnessed by two colleagues.');
  // Manager Enablement (Phase 4, MP4) — the description above mentions a
  // witness with no name given yet, so the live, advisory gap hint should
  // appear (and never blocks submission).
  await expect(page.getByText('You mentioned someone else may have seen or heard this', { exact: false })).toBeVisible();
  await page.getByPlaceholder('Names of anyone who saw or heard this').fill('Priya Shah, Tom Norton');
  await expect(page.getByText('You mentioned someone else may have seen or heard this', { exact: false })).not.toBeVisible();
  await page.getByPlaceholder('Briefly describe it').fill('CCTV footage from the loading bay camera');
  // Anyone at risk? — split from the original single safety/welfare
  // checkbox (MP4, §2) into this and the immediate-safety-concern
  // question right below it.
  await page.getByText('Is anyone currently at risk?', { exact: true }).click();
  const saveResponse = page.waitForResponse(r => r.url().includes('/rest/v1/concern_referrals') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Submit concern' }).click();
  await saveResponse;

  const referralCard = page.locator('div').filter({ hasText: employeeName }).filter({ hasText: 'Open formal case' }).last();
  await expect(referralCard).toBeVisible({ timeout: 10000 });
  await expect(referralCard.getByText('⚠ Anyone at risk flagged')).toBeVisible();
  await expect(referralCard.getByText('Witnesses: Priya Shah, Tom Norton')).toBeVisible();
  await expect(referralCard.getByText('Evidence: CCTV footage from the loading bay camera')).toBeVisible();

  // Manager Enablement (Phase 4, MP5, §3) — Compass's own triage summary,
  // generated automatically (no button click) right after submission.
  // Structure over exact AI wording, same discipline as every other
  // AI-response assertion in this suite: only the category badge's
  // presence (not its specific label) and the summary block existing at
  // all are asserted.
  await expect(referralCard.getByText('Compass summary', { exact: true })).toBeVisible({ timeout: 30000 });
  await expect(referralCard.getByText('Compass is analysing this concern…')).not.toBeVisible();

  const caseSaved = page.waitForResponse(r => r.url().includes('/rest/v1/cases') && ['POST','PATCH'].includes(r.request().method()));
  await referralCard.getByRole('button', { name: 'Open formal case' }).click();
  await caseSaved;

  // The card updates in place — status badge flips and the disposition
  // buttons are replaced by a direct link into the new case.
  const resolvedCard = page.locator('div').filter({ hasText: employeeName }).filter({ hasText: 'Open the case' }).last();
  await expect(resolvedCard).toBeVisible({ timeout: 10000 });
  await expect(resolvedCard.getByText('Formal case opened')).toBeVisible();

  await resolvedCard.getByRole('button', { name: 'Open the case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: '← Cases' })).toBeVisible();
});
