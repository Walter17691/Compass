import { test, expect } from '@playwright/test';
import { login, openNewCaseModal, openCaseSection } from './helpers.js';

// Process Intelligence Phase 3 (P18, §15) — the first genuinely
// org-configurable ER process template: define required documents,
// suggested meetings, a default task, a suggested role, a linked policy
// and a target timescale for a process type in Settings, then confirm a
// new case of that type both auto-creates the default task (the one part
// of a template that actually acts on its own — createCaseTask, wired
// into the "+ New case" handler) and renders the rest as a read-only
// checklist on the case's Overview tab (ProcessChecklistPanel).
//
// "Flexible working" is used as the process type — of every type
// selectable from "+ New case", it's the only one no other E2E spec in
// this shared org ever creates a case of *and* asserts a task count on,
// so this test's own default task can't be diluted by, or interfere
// with, any other spec's task-count assertions.
test('an org-configured process template auto-creates its default task and shows its checklist on a new case', async ({ page }) => {
  test.setTimeout(60000);
  await login(page);

  const taskName = `E2E Template Task ${Date.now()}`;
  const employeeName = `E2E Template ${Date.now()}`;

  await page.getByRole('button', { name: 'Organisation', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Process templates', exact: true }).click();
  await expect(page.getByText('Process templates', { exact: true }).first()).toBeVisible({ timeout: 10000 });

  await page.getByText('Flexible working', { exact: true }).click();
  // This template is shared, upserted org-wide state — an earlier run of
  // this exact test may have left its own default task row behind (the
  // textareas below get fully replaced by .fill() each run, but default
  // tasks are an add-only list in the UI). Clear any existing rows first
  // so this run's own task doesn't just pile onto a growing list.
  while (await page.getByRole('button', { name: 'Remove task' }).count() > 0) {
    await page.getByRole('button', { name: 'Remove task' }).first().click();
  }
  await page.getByPlaceholder('e.g. Investigation report').fill('Flexible working request form');
  await page.getByPlaceholder('e.g. Investigation meeting').fill('Decision meeting');
  await page.getByRole('button', { name: '+ Add default task' }).click();
  await page.getByPlaceholder('Task').fill(taskName);
  // The checkbox is a child of the <label> whose own text is exactly the
  // role name (no other wrapping element in between), so getByText
  // resolves directly to it — no need to walk to a parent container that
  // would otherwise also match every other role's own checkbox.
  await page.getByText('Case Owner', { exact: true }).getByRole('checkbox').check();
  await page.locator('select').filter({ has: page.locator('option', { hasText: 'Flexible Working' }) }).selectOption('flexible_working');
  await page.getByPlaceholder('10').fill('15');

  const templateSaved = page.waitForResponse(r => r.url().includes('/rest/v1/process_templates') && ['POST', 'PATCH'].includes(r.request().method()));
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await templateSaved;
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10000 });

  // Create a new "flexible working" case — the template should fire.
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('flexible working');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // The read-only checklist, on Overview (already the landing tab).
  await expect(page.getByText('Process checklist', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Flexible working request form', { exact: true })).toBeVisible();
  await expect(page.getByText('Decision meeting', { exact: true })).toBeVisible();
  await expect(page.getByText('Target: 15 days per stage', { exact: false })).toBeVisible();

  // The default task, auto-created as a real, working case task.
  // The tab's own open-task-count badge renders as an adjacent <span>
  // with no separating whitespace in the DOM, so its accessible name is
  // "Tasks1", not "Tasks" — same concatenation approval-workflow.spec.js
  // hits for its own approval-status text.
  await openCaseSection(page, 'Tasks');
  await expect(page.getByText(taskName, { exact: true })).toBeVisible({ timeout: 10000 });
});
