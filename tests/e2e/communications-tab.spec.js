import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Integrations & Workflow Automation (Phase 5, IP31, §28) — the unified
// Communications tab. Deliberately scoped to a held meeting only, not
// the full email/letter/signature picture — /api/signing (needed to
// exercise the signature-status badge) isn't proxied by the local Vite
// dev server (only /api/chat is, see vite.config.js/playwright.config.js),
// and this session's changes aren't deployed, so a real signed/sent
// entry isn't reachable locally the same way signature-sync.spec.js's
// own file comment already documents for the meeting-signing flow
// itself. A meeting record needs only ordinary cases/meetings writes
// (the Supabase client library, not an API route), so that much is
// fully achievable — and proves the new tab, its Meeting badge, and its
// "Open source" wiring against a real case.
test('a held meeting appears on the Communications tab and "Open source" opens it on the Meetings tab', async ({ page }) => {
  test.setTimeout(60000); // one real Claude call to generate the meeting record (Review screen), same as signature-sync.spec.js
  const employeeName = `E2E Communications ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: 'Start meeting' }).click();
  await page.getByText('Informal / 1-1', { exact: true }).click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  await page.getByPlaceholder(/Type or speak your meeting notes here/).waitFor({ timeout: 10000 });
  await page.getByPlaceholder(/Type or speak your meeting notes here/).fill(
    'HR: Quick catch-up on how things are going.\nEmployee: All fine, thanks.'
  );
  await page.getByRole('button', { name: 'End meeting' }).click();
  // The Review screen generates the meeting record via a real Claude call
  // before saveMeetingToCase's record field has anything in it — waiting
  // for "Send for signature" (without clicking it) is the same readiness
  // signal signature-sync.spec.js already uses for "the record exists now".
  await page.getByRole('button', { name: 'Send for signature' }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /Save and go to case/ }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 15000 });

  const caseTabBar = page.locator('div')
    .filter({ has: page.getByRole('button', { name: 'Overview', exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Documents', exact: true }) })
    .last();

  await caseTabBar.getByRole('button', { name: 'Communications', exact: true }).click();
  await expect(page.getByText(/^Communications \(\d+\)$/)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Meeting', { exact: true })).toBeVisible();
  await expect(page.getByText(/^Informal \/ 1-1 held$/)).toBeVisible();

  await page.getByRole('button', { name: 'Open source' }).click();
  // Informal/1-1 meetings don't map to the Investigation/Disciplinary/
  // Appeal stage tabs — they land under "Other" (same as
  // signature-sync.spec.js's own equivalent step).
  await expect(caseTabBar.getByRole('button', { name: 'Meetings', exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /^Other/ }).click();
  await expect(page.getByText('Informal / 1-1').first()).toBeVisible({ timeout: 10000 });
});
