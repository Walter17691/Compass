import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Phase 16 of the reasoning-layer build-out — last of the "process
// intelligence" wave (policy intelligence -> procedural guardrails ->
// deadline engine -> decision workspace). allegations.status already held
// the four findings; this adds the HR decision-maker's own reasoning for
// reaching one, stamped with who/when (supabase/decision_workspace_2026-08-12.sql),
// and reuses Phase 4's guardrail infrastructure for an advisory nudge when
// a finding is recorded with little or no reasoning. Cases without
// allegations keep OutcomeTab's existing flow untouched — not covered here
// since nothing about that path changed.
test('recording a finding stamps who/when decided it, and thin reasoning triggers an advisory nudge that clears once reasoning is added', async ({ page }) => {
  test.setTimeout(60000);
  const employeeName = `E2E Decision ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Allegations', exact: true }).click();
  await expect(page.getByText('Allegations (0)')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Unauthorised absence');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (1)')).toBeVisible();

  // .last() — the Evidence Matrix (rendered above the card list) also has
  // an "Unauthorised absence" cell sharing this text with the allegation
  // card's title; this page only ever shows the one case just navigated
  // to, so both matches are this case's own content, never another case's.
  await page.getByText('Unauthorised absence').last().click();
  // Wait for the status change to actually land — patchAllegation/
  // changeAllegationStatus save fire-and-forget (optimistic local state
  // first, same pattern as every other cloud-synced entity in this app),
  // and the reload just below would otherwise race a save still in flight.
  // Phase 6.5 hardening (production regression suite) — waitForResponse's
  // predicate only checks the URL/method, not the response's own
  // ok/status; a transient failed save (this shared sandbox has shown
  // genuine "TypeError: Failed to fetch" against Supabase) would satisfy
  // this wait just as readily as a real success, then reload into a case
  // whose allegation was silently never actually updated. Asserting .ok()
  // turns that into a clear, fast, honest failure at the point it
  // actually happened instead of a confusing timeout several steps later.
  const statusSaved = page.waitForResponse(r => r.url().includes('/rest/v1/allegations') && ['POST','PATCH'].includes(r.request().method()) && r.ok());
  await page.locator('label:text-is("Status") + select').selectOption('substantiated');
  await statusSaved;

  // The reasoning field only appears once status is a finding — leaving it
  // blank should trigger the guardrail nudge; decided-by/at is stamped in
  // the same save, no separate wait needed.
  const reasoningField = page.getByPlaceholder(/Summarise what the evidence showed/);
  await expect(reasoningField).toBeVisible();
  await expect(page.getByText(/^Decided /)).toBeVisible();

  // Guardrails only sync when a case is opened (App.jsx's useEffect on
  // [screen, activeCaseId]), not live on every keystroke. Reloading is a
  // fresh mount, so it retriggers that effect — and the case view URL
  // (?screen=case_view&case=<id>) round-trips through a reload, unlike
  // navigating through the Cases list, which this shared test org's 200+
  // accumulated cases makes an unreliable way to find this one again.
  await page.reload();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Procedural guardrails', { exact: true })).toBeVisible({ timeout: 10000 });
  // .first() — the same underlying open signal also renders verbatim in
  // this case's "Suggested for this case" and "Case risk" panels (both
  // legitimately surface the same signal, not a duplicate one), so an
  // unscoped getByText matches 3 elements once both those panels exist.
  // The test's own intent is just "the nudge appears somewhere" — any one
  // of the three proves that.
  await expect(page.getByText('A finding was recorded with little or no reasoning').first()).toBeVisible();

  // Add substantive reasoning — the guardrail should clear on the next
  // sync. Not an exact match this time: the tab button now carries a
  // count badge ("Allegations1", no separating space in the accessible
  // name) since there's 1 allegation on the case.
  await page.getByRole('button', { name: /^Allegations/ }).click();
  // .last() — the Evidence Matrix (rendered above the card list) also has
  // an "Unauthorised absence" cell sharing this text with the allegation
  // card's title; this page only ever shows the one case just navigated
  // to, so both matches are this case's own content, never another case's.
  await page.getByText('Unauthorised absence').last().click();
  const reasoningSaved = page.waitForResponse(r => r.url().includes('/rest/v1/allegations') && ['POST','PATCH'].includes(r.request().method()) && r.ok());
  await reasoningField.fill('Swipe-card records and CCTV footage confirm the employee left the site at 14:32 without authorisation or prior agreement from their manager.');
  await reasoningField.blur();
  await reasoningSaved;

  await page.reload();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('A finding was recorded with little or no reasoning')).not.toBeVisible({ timeout: 10000 });
});
