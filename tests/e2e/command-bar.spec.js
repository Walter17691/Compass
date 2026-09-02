import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Integrations & Workflow Automation (Phase 5, IP6, §25) — Command Bar.
// Scoped to the deterministic structural path only, same reasoning as
// case-golden-path.spec.js's own comment: submitting an instruction
// makes a real Claude API call (resolveCommandBarPlan's AI-parsing step)
// with non-deterministic output, which isn't a good fit for a
// deterministic E2E assertion — that logic is covered by
// commandBar.test.js (pure resolution) and CommandBarModal.test.jsx
// (rendering a given plan) instead.
//
// E2E Navigation Alignment pass — the IA & User Journey pass (§6/§31,
// already in the frozen baseline) removed the labeled "Command Bar" row
// from the sidebar entirely, since a normal HR user had no reason to
// understand what it was for (AppSidebar.jsx's own comment). The Cmd/
// Ctrl+K shortcut is the ONLY real entry point left — onOpenCommandBar is
// still wired at the App.jsx document-keydown level and needs nothing
// from the sidebar to keep working, but there is no button to click
// anymore. This no longer tests two entry points, just the one that
// still exists.
test('the Command Bar opens from the keyboard shortcut, closes via Escape, and closes via its own Close control', async ({ page }) => {
  await login(page);
  const commandInput = page.getByLabel('Command Bar instruction');

  await page.keyboard.press('Control+k');
  await expect(commandInput).toBeVisible({ timeout: 10000 });
  await expect(commandInput).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(commandInput).not.toBeVisible();

  await page.keyboard.press('Control+k');
  await expect(commandInput).toBeVisible({ timeout: 10000 });
  await page.getByLabel('Close').click();
  await expect(commandInput).not.toBeVisible();
});
