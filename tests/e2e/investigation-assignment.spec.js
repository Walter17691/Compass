import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Manager Enablement (Phase 4, MP7, §7) — assignInvestigator used to just
// grant case_access with nothing else attached. AssignInvestigatorModal
// replaces the old plain <select> with real scope: which allegations to
// investigate (a subset, not implicitly "all"), a target completion date,
// and a short note. The E2E test org has only one real member (the HR
// test account itself, "Test Compass" — same documented constraint as
// case-roles.spec.js), so this assigns the HR account to itself; the
// investigator's OWN restricted view of that scope (InvestigatorChecklistView)
// only ever renders for a distinct non-HR identity this harness can't
// produce, and is covered instead by InvestigatorChecklistView.test.jsx.
test('assigning an investigator with a narrowed scope and a due date is reflected immediately', async ({ page }) => {
  const employeeName = `E2E InvAssign ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Allegations', exact: true }).click();
  await expect(page.getByText('Allegations (0)')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Left site without authorisation');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (1)')).toBeVisible();

  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Falsified an expenses claim');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (2)')).toBeVisible();

  // Phase 2A — "Assign investigator..." moved into the header's "More
  // actions" menu; the primary button is occupied by the real next-step
  // recommendation instead.
  await page.getByRole('button', { name: /More actions/ }).click();
  await page.getByRole('menuitem', { name: 'Assign investigator...' }).click();
  await expect(page.getByText('Which allegations should they investigate?')).toBeVisible({ timeout: 10000 });
  // Both default to checked — narrow the scope to just one.
  await expect(page.getByRole('checkbox', { name: /Left site without authorisation/ })).toBeChecked();
  await expect(page.getByRole('checkbox', { name: /Falsified an expenses claim/ })).toBeChecked();
  await page.getByRole('checkbox', { name: /Falsified an expenses claim/ }).uncheck();

  await page.locator('input[type="date"]').fill('2026-09-01');
  await page.getByPlaceholder('Anything specific they should focus on or avoid').fill('Start with the CCTV log.');

  const accessSaved = page.waitForResponse(r => r.url().includes('/rest/v1/case_access') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Assign investigator', exact: true }).click();
  await accessSaved;

  // Phase 2A — the assigned-investigator label now lives inside "More
  // actions" (dynamic label: "Investigator: {name}"), not a top-level
  // button.
  //
  // Pre-existing drift found while verifying this fix (unrelated to
  // Phase 2A): the shared E2E test org's HR account display name is now
  // "E2E Test User", not "Test Compass" — confirmed live via a snapshot
  // at failure time, and reproduced identically running this spec's
  // original pre-Phase-2A assertion text against HEAD. Updated both
  // strings here to the account's real current name so this spec
  // actually verifies something again.
  await page.getByRole('button', { name: /More actions/ }).click();
  await expect(page.getByRole('menuitem', { name: 'Investigator: E2E Test User' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: /More actions/ }).click(); // toggle closed
  await expect(page.getByText(/Investigation by E2E Test User: 0 of \d+ steps complete · Due 01\/09\/2026/)).toBeVisible();
});
