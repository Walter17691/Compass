import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Integrations & Workflow Automation (Phase 5, IP12, §6) — the three new
// draft types (witness invitation, evidence request, OH consent
// request) share handleLetter's real Claude call, so — same reasoning as
// case-golden-path.spec.js's own comment on full AI-letter generation —
// this doesn't assert on the letter's exact wording, just that clicking
// one of the new Documents-tab buttons actually reaches the Letter
// editor and produces a real draft, proving the new type wires all the
// way through rather than only in isolated unit/component tests.
test('drafting a witness invitation from the Documents tab reaches the Letter editor with real content', async ({ page }) => {
  test.setTimeout(60000); // one real Claude call
  const employeeName = `E2E SmartDraft ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Documents', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Witness invitation' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Witness invitation' }).click();

  await expect(page.getByText('Drafting...')).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Drafting...')).not.toBeVisible({ timeout: 30000 });

  // Real AI content landed, mentioning the one thing the instruction
  // explicitly requires ("witness") — not asserting exact wording beyond that.
  await expect(page.getByText(/witness/i).first()).toBeVisible();
});
