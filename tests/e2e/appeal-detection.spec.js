import { test, expect } from '@playwright/test';
import { login, openNewCaseModal, startMeeting } from './helpers.js';

// Appeal-phrase detection already existed in the codebase (a keyword
// check on the live transcript that offers to link the meeting to an
// existing case) but had two real gaps, fixed alongside this test:
// (1) linking never set the target case's stage to "appeal", so the most
// realistic scenario — appealing a case that's already closed — left it
// permanently shown as closed, since getCaseStage() returns "closed"
// unconditionally before any heuristic runs; (2) every case in the org
// was offered as a link target rather than scoping to the same employee
// (src/lib/appealLink.js).
test('appealing a closed case detects the appeal, links to the right case, and reopens it', async ({ page }) => {
  test.setTimeout(90000);
  const employeeName = `E2E Appeal ${Date.now()}`;

  await login(page);

  // Create and close a case for this employee.
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('capability');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // The shared E2E test org accumulates hundreds of same-day cases across
  // this suite's own runs — even "today + misconduct" isn't narrow enough
  // (misconduct being the type nearly every other spec defaults to), so
  // this deliberately uses "capability" (a Phase 5 case type essentially
  // unused elsewhere in the suite) to keep the candidate set small enough
  // that the freshly created case is reliably on the first page.
  const today = new Date().toISOString().split('T')[0];
  await page.getByRole('button', { name: '← Cases' }).click();
  await expect(page.getByRole('heading', { name: 'Cases' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /More filters/ }).click(); // Phase 2B - date range moved behind More filters
  await page.getByLabel('From', { exact: true }).fill(today);
  await page.getByLabel('Filter by case type').selectOption('capability');
  // CasesScreen's per-case row title (getProceedingTitle) doesn't include
  // the employee name at all — only the group heading above it does — so
  // the checkbox for this employee's case is the first one appearing
  // after that heading in document order, not found by text-matching the
  // row itself.
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  await page.getByText(employeeName).locator('xpath=following::input[@type="checkbox"][1]').click();
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  // bulkClose asks for confirmation first — its dialog's own confirm
  // button also happens to be labeled "Close", so it's scoped to the
  // dialog to avoid re-clicking the bulk-action-bar trigger.
  await page.getByRole('alertdialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('1 case closed')).toBeVisible({ timeout: 10000 });

  // Start a new meeting for the same employee, with appeal language in
  // the transcript — this is what the detection actually keys off, not
  // the selected meeting type. "Start meeting" lives on Home, not Cases.
  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  await startMeeting(page);
  await page.getByText('Disciplinary Appeal', { exact: true }).click();
  await page.getByPlaceholder(/e.g. Sarah Johnson/).fill(employeeName);
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  await page.getByPlaceholder(/Type or speak your meeting notes here/).waitFor({ timeout: 10000 });
  await page.getByPlaceholder(/Type or speak your meeting notes here/).fill(
    'Employee: I want to appeal the original decision — I don\'t think the outcome was fair given what I explained.\n' +
    'HR: Understood, let\'s go through your grounds of appeal.'
  );
  await page.getByRole('button', { name: 'End meeting' }).click();

  // The link-case prompt fires as soon as the appeal words are detected,
  // independent of how long the full AI meeting record takes.
  await expect(page.getByText('Appeal detected')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('This looks like an appeal.')).toBeVisible();
  const linkButton = page.getByRole('button', { name: new RegExp(employeeName) });
  await expect(linkButton).toBeVisible();
  await linkButton.click();
  // The toast is easy to miss by the time this polls (3s auto-dismiss) —
  // the modal closing is the reliable signal the link went through; the
  // Cases-list check below verifies the actual outcome that matters.
  await expect(page.getByText('Appeal detected')).not.toBeVisible({ timeout: 10000 });

  // The case is no longer stuck showing as closed. Linking doesn't
  // navigate anywhere (still on the Review screen with the in-progress
  // meeting record), so use the top nav rather than a screen-specific
  // back button.
  await page.locator('aside, header').getByRole('button', { name: /^Cases/ }).click();
  await expect(page.getByRole('heading', { name: 'Cases' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /More filters/ }).click(); // Phase 2B - date range moved behind More filters
  await page.getByLabel('From', { exact: true }).fill(today);
  await page.getByLabel('Filter by case type').selectOption('capability');
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  // The group wrapper (employee heading + checkbox + case row) is the
  // only div containing both the employee heading and a checkbox, since
  // the row's own title (getProceedingTitle) never includes the employee
  // name — scoping here avoids matching header chrome elsewhere on the
  // page that happens to also follow the heading in document order.
  const caseGroup = page.locator('div').filter({ hasText: employeeName }).filter({ has: page.locator('input[type="checkbox"]') }).last();
  await expect(caseGroup.getByText('Closed', { exact: true })).toHaveCount(0);
  await expect(caseGroup).toContainText(/Appeal/);
});
