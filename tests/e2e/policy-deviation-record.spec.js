import { test, expect } from '@playwright/test';
import { login, openNewCaseModal, startMeeting, openCaseSection } from './helpers.js';

// Process Intelligence Phase 3 (P7) — proceeding past a guardrail signal
// that carries a real policy citation (P6) now routes through
// requestPolicyDeviationReason instead of the plain override prompt: a
// richer two-field form (what will actually happen + why) instead of one
// free-text reason, recorded as a stable, consistently-templated audit
// entry ("Policy expectation: ... — Actual: ... — Reason: ...") under a
// fixed action label, so it's genuinely distinguishable from an ordinary
// override — not just a longer free-text note. That audit entry surfaces
// on the case's own Timeline tab (caseTimeline.js already merges
// auditLog scoped to the case), same as P1's plain override entries did.
test('proceeding past a policy-cited guardrail records a structured policy deviation on the case timeline', async ({ page }) => {
  test.setTimeout(90000); // one real meeting-record generation

  await login(page);
  const policyFileName = `E2E DeviationPolicy ${Date.now()}`;
  await page.getByRole('button', { name: 'Organisation', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Policies', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Company policies' })).toBeVisible({ timeout: 10000 });
  await page.locator('input[type="file"]').setInputFiles({
    name: `${policyFileName}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from('Disciplinary Policy\n\nEmployees must be given a fair opportunity to respond to each allegation before any finding is reached.'),
  });
  await expect(page.getByLabel(`Category for ${policyFileName}`)).toBeVisible({ timeout: 45000 });

  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  const employeeName = `E2E PolicyDeviation ${Date.now()}`;
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await openCaseSection(page, 'Allegations');
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Unauthorised absence');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (1)')).toBeVisible();

  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  await startMeeting(page);
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: /^Investigation/ }).click();
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  const notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });
  await notepad.fill('HR: We are looking into the unauthorised absence on 5 August.\n');
  await notepad.fill('Employee: I understand.\n');
  await page.getByRole('button', { name: 'End meeting' }).click();

  const qualityModal = page.getByRole('dialog').filter({ hasText: 'Meeting Quality Check' });
  const gotQualityCheck = await qualityModal.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
  if (gotQualityCheck) {
    await page.getByRole('button', { name: 'Proceed anyway' }).click();
    await page.getByRole('dialog', { name: 'Proceed anyway?' }).getByRole('button', { name: 'Proceed', exact: true }).click();
  }
  await expect(page.getByText('Compass HR Advisor', { exact: true })).toBeVisible({ timeout: 90000 });
  await page.getByRole('button', { name: 'Save and go to case →' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await expect(page.getByText('Procedural guardrails', { exact: true })).toBeVisible({ timeout: 10000 });
  // Phase 6.5 hardening (production regression suite) — two real bugs
  // fixed here: (1) the title is "Allegations have..." (plural, stable),
  // not "An allegation has..." (singular) — guardrails.js's own P1 fix
  // stabilised this title so syncGuardrailSignals' exact-title dedup
  // wouldn't re-spawn the signal as "new" every time the count of
  // unaddressed allegations changed, and this test's expected text had
  // gone stale against that rename. (2) a plain getByText+ancestor-count
  // walk resolves against every ancestor whose own aggregate text also
  // happens to contain the string (e.g. Case Risk Panel's duplicate of
  // this same signal elsewhere on the page, per guardrail-actions.spec.js's
  // own comment on the identical signal) — scoping by the signal's own
  // "Proceed anyway" button (only GuardrailsPanel's cards have one) is
  // the robust match, same pattern already proven there.
  const signalCard = page.locator('div').filter({ hasText: 'Allegations have no recorded employee response' }).filter({ has: page.getByRole('button', { name: 'Proceed anyway' }) }).last();
  await expect(signalCard).toBeVisible({ timeout: 10000 });

  await signalCard.getByRole('button', { name: 'Proceed anyway' }).click();
  const deviationPrompt = page.getByRole('dialog', { name: 'Record a policy deviation' });
  await expect(deviationPrompt).toBeVisible({ timeout: 5000 });
  // The richer two-field form — distinct from the plain single-reason
  // override prompt everywhere else in the app. .last() — the prompt's
  // own message prose also ends with this phrase ("...and why?").
  await expect(deviationPrompt.getByText('What will actually happen', { exact: false }).last()).toBeVisible();
  await expect(deviationPrompt.getByText('Reason (optional)')).toBeVisible();
  await expect(deviationPrompt.getByText(policyFileName, { exact: false })).toBeVisible();

  const actualText = 'Response will be taken at the disciplinary hearing itself';
  const reasonText = 'Employee was unavailable for a separate response meeting before the hearing';
  await deviationPrompt.getByLabel('What will actually happen').fill(actualText);
  await deviationPrompt.getByLabel('Reason (optional)').fill(reasonText);
  await deviationPrompt.getByRole('button', { name: 'Record and proceed', exact: true }).click();
  await expect(deviationPrompt).not.toBeVisible();
  await expect(page.getByText('Allegations have no recorded employee response')).not.toBeVisible({ timeout: 10000 });

  // caseTimeline.js renders audit entries as one combined string
  // ("{action} — {detail}"), so the action label isn't its own standalone
  // text node — check the whole templated entry together instead.
  await page.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.getByText(/Policy deviation recorded/)).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/Policy expectation:.*fair opportunity to respond/)).toBeVisible();
  await expect(page.getByText(new RegExp(actualText))).toBeVisible();
  await expect(page.getByText(new RegExp(reasonText))).toBeVisible();
});
