import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Process Intelligence Phase 3 (P16, §5) — computeDueSoon's four new
// sources (fit note, probation review, OH referral, suspension review),
// each a direct HR-entered date on the case (OverviewTab's new "Key
// dates" card), plus the new Calendar screen that visualises the same
// computeDueSoon output as a month grid rather than a flat list.
test('a probation review date entered on a case surfaces on the Calendar and links back to the case', async ({ page }) => {
  test.setTimeout(60000);
  await login(page);
  const employeeName = `E2E DeadlineIntel ${Date.now()}`;

  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('probation');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // A date 5 days from today — comfortably inside computeDueSoon's
  // 14-day window, and reliably inside "this month" or "next month"
  // depending on when this runs, so the test navigates to whichever.
  const target = new Date();
  target.setDate(target.getDate() + 5);
  const targetIso = target.toISOString().split('T')[0];
  const targetDay = target.getDate();
  const crossesMonth = target.getMonth() !== new Date().getMonth();

  await expect(page.getByText('Key dates', { exact: true })).toBeVisible({ timeout: 10000 });
  const dateInput = page.locator('label:text-is("Probation review") + input[type="date"]');
  const caseSaved = page.waitForResponse(r => r.url().includes('/rest/v1/cases') && ['PATCH','POST'].includes(r.request().method()));
  await dateInput.fill(targetIso);
  await dateInput.blur();
  await caseSaved;
  await expect(dateInput).toHaveValue(targetIso);

  await page.getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.getByText('Calendar', { exact: true }).first()).toBeVisible({ timeout: 10000 });
  if (crossesMonth) {
    await page.getByRole('button', { name: '→', exact: true }).click();
  }

  // This shared E2E org has accumulated a large number of deadlines
  // across every spec's own runs all session, so a busy day's cell only
  // ever shows its first 3 chips plus a "+N more" — this test's own item
  // is very likely hidden behind that truncation. The day-number label
  // itself is a stable, untruncated way to open that day's detail panel
  // instead, which lists every item for the day in full.
  await page.getByText(String(targetDay), { exact: true }).click();
  // Earlier runs of this exact test, mid-debugging, land on the same
  // "+5 days from today" date and never got cleaned up — several
  // "Probation review due" entries can be on this same day, so the
  // generic label alone is ambiguous. Scoped by this run's own unique
  // employee name too.
  const detailItem = page.locator('div').filter({ hasText: employeeName }).filter({ hasText: 'Probation review due' }).last();
  await expect(detailItem).toBeVisible({ timeout: 10000 });
  await detailItem.click();

  // Following the link lands back on this exact case.
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByRole('button', { name: 'Overview', exact: true })).toBeVisible();
});
