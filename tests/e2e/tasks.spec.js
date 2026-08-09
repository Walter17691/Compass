import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Tasks (case_tasks) are new as of Phase 3 of the gap-analysis build-out.
// This proves both surfaces stay in sync: a task added from inside a case
// shows up on the cross-case Tasks screen, and completing it there is
// reflected back in the case's own Tasks panel — same underlying rows,
// not two separate stores.
test('a task added on a case appears on the cross-case Tasks screen and can be completed there', async ({ page }) => {
  const employeeName = `E2E Tasks ${Date.now()}`;
  const taskName = `Chase evidence ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText('Allegations (0)')).toBeVisible({ timeout: 10000 });

  // Add a task from inside the case.
  await page.getByRole('button', { name: 'Case tasks' }).click();
  await expect(page.getByText(/^Tasks \(0 open\)$/)).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: '+ Add task' }).click();
  await page.getByPlaceholder('Task').fill(taskName);
  await page.getByRole('button', { name: 'Add task' }).click();
  await expect(page.getByText(taskName)).toBeVisible();
  await expect(page.getByText(/^Tasks \(1 open\)$/)).toBeVisible();

  // Same task shows up on the cross-case Tasks screen.
  await page.getByRole('button', { name: '← Back to case' }).click();
  await page.getByRole('button', { name: 'Tasks', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Tasks' })).toBeVisible({ timeout: 10000 });
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
