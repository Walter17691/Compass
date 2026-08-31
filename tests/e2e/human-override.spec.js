import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Process Intelligence Phase 3 (P1) — M9's "Proceed anyway" used to skip
// straight past an unresolved gap with nothing recorded anywhere. It now
// routes through requestOverrideReason (src/lib/humanOverride.js): a
// second "Proceed anyway?" prompt asks for one optional short reason
// before the original action actually proceeds, and if a reason is given
// it's written to the audit trail — which surfaces on the case's own
// Timeline tab (caseTimeline.js already merges auditLog entries scoped to
// that case). Cancelling that prompt cancels the whole override, same as
// never having clicked "Proceed anyway" at all. This is the first real
// call site of a primitive every later Process Intelligence phase (P6,
// P7, P9, P11) reuses rather than building its own reason-capture UI.
test('proceeding past a meeting quality check gap can be cancelled, or confirmed with a reason that lands on the case timeline', async ({ page }) => {
  test.setTimeout(90000); // one real meeting-record + summary generation after confirming
  const employeeName = `E2E HumanOverride ${Date.now()}`;

  await login(page);

  // A real case with an allegation the meeting will deliberately never
  // discuss — the same "allegation not covered" gap M11's end-to-end spec
  // exercises, chosen here instead of the essential-question gap so this
  // test also proves the override resolves to a real, findable case for
  // the audit-trail assertion at the end.
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Allegations', exact: true }).click();
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Unauthorised absence');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (1)')).toBeVisible();

  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Start meeting' }).first().click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: /^Investigation/ }).click();
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  const notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });

  // Deliberately never mentions the allegation ("unauthorised"/"absence").
  await notepad.fill('HR: Thank you for coming in today.\n');
  await notepad.fill('Employee: Of course, happy to help.\n');

  await page.getByRole('button', { name: 'End meeting' }).click();
  const qualityModal = page.getByRole('dialog').filter({ hasText: 'Meeting Quality Check' });
  await expect(qualityModal.getByText('Meeting Quality Check', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(qualityModal.getByText(/Allegation not discussed.*Unauthorised absence/)).toBeVisible();

  // First pass: click Proceed anyway, then cancel the reason prompt —
  // the meeting must NOT end, same as if "Proceed anyway" was never
  // clicked at all.
  await page.getByRole('button', { name: 'Proceed anyway' }).click();
  const overridePrompt = page.getByRole('dialog', { name: 'Proceed anyway?' });
  await expect(overridePrompt).toBeVisible({ timeout: 5000 });
  await overridePrompt.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(overridePrompt).not.toBeVisible();
  await expect(notepad).toBeVisible();
  await expect(page.getByText('Meeting record', { exact: true })).not.toBeVisible();

  // Second pass: End meeting again, this time confirm the override with a
  // real reason.
  const overrideReason = `Deferred to a follow-up meeting ${Date.now()}`;
  await page.getByRole('button', { name: 'End meeting' }).click();
  await expect(qualityModal).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Proceed anyway' }).click();
  await expect(overridePrompt).toBeVisible({ timeout: 5000 });
  await overridePrompt.locator('input').fill(overrideReason);
  await overridePrompt.getByRole('button', { name: 'Proceed', exact: true }).click();
  await expect(overridePrompt).not.toBeVisible();

  await expect(page.getByText('Compass HR Advisor', { exact: true })).toBeVisible({ timeout: 90000 });
  await page.getByRole('button', { name: 'Save and go to case →' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  const caseTabBar = page.locator('div')
    .filter({ has: page.getByRole('button', { name: 'Overview', exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Documents', exact: true }) })
    .last();
  await caseTabBar.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.getByText(new RegExp(overrideReason))).toBeVisible({ timeout: 10000 });
});
