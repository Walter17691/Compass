import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Process Intelligence Phase 3 (P2) — before this, "probation"/
// "flexible working"/"long-term sickness" were already selectable case
// types (the quick-create dropdown has offered "Probation" and "Flexible
// working" for a while; "Long-term sickness" is new here) but had no
// dedicated stage tracking at all — getCaseStage/getNextStep only ever
// recognised the disciplinary or grievance shape, so a probation case
// silently got disciplinary-shaped guidance like "Schedule investigation
// meeting", which makes no sense for probation. Real per-type stage
// definitions (src/lib/processStages.js) plus new getCaseStage/
// getNextStep branches mean these case types now get their own, correct
// "what should happen next" guidance — the exact thing CaseViewScreen's
// "Next:" banner already surfaces for misconduct/grievance cases.
test('a probation case and a long-term sickness case each get their own correct next-step guidance, not disciplinary-shaped guidance', async ({ page }) => {
  const probationEmployee = `E2E Probation ${Date.now()}`;
  const sicknessEmployee = `E2E LongTermSickness ${Date.now()}`;

  await login(page);

  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(probationEmployee);
  await page.locator('label:text-is("Case type") + select').selectOption('probation');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(probationEmployee).first()).toBeVisible({ timeout: 10000 });

  // A fresh probation case with no meetings recorded yet should recommend
  // a check-in — never "Schedule investigation meeting" (the disciplinary
  // shape's own intake recommendation, wrong for probation).
  await expect(page.getByText('Next: Schedule a check-in', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Next: Schedule investigation meeting', { exact: true })).not.toBeVisible();

  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(sicknessEmployee);
  await page.locator('label:text-is("Case type") + select').selectOption('long-term sickness');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(sicknessEmployee).first()).toBeVisible({ timeout: 10000 });

  await expect(page.getByText('Next: Make contact with the employee', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/expected under most attendance policies/)).toBeVisible();
});
