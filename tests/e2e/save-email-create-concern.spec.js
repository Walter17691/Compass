import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Integrations & Workflow Automation (Phase 5, IP10, §2-3) — the "Create
// New Concern" choice against a read email. Same one-real-Claude-call
// shape as save-email.spec.js (reading the email itself isn't
// deterministic); what's asserted here is the deterministic part IP10
// actually added: clicking the button lands HR directly on a pre-filled
// concern form rather than the triage queue.
test('Create New Concern from a read email pre-fills and opens the concern form', async ({ page }) => {
  test.setTimeout(60000); // one real Claude call

  await login(page);
  await page.locator('aside, header').getByRole('button', { name: 'Save email to case', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Save email to case' })).toBeVisible({ timeout: 10000 });

  await page.getByPlaceholder(/From: manager@company.com/).fill(
    `From: linemanager@company.com\n` +
    `Subject: Concern about a conduct issue\n` +
    `Date: 12/08/2026\n\n` +
    `Hi HR,\n\nI wanted to flag some concerning behaviour I've observed from a team member recently. ` +
    `Can we discuss what the next steps should be?\n\nThanks.`
  );
  await page.getByRole('button', { name: 'Read this email' }).click();
  await expect(page.getByText('Reading the email…')).toBeVisible();
  await expect(page.getByText('Compass read this email as')).toBeVisible({ timeout: 30000 });

  await page.getByRole('button', { name: 'Create New Concern' }).click();

  await expect(page.getByText("Tell us what's happened")).toBeVisible({ timeout: 10000 });
  const descriptionField = page.getByPlaceholder('What happened? When? Who else was involved or witnessed it?');
  await expect(descriptionField).not.toHaveValue('');
  await expect(descriptionField).toHaveValue(/Original email:/);
});
