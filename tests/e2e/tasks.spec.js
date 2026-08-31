import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Tasks (case_tasks) are new as of Phase 3 of the gap-analysis build-out.
// This proves both surfaces stay in sync: a task added from inside a case
// shows up on the cross-case Tasks screen, and completing it there is
// reflected back — same underlying rows, not two separate stores.
//
// The case workspace's own "Tasks" tab (Phase 6) shares its exact label
// with the top-nav "Tasks" destination that's visible on the same page at
// the same time, so every reference to the in-case tab is scoped to the
// tab bar itself (the one container that also has "Overview"/"Documents"
// buttons) rather than matched by button text alone.
test('a task added on a case appears on the cross-case Tasks screen and can be completed there', async ({ page }) => {
  const employeeName = `E2E Tasks ${Date.now()}`;
  const taskName = `Chase evidence ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  const caseTabBar = page.locator('div')
    .filter({ has: page.getByRole('button', { name: 'Overview', exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Documents', exact: true }) })
    .last();

  // Add a task from inside the case.
  await caseTabBar.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByText(/^Tasks \(0 open\)$/)).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: '+ Add task' }).click();
  await page.getByPlaceholder('Task').fill(taskName);
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByText(taskName)).toBeVisible();
  await expect(page.getByText(/^Tasks \(1 open\)$/)).toBeVisible();

  // Same task shows up on the cross-case Tasks screen (top-nav destination).
  // The shared test org accumulates hundreds of open, undated tasks
  // across every run — filtering to this task's own case (rather than
  // relying on it landing on the default list's first page) is what
  // actually makes finding it deterministic.
  await page.locator('aside, header').getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible({ timeout: 10000 });
  await page.locator('select').filter({ has: page.getByRole('option', { name: 'All cases' }) }).selectOption({ label: employeeName });
  const findTaskRow = () => page.locator('div')
    .filter({ hasText: taskName })
    .filter({ has: page.getByRole('button', { name: employeeName }) })
    .filter({ has: page.getByRole('checkbox') })
    .last();
  await expect(findTaskRow()).toBeVisible();

  // Complete it from the cross-case screen — the default filter hides
  // completed tasks, so it should disappear from the open list...
  await findTaskRow().getByRole('checkbox').click();
  await expect(page.getByText(taskName)).not.toBeVisible();

  // ...but reappears when "Show completed" is checked, struck through.
  await page.getByText('Show completed').click();
  await expect(page.getByText(taskName)).toBeVisible();
});
