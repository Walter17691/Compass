import { test, expect } from '@playwright/test';
import { login, openNewCaseModal, openCreateMenu, startMeeting, openCaseSection } from './helpers.js';

// E2E Navigation Alignment pass — the earlier IA & User Journey pass (§7,
// §11) moved global meeting/case creation behind one universal "Create"
// control and moved secondary Case Workspace destinations behind a
// "More" popover. Dozens of specs drive straight through both without
// ever proving the menus themselves are actually discoverable and
// correctly populated — this is that proof, kept separate from the
// destination-behaviour specs so a broken menu can never hide behind
// helpers that quietly work around it.
test.describe('Create menu is discoverable and offers every creation action', () => {
  test('Create is visible, opens on click, and lists every global creation action', async ({ page }) => {
    await login(page);

    const createBtn = page.getByRole('button', { name: 'Create', exact: true });
    await expect(createBtn).toBeVisible();
    await expect(createBtn).toHaveAttribute('aria-expanded', 'false');

    await createBtn.click();
    await expect(createBtn).toHaveAttribute('aria-expanded', 'true');
    const menu = page.getByRole('menu', { name: 'Create' });
    await expect(menu).toBeVisible();

    for (const label of ['New case', 'Start a meeting', 'Raise a concern', 'New task', 'Add email to a case']) {
      await expect(menu.getByRole('button', { name: label, exact: true })).toBeVisible();
    }

    // Escape closes it without choosing anything — same dismissal shape
    // as every other popover this app uses.
    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible();
  });

  test('selecting "Start a meeting" reaches the meeting-setup screen', async ({ page }) => {
    await login(page);
    await startMeeting(page);
    await expect(page.getByPlaceholder('e.g. Sarah Johnson')).toBeVisible();
  });

  test('selecting "New case" opens the case-creation dialog', async ({ page }) => {
    await login(page);
    await openNewCaseModal(page);
    await expect(page.getByPlaceholder('Full name')).toBeVisible();
  });

  // A case adds a case-scoped group ahead of the global items (CreateMenu.jsx's
  // isInCase branch) — proving that group appears, and disappears again once
  // back outside a case, is what actually protects against the two groups
  // silently merging or a stale case-scoped item lingering on Home.
  test('inside a case, Create additionally offers case-scoped actions ahead of the global ones', async ({ page }) => {
    const employeeName = `E2E NavMenus ${Date.now()}`;
    await login(page);
    await openNewCaseModal(page);
    await page.getByPlaceholder('Full name').fill(employeeName);
    await page.getByRole('button', { name: 'Create case' }).click();
    await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

    await openCreateMenu(page);
    const menu = page.getByRole('menu', { name: 'Create' });
    await expect(menu.getByRole('button', { name: 'Start meeting for this case', exact: true })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Add evidence', exact: true })).toBeVisible();
    await expect(menu.getByRole('button', { name: 'Add task', exact: true })).toBeVisible();
    // The global items are still present alongside the case-scoped ones.
    await expect(menu.getByRole('button', { name: 'New case', exact: true })).toBeVisible();
    await page.keyboard.press('Escape');

    await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
    await openCreateMenu(page);
    await expect(page.getByRole('menu', { name: 'Create' }).getByRole('button', { name: 'Start meeting for this case', exact: true })).not.toBeVisible();
  });
});

test.describe('Case Workspace "More" menu is discoverable and reaches every secondary section', () => {
  async function openFreshCase(page, employeeName) {
    await login(page);
    await openNewCaseModal(page);
    await page.getByPlaceholder('Full name').fill(employeeName);
    await page.getByRole('button', { name: 'Create case' }).click();
    await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  }

  test('More is visible alongside the three permanent tabs, opens on click, and lists every secondary section grouped', async ({ page }) => {
    await openFreshCase(page, `E2E MoreMenu ${Date.now()}`);

    // The three tabs the IA pass kept permanently visible.
    for (const label of ['Overview', 'Timeline', 'Evidence']) {
      await expect(page.getByRole('button', { name: label, exact: true })).toBeVisible();
    }

    const moreBtn = page.getByRole('button', { name: 'More', exact: true });
    await expect(moreBtn).toBeVisible();
    await expect(moreBtn).toHaveAttribute('aria-expanded', 'false');
    await moreBtn.click();
    await expect(moreBtn).toHaveAttribute('aria-expanded', 'true');

    const menu = page.getByRole('menu', { name: 'More case tabs' });
    await expect(menu).toBeVisible();
    // Grouped exactly as CaseViewScreen.jsx's own TAB_GROUPS partitions
    // them (Case/Work/Decision) — every secondary section, none missing.
    await expect(menu.getByText('Work', { exact: true })).toBeVisible();
    await expect(menu.getByText('Decision', { exact: true })).toBeVisible();
    for (const label of ['Allegations', 'Meetings', 'Participants', 'Tasks', 'Documents', 'Communications', 'Themes', 'Outcome', 'AI Assistant']) {
      await expect(menu.getByRole('button', { name: label, exact: true })).toBeVisible();
    }

    await page.keyboard.press('Escape');
    await expect(menu).not.toBeVisible();
  });

  test('selecting a secondary section navigates to it and the toggle itself reflects the new active location', async ({ page }) => {
    await openFreshCase(page, `E2E MoreMenu ${Date.now()}`);

    await openCaseSection(page, 'Allegations');
    // The section's own content proves the navigation actually landed,
    // not just that a click happened.
    await expect(page.getByText('Allegations (0)')).toBeVisible({ timeout: 10000 });
    // The toggle that used to read "More" now shows the active section's
    // own label — the same "you are here" signal the three permanent
    // tabs give via their own selected styling — so the current location
    // stays understandable even though the control that reached it no
    // longer says "More".
    await expect(page.getByRole('button', { name: 'Allegations', exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'More', exact: true })).not.toBeVisible();

    // And it's reachable again for a second section from that new state —
    // openCaseMore locates the toggle by position, not by its transient name.
    await openCaseSection(page, 'Documents');
    await expect(page.getByText('No letters or files on this case yet.')).toBeVisible({ timeout: 10000 });
    await expect(page.getByRole('button', { name: 'Documents', exact: true })).toBeVisible();
  });

  test('a permanent tab remains reachable and correctly becomes active after visiting a More section', async ({ page }) => {
    await openFreshCase(page, `E2E MoreMenu ${Date.now()}`);
    await openCaseSection(page, 'Allegations');
    await expect(page.getByText('Allegations (0)')).toBeVisible({ timeout: 10000 });

    await page.getByRole('button', { name: 'Timeline', exact: true }).click();
    await expect(page.getByText('Case opened', { exact: false })).toBeVisible({ timeout: 10000 });
    // Once back on a permanent tab, the toggle reads "More" again — it
    // never gets stuck showing a section that's no longer active.
    await expect(page.getByRole('button', { name: 'More', exact: true })).toBeVisible();
  });
});
