import { test, expect } from '@playwright/test';
import { login, startMeeting } from './helpers.js';

// Phase 10 of the reasoning-layer build-out (meeting intelligence). Fires
// on the same throttled cadence updateLiveContext already uses (every
// 3rd utterance) — no new polling infrastructure, an extra AI call
// alongside the existing one. Live-verified separately for the
// inconsistency-nudge wording constraint; this proves the panels render
// with real content once enough transcript exists, and don't appear
// before that threshold.
test('Live meeting intelligence panels populate after enough transcript is captured', async ({ page }) => {
  test.setTimeout(60000); // one real Claude call, fired at the 3rd utterance
  const employeeName = `E2E MeetingIntel ${Date.now()}`;

  await login(page);
  await startMeeting(page);
  await page.getByRole('button', { name: /^Investigation/ }).click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  const notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });

  // Not yet visible — needs three utterances before the throttled check fires.
  await expect(page.getByText('Meeting intelligence', { exact: true })).not.toBeVisible();

  await notepad.fill('HR: Can you describe what happened on the day of the incident?\n');
  await notepad.fill('Employee: I was asked by my manager Dave to cover the evening shift at short notice.\n');
  await notepad.fill('HR: Thank you, that timing is useful context for the investigation.\n');

  await expect(page.getByText('Meeting intelligence', { exact: true })).toBeVisible({ timeout: 30000 });
});
