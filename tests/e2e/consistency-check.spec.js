import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

async function revealCase(page, employeeName) {
  for (let i = 0; i < 20; i++) {
    if (await page.getByText(employeeName).first().isVisible().catch(() => false)) return;
    const loadMore = page.getByRole('button', { name: /^Load more/ });
    if (!(await loadMore.isVisible().catch(() => false))) break;
    await loadMore.click();
  }
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
}

// Creates a case, records one substantiated allegation with distinctive
// reasoning, closes it (via the Cases list — the only "close" affordance
// a case at this early stage has), and issues an outcome — the minimum
// needed for it to count in both computeSanctionDistribution (needs
// cs.outcome) and comparableCaseSummaries (needs a finding). No real
// meeting/AI-record generation needed anywhere in this path. P11's
// Decision Quality Check gate reliably fires here (no evidence linked,
// no policy identified) — "Create follow-up action" clears it without
// blocking, same pattern as decision-quality-check.spec.js.
async function createClosedComparableCase(page, employeeName, caseType, outcomeType, reasoning) {
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption(caseType);
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
  const statusSaved = page.waitForResponse(r => r.url().includes('/rest/v1/allegations') && ['POST','PATCH'].includes(r.request().method()));
  await page.locator('label:text-is("Status") + select').selectOption('substantiated');
  await statusSaved;
  // Diagnostic checkpoint: confirm the case view is still intact (not
  // "Case not found") right before the reasoning field wait, which has
  // failed here with that page state — narrows down whether the case
  // view breaks before or during this specific step.
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  const reasoningField = page.getByPlaceholder(/Summarise what the evidence showed/);
  await expect(reasoningField).toBeVisible({ timeout: 10000 });
  const reasoningSaved = page.waitForResponse(r => r.url().includes('/rest/v1/allegations') && ['POST','PATCH'].includes(r.request().method()));
  await reasoningField.fill(reasoning);
  await reasoningField.blur();
  await reasoningSaved;

  await page.getByRole('button', { name: '← Cases' }).click();
  await expect(page.getByRole('heading', { name: 'Cases' })).toBeVisible({ timeout: 10000 });
  const today = new Date().toISOString().split('T')[0];
  await page.getByLabel('From', { exact: true }).fill(today);
  await page.getByLabel('Filter by case type').selectOption(caseType);
  await revealCase(page, employeeName);
  await page.getByText(employeeName).locator('xpath=following::input[@type="checkbox"][1]').click();
  const closeSaved = page.waitForResponse(r => r.url().includes('/rest/v1/cases') && ['PATCH','POST'].includes(r.request().method()));
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('1 case closed')).toBeVisible({ timeout: 10000 });
  await closeSaved;

  await revealCase(page, employeeName);
  const checkbox = page.getByText(employeeName).locator('xpath=following::input[@type="checkbox"][1]');
  await checkbox.locator('xpath=..').click();
  await page.getByRole('button', { name: 'Outcome', exact: true }).click();
  await page.getByRole('button', { name: 'Issue outcome →' }).click();
  // .last() — the OutcomeTab card underneath the modal has the exact same
  // heading text ("Issue disciplinary outcome"); the modal's own copy
  // renders after it in the DOM.
  await expect(page.getByText('Issue disciplinary outcome', { exact: true }).last()).toBeVisible({ timeout: 10000 });
  const outcomeSelect = page.locator('select').filter({ has: page.locator('option', { hasText: 'Select outcome…' }) });
  await outcomeSelect.selectOption(outcomeType);
  await page.getByPlaceholder('Any additional notes…').fill('Consistent with the disciplinary policy.');
  await page.getByRole('button', { name: 'Issue outcome & generate letter' }).click();
  const qualityCheck = page.getByRole('dialog', { name: 'A few things worth checking before this outcome goes out' });
  const gotQualityCheck = await qualityCheck.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  if (gotQualityCheck) {
    await qualityCheck.getByRole('button', { name: 'Create follow-up action' }).click();
  }
  await expect(page.getByText('Issue disciplinary outcome', { exact: true })).not.toBeVisible({ timeout: 10000 });
  // Phase 7.5C — a dismissal-type outcome used to also trigger a
  // "Start offboarding checklist?" prompt (OutcomeModal's dismissal
  // auto-offer); removed along with Offboarding itself, so there's
  // nothing left to dismiss here.
  // Issuing the outcome navigates to the letter-drafting screen, which
  // has no "+ New case" button — without returning to a screen that
  // does, the next call to this helper hangs waiting for it (this is
  // what caused the earlier "Case not found"/timeout failures here: the
  // previous case's flow hadn't actually failed, the NEXT case's very
  // first step just had nothing to click).
  await page.getByRole('button', { name: 'Home', exact: true }).click();
}

