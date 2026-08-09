import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Phase 6 of the gap-analysis build-out replaced the case view's old
// stage-tabs-drive-everything layout with a proper named tab bar
// (Overview/Timeline/Allegations/Meetings/Evidence/People/Tasks/
// Documents/Outcome/AI Assistant). This exercises the tabs that aren't
// already covered by allegations/timeline/tasks/case-creation-fields
// specs, on a freshly created case with no meetings yet — proving each
// one renders its own real (or honestly-placeholder) content rather than
// inheriting whatever the previously active tab showed.
test('People, Documents, Outcome, Meetings, and AI Assistant tabs each render distinct content', async ({ page }) => {
  const employeeName = `E2E CaseTabs ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // Overview is the default landing tab.
  await expect(page.getByText('Description', { exact: true })).toBeVisible();

  // Participants — the employee themselves is always listed, tagged as such.
  // Labeled "Participants" (not "People") specifically to avoid colliding
  // with the top-nav "People" employee-directory destination visible on
  // the same page.
  await page.getByRole('button', { name: 'Participants', exact: true }).click();
  await expect(page.getByText(/^Participants \(\d+\)$/)).toBeVisible({ timeout: 10000 });
  const employeeRow = page.locator('div').filter({ hasText: employeeName }).filter({ hasText: 'Employee' }).last();
  await expect(employeeRow).toBeVisible();

  // Documents — nothing generated yet.
  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await expect(page.getByText('No letters or files on this case yet.')).toBeVisible({ timeout: 10000 });

  // Outcome — case hasn't reached a disciplinary hearing.
  await page.getByRole('button', { name: 'Outcome', exact: true }).click();
  await expect(page.getByText(/hasn't reached a disciplinary hearing/)).toBeVisible({ timeout: 10000 });

  // Meetings — investigation stage pill selected by default, empty state shown.
  await page.getByRole('button', { name: 'Meetings', exact: true }).click();
  await expect(page.getByText('No investigation meetings yet')).toBeVisible({ timeout: 10000 });

  // AI Assistant — honest placeholder, not a broken/missing tab.
  await page.getByRole('button', { name: 'AI Assistant', exact: true }).click();
  await expect(page.getByText('Coming in a future update')).toBeVisible({ timeout: 10000 });
});
