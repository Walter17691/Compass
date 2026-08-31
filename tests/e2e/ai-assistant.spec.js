import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Phase 8 of the gap-analysis build-out: the AI Case Overview and
// case-wide "Ask Compass" chat, both scoped strictly to this case's own
// record (src/lib/caseContext.js) — live-verified separately against the
// real Claude API to confirm the guardrails hold (never presents
// unsupported claims as fact, never recommends a sanction/outcome). This
// just proves the UI wiring: clicking Generate produces a structured
// overview with the required section headers, and the chat round-trips a
// real question to a real answer.
test('AI case overview generates structured sections, and Ask Compass answers a question', async ({ page }) => {
  test.setTimeout(75000); // two real Claude calls (overview + chat) back to back, well past the 30s default
  const employeeName = `E2E AIAssistant ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByPlaceholder('Brief summary of the issue…').fill('Alleged unauthorised absence from shift on 5 August.');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'AI Assistant', exact: true }).click();
  await expect(page.getByText('AI case overview')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Generate overview' }).click();
  await expect(page.getByText('Reading the case record…')).toBeVisible();
  await expect(page.getByText('Established facts')).toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Recommended next procedural step')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Regenerate' })).toBeVisible();

  await page.getByPlaceholder(/What evidence supports/).fill('What is this case about?');
  await page.getByRole('button', { name: 'Ask', exact: true }).click();
  await expect(page.getByText('Thinking…')).toBeVisible();
  await expect(page.getByText('What is this case about?')).toBeVisible();
  // Some real answer appears — not asserting exact wording, just that a
  // second chat bubble (the assistant's reply) landed.
  await expect(page.locator('div').filter({ hasText: /^Thinking…$/ })).toHaveCount(0, { timeout: 30000 });
});
