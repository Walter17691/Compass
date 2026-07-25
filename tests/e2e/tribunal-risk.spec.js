import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test('entering weekly pay shows an indicative exposure estimate with the disclaimer', async ({ page }) => {
  const employeeName = `E2E Risk ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.getByRole('combobox').nth(2).selectOption('misconduct'); // combobox 0 is the employee-name input (has a datalist), 1 is Location, 2 is Case type
  await page.getByRole('button', { name: 'Create case', exact: true }).click();

  await page.getByText(employeeName).click();
  await expect(page.getByText('RISK & TRIBUNAL EXPOSURE')).toBeVisible({ timeout: 10000 });

  await page.getByPlaceholder('For exposure estimate').fill('500');
  await page.getByPlaceholder('For exposure estimate').blur();

  await expect(page.getByText('Indicative exposure:')).toBeVisible();
  await expect(page.getByText(/not legal advice/)).toBeVisible();
});
