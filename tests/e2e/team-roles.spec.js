import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Phase 11 of the gap-analysis build-out: org_members.role expands from
// 3 values to 7 (src/lib/roles.js, mirrored server-side by
// supabase/role_expansion_2026-08-09.sql's is_hr_role()/
// has_confidential_case_oversight() capability functions). This proves
// the Settings UI actually offers all 7 — the invite-role dropdown is the
// reliable one to check without depending on a second real team member
// existing in the shared test org.
test('the invite-member role dropdown offers all 7 roles, not just the original 3', async ({ page }) => {
  await login(page);
  await page.getByRole('button', { name: 'Settings' }).click();
  await page.getByRole('button', { name: 'Team & access' }).click();
  await expect(page.getByText('Team members', { exact: true })).toBeVisible({ timeout: 10000 });

  const roleSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Investigator' }) });
  const optionTexts = await roleSelect.locator('option').allTextContents();
  expect(optionTexts).toEqual(expect.arrayContaining([
    'HR Manager', 'HR Director', 'Location Manager',
    'Line Manager', 'Investigator', 'Legal/Compliance Reviewer', 'Auditor (read-only)',
  ]));
});