// Process Intelligence Phase 3 (P14, §11+§12) — computeSanctionDistribution
// buckets closed same-case-type cases by the sanction actually issued
// (not just the finding, which computeOutcomeDistribution already
// covered); comparableCaseSummaries exposes those same cases as
// anonymised, expandable summaries; generateConsistencyReview's own AI
// prompt is told never to reason about protected characteristics — a
// real instruction even though the underlying data already carries no
// such field. Verified by inspecting the actual /api/chat request body
// (same technique as outcome-builder.spec.js) rather than waiting on the
// AI's own response content.
test('consistency check shows a sanction distribution and anonymised comparable cases, and its AI review never sees or is told to use employee names', async ({ page }) => {
  test.setTimeout(150000);
  await login(page);
  const suffix = Date.now();
  const caseType = 'misconduct';
  const nameA = `E2E ConsistA ${suffix}`;
  const nameB = `E2E ConsistB ${suffix}`;
  const nameC = `E2E ConsistC ${suffix}`;

  await createClosedComparableCase(page, nameA, caseType, 'Final written warning', 'DISTINCTIVE_REASONING_A_swipe_card_evidence');
  await createClosedComparableCase(page, nameB, caseType, 'Final written warning', 'DISTINCTIVE_REASONING_B_witness_statement');
  await createClosedComparableCase(page, nameC, caseType, 'Dismissal with notice', 'DISTINCTIVE_REASONING_C_cctv_footage');

  const currentName = `E2E ConsistCurrent ${suffix}`;
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(currentName);
  await page.locator('label:text-is("Case type") + select').selectOption(caseType);
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(currentName).first()).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Allegations', exact: true }).click();
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Unauthorised absence');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (1)')).toBeVisible();

  // Sanction distribution — bucketed by outcome, not just finding. This
  // shared E2E org accumulates misconduct cases across every run of this
  // whole suite (not just this spec), so the total is never exactly 3 —
  // only that the feature renders real, non-zero counts is asserted.
  await expect(page.getByText('Consistency check', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/How \d+ closed misconduct cases/)).toBeVisible();
  await expect(page.getByText('Final written warning', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Dismissal with notice', { exact: true }).first()).toBeVisible();

  // Anonymised comparable-case list — none of the three employee names
  // appear anywhere in the panel, regardless of how many comparable
  // cases (this test's own plus every other spec's accumulated ones)
  // are listed.
  await expect(page.getByText(/Comparable closed cases \(\d+\)/)).toBeVisible();
  await expect(page.getByText(nameA)).not.toBeVisible();
  await expect(page.getByText(nameB)).not.toBeVisible();
  await expect(page.getByText(nameC)).not.toBeVisible();

  // Opening one toggles it to its expanded state. Not necessarily one of
  // this test's own three rows (accumulated data means .first() could
  // land on any prior run's), so this proves the expand/collapse
  // mechanism itself works — the AI-request check below is what proves
  // this test's own case content is actually included.
  await page.getByText(`${caseType} — Final written warning`).first().click();
  await expect(page.getByText('Hide', { exact: true }).first()).toBeVisible();

  // The AI request itself — anonymised, and told never to reason about
  // protected characteristics.
  const reviewRequest = page.waitForRequest(r => r.url().includes('/api/chat') && r.method() === 'POST');
  await page.getByRole('button', { name: 'Generate consistency review' }).click();
  const req = await reviewRequest;
  const body = JSON.stringify(req.postDataJSON());
  expect(body).toContain('protected characteristics');
  expect(body).not.toContain(nameA);
  expect(body).not.toContain(nameB);
  expect(body).not.toContain(nameC);
  expect(body).toContain('DISTINCTIVE_REASONING_A_swipe_card_evidence');

  // Explainability sweep (P19) — this is the one place testing the new
  // "Ask why" button genuinely needs the AI's actual response (the
  // button only renders once consistencyReview is populated), unlike the
  // request-interception check above. A generous wait, in keeping with
  // this test's already-generous overall budget.
  await expect(page.getByText('Why these cases are comparable', { exact: true })).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Ask why', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByText('Why Compass is saying this', { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(modal.getByRole('heading', { name: 'Consistency check' })).toBeVisible();
  await expect(modal.getByText('Anonymised comparable cases', { exact: true })).toBeVisible();
});
