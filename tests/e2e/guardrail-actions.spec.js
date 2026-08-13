import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Process Intelligence Phase 3 (P6) — computeGuardrailChecks gains a new
// check for the spec's own worked example (§2): an allegation moving past
// an investigation meeting with no recorded employee response. Existing
// guardrail signals now also carry a policy-clause citation where one of
// P4's indexed clauses is genuinely relevant (guardrails.js's
// findPolicyClauseRef — a plain keyword search, still no AI call in this
// file), rendered via P4's PolicyCitation. GuardrailsPanel gains the
// spec's "Create action" (creates a real task, same create+accept
// pattern every other signal panel already uses) and "Proceed anyway"
// (P1's requestOverrideReason) actions — previously guardrails only
// offered "Mark resolved"/"Not relevant".
test('an allegation with no recorded employee response is flagged with a policy citation, and can be actioned or overridden', async ({ page }) => {
  test.setTimeout(90000); // one real meeting-record generation

  await login(page);
  const policyFileName = `E2E GuardrailPolicy ${Date.now()}`;
  await page.getByRole('button', { name: /View all policies & templates/ }).click();
  await expect(page.getByRole('heading', { name: 'Company policies' })).toBeVisible({ timeout: 10000 });
  await page.locator('input[type="file"]').setInputFiles({
    name: `${policyFileName}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from('Disciplinary Policy\n\nEmployees must be given a fair opportunity to respond to each allegation before any finding is reached.'),
  });
  await expect(page.locator('select').last()).toBeVisible({ timeout: 45000 });

  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  const employeeName = `E2E GuardrailAction ${Date.now()}`;
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Allegations', exact: true }).click();
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Unauthorised absence');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (1)')).toBeVisible();

  // Hold a real investigation meeting — the check only fires once one has
  // actually happened, matching guardrails.js's own "nothing has failed
  // to happen yet" reasoning for a brand-new case.
  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Start meeting' }).first().click();
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
  // Process Intelligence (P15) — this same open guardrail signal now
  // also appears (deliberately) inside the new Case Risk Panel's own
  // "Procedural risk" category on the same Overview tab, so a plain
  // ancestor-climb from the signal text alone is ambiguous. Scoped by
  // GuardrailsPanel's own "Proceed anyway"/"Create action" buttons,
  // which only its cards have — CaseRiskPanel's don't.
  const signalCard = page.locator('div').filter({ hasText: 'An allegation has no recorded employee response' }).filter({ has: page.getByRole('button', { name: 'Proceed anyway' }) }).last();
  await expect(signalCard).toBeVisible({ timeout: 10000 });
  await expect(signalCard.getByText('Unauthorised absence')).toBeVisible();

  // Policy citation renders below the signal, distinct from its own prose.
  await expect(page.getByText('Company policy', { exact: false })).toBeVisible();
  await expect(page.getByText(policyFileName, { exact: false })).toBeVisible();
  await expect(page.getByText(/fair opportunity to respond/)).toBeVisible();

  // "Proceed anyway" on a policy-cited signal routes through P7's richer
  // policy-deviation prompt (two fields) rather than the plain
  // single-reason override — see policy-deviation-record.spec.js for the
  // full structured-audit-entry assertion; this just confirms the action
  // still exists and round-trips. Cancel first, signal must remain.
  await signalCard.getByRole('button', { name: 'Proceed anyway' }).click();
  const deviationPrompt = page.getByRole('dialog', { name: 'Record a policy deviation' });
  await expect(deviationPrompt).toBeVisible({ timeout: 5000 });
  await deviationPrompt.getByRole('button', { name: 'Cancel', exact: true }).click();
  // Scoped the same way as signalCard's own definition (P15's Case Risk
  // Panel duplicates this exact signal text elsewhere on the page).
  await expect(signalCard).toBeVisible();

  // Confirm this time — the signal (and its citation) leaves the open
  // list in BOTH places it appeared (GuardrailsPanel and CaseRiskPanel),
  // so the plain, unscoped text check is safe again here: once resolved,
  // neither panel renders it and the locator matches zero elements.
  await signalCard.getByRole('button', { name: 'Proceed anyway' }).click();
  await expect(deviationPrompt).toBeVisible({ timeout: 5000 });
  await deviationPrompt.locator('input').first().fill('Response will be taken at the disciplinary hearing itself.');
  await deviationPrompt.getByRole('button', { name: 'Record and proceed', exact: true }).click();
  await expect(page.getByText('An allegation has no recorded employee response')).not.toBeVisible({ timeout: 10000 });
});
