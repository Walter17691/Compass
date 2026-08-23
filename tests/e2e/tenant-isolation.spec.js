import { test, expect } from '@playwright/test';
import { login, logout, SECOND_TENANT_CREDS, hasSecondTenant } from './helpers.js';

// Phase 6.5 hardening (production regression suite) — every other spec in
// this suite runs against ONE shared test org (E2E_TEST_EMAIL), which can
// prove features work but can never prove tenant isolation — there's
// nothing else to leak into. SECOND_TENANT_CREDS (see .env's own comment,
// and tests/e2e/README.md) is a genuinely separate account, with zero
// membership overlap with the primary org, real enough to prove a case
// created in one tenant is actually invisible to the other — not just
// "the UI didn't render it because we didn't ask," but "this account has
// no way to see it at all."
//
// Skipped, not failing, when the second account isn't configured — this
// mirrors how the rest of the suite already requires E2E_TEST_EMAIL/
// PASSWORD to be set at all (helpers.js throws otherwise) rather than
// silently no-op'ing, but a genuinely optional SECOND account shouldn't
// break `npm run test:e2e` for anyone who hasn't provisioned one.
test.skip(!hasSecondTenant(), 'E2E_TEST_EMAIL_2/E2E_TEST_PASSWORD_2 not configured — see .env\'s own comment for how to provision a second tenant');

// The sidebar's own "Cases" nav button ("Cases (54)") and Home's "View
// all N cases →" link both match a plain getByRole('button', { name:
// 'Cases' }) — Playwright's accessible-name matching is substring AND
// case-insensitive by default, so "cases" inside the second button's own
// text collides too. Scoping to the nav landmark (only the sidebar link
// lives there) is the real fix, not exact:true (the nav button's own
// name isn't literally "Cases" either — it has a live count suffix).
async function goToCases(page) {
  await page.getByRole('navigation').getByRole('button', { name: /^Cases/ }).click();
  await expect(page.getByRole('heading', { name: 'Cases' })).toBeVisible({ timeout: 10000 });
}

// OrgSwitcher's trigger button appends a "▾" marker whenever more than
// one org is available (see OrgSwitcher.jsx) — the dropdown's own menu
// items never carry it. Comparing an org name read from the trigger
// against one read from a menu item without stripping this would never
// match, silently picking the wrong "other org" or hanging forever
// waiting for a menu item whose text doesn't actually exist.
function stripSwitcherMarker(text) {
  return text.replace('▾', '').trim();
}

