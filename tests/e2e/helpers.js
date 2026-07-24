import { expect } from '@playwright/test';

// Reads E2E_TEST_EMAIL/E2E_TEST_PASSWORD from the environment rather than
// hardcoding credentials in spec files — set these against a dedicated
// throwaway test-org account, never the real production org, since every
// spec run creates real case/DSAR data against whatever account signs in.
export async function login(page) {
  const email = process.env.E2E_TEST_EMAIL;
  const password = process.env.E2E_TEST_PASSWORD;
  if (!email || !password) {
    throw new Error('E2E_TEST_EMAIL and E2E_TEST_PASSWORD must be set — see tests/e2e/README.md');
  }
  await page.goto('/');
  await page.getByPlaceholder('you@company.com').fill(email);
  await page.getByPlaceholder('••••••••').fill(password);
  await page.getByRole('button', { name: 'Sign in' }).click();
  await expect(page.getByText(/^Good (morning|afternoon|evening)/)).toBeVisible({ timeout: 15000 });
}
