import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// This is the exact bug caught manually earlier this session: due_date
// was coming out one day short because of a UTC/local timezone mismatch
// in how the date was serialized before storage (src/lib/dates.js,
// toISODateLocal). A fixed, far-past received date keeps this assertion
// deterministic regardless of what day the test actually runs on.
test('DSAR due date is exactly receivedDate + 1 calendar month', async ({ page }) => {
  const employeeName = `E2E DSAR ${Date.now()}`;

  await login(page);
  // DSAR lives inside the "HR Processes" dropdown, not a top-level nav
  // button — open the dropdown first, then click the menu item.
  await page.getByRole('button', { name: 'HR Processes' }).click();
  await page.getByRole('menuitem', { name: 'DSAR', exact: true }).click();
  await page.getByRole('button', { name: '+ Log new request' }).click();

  await page.getByPlaceholder('e.g. Ada Lovelace').fill(employeeName);
  await page.locator('input[type="date"]').fill('2020-01-15');
  await page.getByRole('button', { name: 'Log request' }).click();

  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Due 2020-02-15').first()).toBeVisible();

  // Every run of this test creates a request permanently dated 2020, i.e.
  // permanently overdue — with no cleanup, each run left one more stuck
  // in the "Overdue actions" banner on every screen forever (41 had
  // accumulated in this test org before this line was added). The UI only
  // allows selecting "Completed" once the flagged-sections review has been
  // done (DsarScreen.jsx filters that option out until
  // reviewedFlaggedSections is true), so this goes through that flow
  // rather than shortcutting straight to the status dropdown.
  const card = page.locator('div')
    .filter({ has: page.getByText(employeeName, { exact: true }) })
    .filter({ has: page.locator('select') })
    .last();
  await card.getByRole('button', { name: 'Compile data' }).click();
  // Re-locating after the click rather than reusing `card` — compiling
  // replaces the card's content (adds the review checkbox), and Playwright
  // needs a fresh query against that new DOM rather than a stale handle.
  // Only one request is ever mid-review at a time in this test, so the
  // review-checkbox label text alone is enough to find it.
  // .check() fails outright if the checked state doesn't stick on the first
  // click — but the change handler round-trips through Supabase
  // (updateDsarRequest) before the checkbox's real state settles, so a
  // plain click plus a tolerant follow-up assertion is more reliable here.
  const reviewCheckbox = page.getByText('I have reviewed the flagged sections', { exact: false }).locator('input[type="checkbox"]');
  await reviewCheckbox.click();
  await expect(reviewCheckbox).toBeChecked({ timeout: 10000 });
  await card.locator('select').selectOption('completed');
});
