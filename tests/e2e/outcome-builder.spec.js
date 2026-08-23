import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Process Intelligence Phase 3 (P12) — the outcome letter used to draw
// only on generic case/meeting context, never the allegations, findings,
// or mitigation the Decision Workspace (Phase 16, P10) already holds —
// same gap concludeInvestigation had already closed for investigation
// reports (allegationsForCase/evidenceForAllegation), just not reused
// here until now. Asserted by inspecting the actual /api/chat request
// body rather than waiting on the AI's response content — this phase is
// about what gets SENT to the model, not about the model's own output,
// and avoids coupling this test's stability to the AI call's own
// intermittent flakiness (see decision-quality-check.spec.js's note on
// the same trade-off).
test('the outcome letter prompt is grounded in the case\'s own allegation findings and mitigation, not just generic context', async ({ page }) => {
  test.setTimeout(90000); // one real meeting-record generation

  await login(page);
  const employeeName = `E2E OutcomeBuilder ${Date.now()}`;
  await page.getByRole('button', { name: 'Start meeting' }).first().click();
  await page.getByText('Disciplinary', { exact: true }).click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  const notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });
  await notepad.fill('HR: We are here to discuss the outcome of the investigation.\n');
  await notepad.fill('Employee: Understood.\n');
  await page.getByRole('button', { name: 'End meeting' }).click();

  const qualityModal = page.getByRole('dialog').filter({ hasText: 'Meeting Quality Check' });
  const gotQualityCheck = await qualityModal.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
  if (gotQualityCheck) {
    await page.getByRole('button', { name: 'Proceed anyway' }).click();
    await page.getByRole('dialog', { name: 'Proceed anyway?' }).getByRole('button', { name: 'Proceed', exact: true }).click();
  }
  await expect(page.getByText('Compass HR Advisor', { exact: true })).toBeVisible({ timeout: 90000 });
  await page.getByRole('button', { name: /Save and go to case/ }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  const caseTabBar = page.locator('div')
    .filter({ has: page.getByRole('button', { name: 'Overview', exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Documents', exact: true }) })
    .last();

  // Record a real, decided allegation with distinctive reasoning/response
  // text — these are exactly what the old, generic prompt never saw.
  await caseTabBar.getByRole('button', { name: 'Allegations', exact: true }).click();
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Unauthorised absence');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (1)')).toBeVisible();
  // .last() — the Evidence Matrix (rendered above the card list) also has
  // an "Unauthorised absence" cell sharing this text with the allegation
  // card's title; this page only ever shows the one case just navigated
  // to, so both matches are this case's own content, never another case's.
  await page.getByText('Unauthorised absence').last().click();

  const statusSaved = page.waitForResponse(r => r.url().includes('/rest/v1/allegations') && ['POST','PATCH'].includes(r.request().method()));
  await page.locator('label:text-is("Status") + select').selectOption('substantiated');
  await statusSaved;

  const reasoningField = page.getByPlaceholder(/Summarise what the evidence showed/);
  await expect(reasoningField).toBeVisible();
  const reasoningSaved = page.waitForResponse(r => r.url().includes('/rest/v1/allegations') && ['POST','PATCH'].includes(r.request().method()));
  await reasoningField.fill('DISTINCTIVE_REASONING_swipe_card_records_confirm_unauthorised_absence');
  await reasoningField.blur();
  await reasoningSaved;

  const responseField = page.getByPlaceholder(/What did the employee say/);
  const responseSaved = page.waitForResponse(r => r.url().includes('/rest/v1/allegations') && ['POST','PATCH'].includes(r.request().method()));
  await responseField.fill('DISTINCTIVE_MITIGATION_employee_cited_a_family_emergency_that_day');
  await responseField.blur();
  await responseSaved;

  // Issue the outcome — fill Notes to clear P11's "no documented
  // rationale" gap; other gaps (no evidence linked, no policy
  // identified) are expected here and cleared via "Create follow-up
  // action" (advisory only, same as decision-quality-check.spec.js).
  await caseTabBar.getByRole('button', { name: 'Outcome', exact: true }).click();
  await page.getByRole('button', { name: 'Issue outcome →' }).click();
  // .last() — the OutcomeTab card underneath the modal has the exact same
  // heading text ("Issue disciplinary outcome"); the modal's own copy
  // renders after it in the DOM.
  await expect(page.getByText('Issue disciplinary outcome', { exact: true }).last()).toBeVisible({ timeout: 10000 });
  const outcomeSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Select outcome…' }) });
  await outcomeSelect.selectOption('Final written warning');
  await page.getByPlaceholder('Any additional notes…').fill('Consistent with the disciplinary policy.');

  const letterRequest = page.waitForRequest(r => r.url().includes('/api/chat') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Issue outcome & generate letter' }).click();

  const qualityCheck = page.getByRole('dialog', { name: 'A few things worth checking before this outcome goes out' });
  const gotDecisionQualityCheck = await qualityCheck.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  if (gotDecisionQualityCheck) {
    await qualityCheck.getByRole('button', { name: 'Create follow-up action' }).click();
  }

  const req = await letterRequest;
  const promptText = JSON.stringify(req.postDataJSON());
  expect(promptText).toContain('DISTINCTIVE_REASONING_swipe_card_records_confirm_unauthorised_absence');
  expect(promptText).toContain('DISTINCTIVE_MITIGATION_employee_cited_a_family_emergency_that_day');
  expect(promptText).toContain('improvement required');
  expect(promptText).toContain('consequences of further misconduct');
  expect(promptText.toLowerCase()).toContain('mitigation');
});
