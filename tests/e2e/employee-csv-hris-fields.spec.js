import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Integrations & Workflow Automation (Phase 5, IP20, §14 cont.) —
// employee data sync's richer field set. Fully deterministic (no AI
// call, no unproxied /api/calendar dependency), so this exercises the
// real import -> persist -> export round-trip end-to-end: a CSV with the
// new HRIS columns (employee number, department, manager, status,
// working pattern, probation end date) imports correctly and those
// values come back out unchanged on export, proving the new columns
// actually persist rather than just being accepted and dropped.
test('importing an employee CSV with the new HRIS columns round-trips them on export', async ({ page }) => {
  const employeeName = `E2E Hris ${Date.now()}`;
  const csv = [
    'Name,Job title,Start date,Location,Employee number,Department,Manager,Status,Working pattern,Probation end date',
    `${employeeName},Team Lead,01/01/2026,Manchester,EX-042,Operations,Jo Smith,active,full_time,01/04/2026`,
  ].join('\n');

  await login(page);
  await page.locator('aside, header').getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Employee data', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Employee records' })).toBeVisible({ timeout: 10000 });

  await page.locator('input[type="file"]').first().setInputFiles({ name: 'employees.csv', mimeType: 'text/csv', buffer: Buffer.from(csv) });

  await expect(page.getByText(/^Imported 1 employee/)).toBeVisible({ timeout: 10000 });

  const downloadPromise = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Export to CSV' }).click();
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const exported = Buffer.concat(chunks).toString('utf-8');

  const row = exported.split('\n').find(line => line.includes(employeeName));
  expect(row).toBeTruthy();
  expect(row).toContain('EX-042');
  expect(row).toContain('Operations');
  expect(row).toContain('Jo Smith');
  expect(row).toContain('active');
  expect(row).toContain('full_time');
  expect(row).toContain('01/04/2026');
});
