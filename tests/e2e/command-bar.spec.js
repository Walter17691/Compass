import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Integrations & Workflow Automation (Phase 5, IP6, §25) — Command Bar.
// Scoped to the deterministic structural path only, same reasoning as
// case-golden-path.spec.js's own comment: submitting an instruction
// makes a real Claude API call (resolveCommandBarPlan's AI-parsing step)
// with non-deterministic output, which isn't a good fit for a
// deterministic E2E assertion — that logic is covered by
// commandBar.test.js (pure resolution) and CommandBarModal.test.jsx
// (rendering a given plan) instead. What IS reliably testable end-to-end
// is that the palette actually opens/closes from both real entry points
// a user has (the sidebar button and the Cmd/Ctrl+K shortcut).
test('the Command Bar opens from the sidebar button and the keyboard shortcut, and closes', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: 'Command Bar' }).click();
  const commandInput = page.getByLabel('Command Bar instruction');
  await expect(commandInput).toBeVisible({ timeout: 10000 });
  await expect(commandInput).toBeFocused();

  await page.getByLabel('Close').click();
  await expect(commandInput).not.toBeVisible();

  await page.keyboard.press('Control+k');
  await expect(commandInput).toBeVisible({ timeout: 10000 });
  await page.keyboard.press('Escape');
  await expect(commandInput).not.toBeVisible();
});
