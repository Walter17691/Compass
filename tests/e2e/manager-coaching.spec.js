import { test, expect } from '@playwright/test';
import { login, startMeeting } from './helpers.js';

// Manager Enablement (Phase 4, MP14, §10/§11) — coaching tips. Two of
// the three triggers (wellbeing, outcome-language) are plain keyword
// checks over the live transcript, computed synchronously in
// RecordScreen with no AI call and no network wait — deliberately kept
// fast here rather than folded into one of the existing, already very
// heavy AI-pipeline E2E specs (meeting-intelligence-e2e.spec.js). The
// third trigger (an AI-detected possibleInconsistency) reuses
// meetingIntelligence, which those specs already exercise and assert on
// via "Possible clarification required" — not re-tested here.
test('wellbeing and outcome-language mentions surface a dismissible coaching tip, with no AI wait', async ({ page }) => {
  const employeeName = `E2E Coaching ${Date.now()}`;

  await login(page);
  await startMeeting(page);
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: /^Investigation/ }).click();
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  const notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });

  await expect(page.getByText('Helpful reminder')).not.toBeVisible();

  await notepad.fill('Employee: I have been signed off with stress for the past two weeks.');
  await expect(page.getByText('Helpful reminder')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText(/occupational health referral or wellbeing support/)).toBeVisible();

  // Phase 6.5 hardening (production regression suite) — a bare, global
  // "Dismiss" match also catches App.jsx's own load-issue banner ("×",
  // aria-label="Dismiss"), unconditionally present on every local E2E run
  // (loadPortalAccounts always fails locally — /api/portal isn't proxied
  // by the dev server). Scoped to this tip's own container (.last() picks
  // the innermost div matching both texts, not an outer wrapper that also
  // happens to contain them) so the click always hits the coaching tip's
  // own Dismiss button, never the unrelated global banner's.
  const wellbeingTip = page.locator('div').filter({ hasText: 'Helpful reminder' }).filter({ hasText: /occupational health referral/ }).last();
  await wellbeingTip.getByRole('button', { name: 'Dismiss', exact: true }).click();
  await expect(page.getByText(/occupational health referral/)).not.toBeVisible();

  await notepad.fill("Employee: I have been signed off with stress for the past two weeks. HR: We've already decided this is gross misconduct.");
  await expect(page.getByText(/language that suggests the outcome is already decided/)).toBeVisible({ timeout: 5000 });
  // The wellbeing tip stays dismissed even though the trigger text is
  // still present — dismissal is per-key, not re-evaluated from scratch.
  await expect(page.getByText(/occupational health referral/)).not.toBeVisible();
});
