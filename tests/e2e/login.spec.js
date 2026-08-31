import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

test('signs in and lands on Home with the org nav visible', async ({ page }) => {
  await login(page);
  // IA & User Journey pass, §7 (already in the frozen baseline) replaced
  // the standalone "+ New case" button with one universal "Create"
  // control, and grouped secondary destinations (Insights among them)
  // behind collapsible nav-group buttons ("Intelligence" etc.) rather
  // than listing every screen flat — both already true before this fix,
  // just never reflected here.
  await expect(page.getByRole('button', { name: 'Create', exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Cases', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'Intelligence', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Insights', exact: true })).toBeVisible();
});