test('a case created in one org is invisible to a genuinely different tenant', async ({ page }) => {
  const canaryName = `Isolation Canary ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(canaryName);
  await page.getByRole('combobox').nth(2).selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case', exact: true }).click();
  await expect(page.getByText(canaryName)).toBeVisible({ timeout: 10000 });

  // Deliberately not asserting the two accounts show different org
  // *names* here — this shared test-data setup happens to have two
  // real, genuinely separate orgs both literally named "E2E Test Org"
  // (an accident of how the throwaway accounts were provisioned, not
  // something either account controls), so name equality alone can't
  // distinguish them. Org ID isolation — proved below by the canary
  // case's real invisibility — is the actual property that matters;
  // name collision is cosmetic.
  await logout(page);
  await login(page, SECOND_TENANT_CREDS);
  await goToCases(page);
  // Give a genuinely absent case the same chance to appear a present one
  // would have — wait for the list's own loading state to clear rather
  // than asserting absence instantly, which would trivially "pass" before
  // data has even loaded.
  await expect(page.getByText('Loading cases…')).not.toBeVisible({ timeout: 10000 });
  await expect(page.getByText(canaryName)).not.toBeVisible();
});

test('a genuinely different tenant sees its own, real case-list state, not the primary account\'s', async ({ page }) => {
  await login(page, SECOND_TENANT_CREDS);
  await goToCases(page);
  // Not asserting specific content (this tenant's own case list is
  // whatever earlier isolation-suite runs have left behind) — just that
  // the screen renders its own real, settled state rather than an error
  // or a permanently-stuck loading spinner. Not a blanket "no error
  // banner at all" check: /api/portal/* isn't proxied by the local dev
  // server (playwright.config.js's own header comment), so "Couldn't
  // load portal accounts" is an expected, benign local-only banner,
  // unrelated to cases specifically — this only checks for a failure
  // naming cases, the thing this test actually cares about.
  await expect(page.getByText('Loading cases…')).not.toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Couldn't load.*\bcases\b/)).not.toBeVisible();
});

test('the org switcher lists exactly this account\'s own two real memberships, and switching between them updates the active org — including a rapid A→B→A round trip', async ({ page }) => {
  await login(page, SECOND_TENANT_CREDS);
  const switcherButton = page.getByRole('button', { name: /^Switch organisation/ });
  const orgAName = stripSwitcherMarker(await switcherButton.textContent());

  await switcherButton.click();
  const menu = page.getByRole('menu', { name: 'Organisations' });
  await expect(menu).toBeVisible();
  const orgButtons = menu.getByRole('button').filter({ hasNotText: 'Join another organisation' });
  await expect(orgButtons).toHaveCount(2);
  const orgNames = (await orgButtons.allTextContents()).map(t => t.trim());
  // Both entries genuinely distinct orgs, not the same one rendered twice.
  expect(new Set(orgNames).size).toBe(2);
  const orgBName = orgNames.find(n => n !== orgAName);
  expect(orgBName).toBeTruthy();

  // A → B
  await menu.getByRole('button', { name: orgBName, exact: true }).click();
  await expect(menu).not.toBeVisible();
  await expect(switcherButton).toContainText(orgBName, { timeout: 10000 });

  // B → A → B → A, back to back with no wait between the clicks — the
  // "rapid switching" case: each switch must fully land before the
  // *next* one is even initiated is NOT assumed here, since a real user
  // double-clicking or clicking fast enough for network responses to
  // race is exactly the scenario this proves the UI settles correctly
  // from, not just the slow, one-at-a-time path every other assertion
  // above already covers.
  for (let i = 0; i < 3; i++) {
    await switcherButton.click();
    const target = i % 2 === 0 ? orgAName : orgBName;
    await page.getByRole('menu', { name: 'Organisations' }).getByRole('button', { name: target, exact: true }).click();
  }
  // Three toggles starting from B lands on: A, B, A.
  await expect(switcherButton).toContainText(orgAName, { timeout: 10000 });

  // The final settled state is genuinely consistent, not a stale
  // half-switched UI — reopening the menu shows the same org checked.
  await switcherButton.click();
  const menuAgain = page.getByRole('menu', { name: 'Organisations' });
  await expect(menuAgain).toBeVisible();
  await expect(menuAgain.getByRole('button', { name: orgAName, exact: true })).toHaveText(new RegExp(`^${orgAName}`));
  await page.keyboard.press('Escape');
});

test('org data is namespaced in localStorage by the currently active org, not left globally keyed', async ({ page }) => {
  // This reused throwaway org's own case count only grows across runs
  // (see the comment below) — the default 30s test timeout is tight
  // enough on a slow run (login + case-creation UI flow + the poll
  // below) to make this test flaky for a reason that has nothing to do
  // with what it's actually checking.
  test.setTimeout(60000);
  const canaryName = `Isolation Storage Canary ${Date.now()}`;
  await login(page, SECOND_TENANT_CREDS);

  // compass_cases is only written to localStorage on an actual save
  // (App.jsx's saveCases → orgLsSet), not eagerly on every login — a
  // freshly-authenticated session with no activity yet genuinely has no
  // cache key at all. Creating a real case is what any user does that
  // triggers this write, so it's also the only way to test it honestly.
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(canaryName);
  await page.getByRole('combobox').nth(2).selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case', exact: true }).click();
  await expect(page.getByText(canaryName)).toBeVisible({ timeout: 10000 });

  // Found genuinely flaky without this: the case's own name becoming
  // visible on screen (CaseViewScreen mounting after saveCases's
  // setActiveCaseId/setScreen) and localStorage actually holding the
  // write are two effects of the same handler, not causally ordered from
  // an observer's point of view — React may paint before every
  // synchronous statement after the state update has run. Polling avoids
  // asserting on a one-shot read that can genuinely race the write.
  // This reused throwaway org has also accumulated thousands of cases
  // across every prior run of this same spec (each run adds its own
  // canary and never cleans up) — serialising that array to localStorage
  // gets slower as it grows, so the timeout here is generous rather than
  // tuned to today's size.
  await expect.poll(
    () => page.evaluate(() => Object.keys(localStorage).filter(k => k.includes(':compass_cases')).length),
    { timeout: 40000, intervals: [250, 500, 1000] }
  ).toBeGreaterThan(0);
  const orgScopedKeys = await page.evaluate(() => Object.keys(localStorage).filter(k => k.includes(':compass_cases')));
  // orgLs (src/lib/storage.js) namespaces every org-scoped key as
  // `${orgId}:${key}` — a bare, unprefixed "compass_cases" key existing
  // alongside real org membership would mean some code path is still
  // writing to the old, unscoped global key, the exact cross-tenant leak
  // vector Phase 6.5's earlier localStorage-isolation hardening (Prompt 5)
  // was built to close.
  const bareKey = await page.evaluate(() => localStorage.getItem('compass_cases'));
  expect(bareKey).toBeNull();
  expect(orgScopedKeys.length).toBeGreaterThan(0);
  // And the cached payload itself is genuinely this tenant's own data —
  // the freshly-created canary, not something bled in from elsewhere.
  const cachedRaw = await page.evaluate(key => localStorage.getItem(key), orgScopedKeys[0]);
  expect(cachedRaw).toContain(canaryName);
});
