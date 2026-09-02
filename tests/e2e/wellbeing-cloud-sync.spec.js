import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Wellbeing notes previously lived only in localStorage (App.jsx used
// useState(ls("compass_wellbeing", [])) with no Supabase sync at all),
// despite the screen calling itself "confidential... restricted to HR
// only" — implying a shared org record the way cases/onboarding/offboarding
// are. A second HR user, or the same one on a different device, would see
// none of it. This proves the fix: wiping just the local wellbeing cache
// (simulating a different device/browser that never had it) must NOT lose
// the note — it now has to come back from wellbeing_notes in Supabase.
test('a wellbeing note survives clearing localStorage, proving it is cloud-synced not local-only', async ({ page }) => {
  const employeeName = `E2E Wellbeing ${Date.now()}`;

  await login(page);
  // Wellbeing lives inside the "HR Processes" sidebar group, which now
  // starts collapsed (Home Composition Review, final refinement item 3).
  await page.getByRole('button', { name: 'HR Processes' }).click();
  await page.getByRole('button', { name: 'Wellbeing', exact: true }).click();
  await expect(page.getByText('Mental health & wellbeing')).toBeVisible();

  await page.getByRole('button', { name: '+ Add note' }).click();
  await page.getByPlaceholder('e.g. James Wilson').fill(employeeName);
  await page.getByPlaceholder(/What was discussed/).fill('E2E test wellbeing conversation notes.');
  // saveWellbeingNoteToDB is fire-and-forget (same pattern as every other
  // cloud-synced entity in this app — cases, starter/leaver instances):
  // the UI updates from local state immediately, and the Supabase write
  // happens in the background. Wait for that write to actually land before
  // reloading, or the reload aborts the in-flight request.
  const saveResponse = page.waitForResponse(r => r.url().includes('/rest/v1/wellbeing_notes') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Save note' }).click();
  await expect(page.getByText('E2E test wellbeing conversation notes.')).toBeVisible({ timeout: 10000 });
  await saveResponse;

  // Simulate a different device: wipe only the local wellbeing cache, not
  // the whole of localStorage — that also holds the Supabase auth session,
  // and clearing it would just log the test out rather than test anything
  // about wellbeing notes specifically.
  await page.evaluate(() => localStorage.removeItem('compass_wellbeing'));
  await page.reload();

  // E2E Navigation Alignment pass — the reload lands back on the same
  // Wellbeing URL (App.jsx's readNavFromUrl/pushState keep screen and URL
  // in sync), and AppSidebar's own expandedGroups effect auto-re-expands
  // whichever group owns the current screen on every mount — so "HR
  // Processes" is already open here, not collapsed. Clicking it again
  // would toggle it shut (evidenced: this line reproducibly timed out
  // waiting for "Wellbeing" once the group had just been closed by this
  // exact click).
  await page.getByRole('button', { name: 'Wellbeing', exact: true }).click();
  await page.getByText(employeeName, { exact: true }).click();
  await expect(page.getByText('E2E test wellbeing conversation notes.')).toBeVisible({ timeout: 10000 });
});
