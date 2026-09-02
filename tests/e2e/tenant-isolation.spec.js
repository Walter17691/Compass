import { test, expect } from '@playwright/test';
import { login, openNewCaseModal, logout, SECOND_TENANT_CREDS, hasSecondTenant, requireSecondTenantOrFail, currentAccessToken, deleteCaseByEmployeeName } from './helpers.js';

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
// Phase 6.5 hardening (structural remediation, Prompt 12 — Test
// Infrastructure invariant) — this used to be a plain test.skip(),
// meaning CI could report green while never once actually running the
// one spec that proves tenant isolation, if the second-tenant secrets
// were never wired into the workflow (they weren't — see
// requireSecondTenantOrFail's own comment in helpers.js). In CI, a
// missing second tenant is now a hard failure that says exactly what to
// fix; a contributor's local machine without one configured still gets
// the softer skip below, same as before.
requireSecondTenantOrFail();
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

// E2E Navigation Alignment pass — OrgSwitcher.jsx no longer exists as a
// separate component (confirmed: no such file in src/ any more) and
// there is no standalone "Switch organisation" trigger. The "Sidebar
// footer composition pass" folded org-switching into the same Account
// menu Sign out/Settings already live in (AppSidebar.jsx): the entire
// account row (avatar, name, org, chevron) is one button with the fixed
// accessible name "Account menu" — the org name is just its own visible
// sub-text, not part of that name — and its popover is role="menu"
// aria-label="Account" (not "Organisations"), listing every available
// org as a plain button alongside "+ Join another organisation",
// "Settings" and "Sign out" (src/test/AppSidebar.test.jsx's own "account
// menu" describe block documents this exact shape). No "▾" marker is
// appended to anything any more, so no stripping is needed either — just
// reading the org name from its own title-bearing sub-element (the
// second title="..." div in the trigger; the first is the user's name).

test('a case created in one org is invisible to a genuinely different tenant', async ({ page }) => {
  const canaryName = `Isolation Canary ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(canaryName);
  await page.getByRole('combobox').nth(2).selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case', exact: true }).click();
  await expect(page.getByText(canaryName)).toBeVisible({ timeout: 10000 });

  // Captured before logging out — the primary org's own token, used to
  // clean this canary up at the end regardless of which account the
  // browser session has since switched to.
  const primaryToken = await currentAccessToken(page);

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

  await deleteCaseByEmployeeName(page, primaryToken, canaryName);
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
  // Phase 7 (Controlled Beta Infrastructure Gate 3) fix — this used to be
  // a page-wide getByText(/Couldn't load.*\bcases\b/) regex, which
  // Playwright matches against a container element's FULL flattened text,
  // not one coherent banner string. Against the old shared production
  // test org (2,700+ accumulated real cases) the Cases screen always
  // rendered real case rows, so the word "cases" never coincidentally
  // appeared near the separate, already-expected "Couldn't load portal
  // accounts" banner (still real and still benign here — /api/portal/*
  // isn't proxied by the local dev server). A fresh, genuinely empty org
  // on the new dedicated compass-e2e-test project renders "No cases
  // yet... Create a case... Create first case" instead — which sits in
  // the same DOM subtree as that unrelated portal banner, so the old
  // regex spuriously matched across both and never actually inspected
  // the real load-issue banner (AppSidebar.jsx's own role="status"
  // element) at all. Scoping to that element, and to the literal word
  // "cases" within it specifically (not just any "Couldn't load"
  // banner — "portal accounts" is expected to fail here), is both the
  // correct fix and a stronger check than the original.
  const loadIssueBanner = page.getByRole('status').filter({ hasText: /\bcases\b/i });
  await expect(loadIssueBanner).not.toBeVisible();
});

test('the org switcher lists exactly this account\'s own two real memberships, and switching between them updates the active org — including a rapid A→B→A round trip', async ({ page }) => {
  await login(page, SECOND_TENANT_CREDS);
  const switcherButton = page.getByRole('button', { name: 'Account menu' });
  // The trigger's own org sub-text (second title-bearing div — the first
  // is the user's name) reflects the active org without opening anything.
  const orgAName = (await switcherButton.locator('div[title]').last().textContent()).trim();

  await switcherButton.click();
  const menu = page.getByRole('menu', { name: 'Account' });
  await expect(menu).toBeVisible();
  const orgButtons = menu.getByRole('button').filter({ hasNotText: /Join another organisation|Settings|Sign out/ });
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
    await page.getByRole('menu', { name: 'Account' }).getByRole('button', { name: target, exact: true }).click();
  }
  // Three toggles starting from B lands on: A, B, A.
  await expect(switcherButton).toContainText(orgAName, { timeout: 10000 });

  // The final settled state is genuinely consistent, not a stale
  // half-switched UI — reopening the menu shows the same org checked.
  await switcherButton.click();
  const menuAgain = page.getByRole('menu', { name: 'Account' });
  await expect(menuAgain).toBeVisible();
  await expect(menuAgain.getByRole('button', { name: orgAName, exact: true })).toHaveText(new RegExp(`^${orgAName}`));
  await page.keyboard.press('Escape');
});

test('org data is namespaced in localStorage by the currently active org, not left globally keyed', async ({ page }) => {
  // Was KNOWN FAILING 2026-08-26 through 2026-08-27 (Prompt 14, Section
  // 9) — the shared SECOND_TENANT_CREDS org has accumulated 2,700+ real
  // cases from years of every E2E spec in this suite running against it
  // without cleanup, which genuinely exceeded the browser's localStorage
  // quota, so the compass_cases write this test polls for failed on
  // every single save. Root-caused and fixed rather than bulk-cleaning
  // or replacing the fixture org (src/lib/storage.js's capRecentForCache,
  // used by App.jsx's saveCases): the cache mirror now keeps only the
  // 500 most-recently-updated cases, which is what the cache's own
  // purpose (fast initial paint before the real Supabase fetch replaces
  // it) needs anyway, not full fidelity. Live-verified against this
  // exact fixture org before this fix landed — a fresh case genuinely
  // wasn't being cached because of quota exhaustion — and again after,
  // confirming the same org's write now succeeds and includes the new
  // case. (First cap attempt treated a case with no updatedAt yet — the
  // shape of any case on its very first local save, before the Supabase
  // round-trip returns one — as oldest and dropped it first, which is
  // backwards: it's always the newest thing on screen. Fixed to treat a
  // missing updatedAt as newest instead.)
  test.setTimeout(60000);
  const canaryName = `Isolation Storage Canary ${Date.now()}`;
  await login(page, SECOND_TENANT_CREDS);

  // compass_cases is only written to localStorage on an actual save
  // (App.jsx's saveCases → orgLsSet), not eagerly on every login — a
  // freshly-authenticated session with no activity yet genuinely has no
  // cache key at all. Creating a real case is what any user does that
  // triggers this write, so it's also the only way to test it honestly.
  await openNewCaseModal(page);
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

  const secondTenantToken = await currentAccessToken(page);
  await deleteCaseByEmployeeName(page, secondTenantToken, canaryName);
});
