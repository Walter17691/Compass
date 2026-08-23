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

// Process Intelligence Phase 3 (P19, §19) — the explainability sweep's
// letter-generation gap: LetterScreen drafted AI correspondence with no
// way to see what fed the draft, unlike every case_signals-based panel
// elsewhere in the app. handleLetter now snapshots a self-contained
// source list (allegations/evidence/meetings/policies/case context) at
// generation time, surfaced via the same WhySourcesModal everywhere else
// already uses.
//
// Reaches the letter screen the same lightweight way consistency-
// check.spec.js's own helper does (allegation + close + issue outcome) —
// no real meeting/transcript AI call needed, only the one letter-drafting
// call this test is actually about.
test('a generated letter shows what fed its draft via "Ask why"', async ({ page }) => {
  test.setTimeout(90000); // one real letter-drafting AI call
  await login(page);
  const employeeName = `E2E LetterWhy ${Date.now()}`;
  const caseType = 'misconduct';

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
  // Diagnostic checkpoint (matching consistency-check.spec.js's own
  // helper) — confirms the case view is still intact before the
  // reasoning field wait, and filling+saving it before navigating away
  // avoids a race that otherwise lands on "Case not found".
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  const reasoningField = page.getByPlaceholder(/Summarise what the evidence showed/);
  await expect(reasoningField).toBeVisible({ timeout: 10000 });
  const reasoningSaved = page.waitForResponse(r => r.url().includes('/rest/v1/allegations') && ['POST','PATCH'].includes(r.request().method()));
  await reasoningField.fill('Reviewed swipe-card records confirming the absence was unauthorised.');
  await reasoningField.blur();
  await reasoningSaved;

  await page.getByRole('button', { name: '← Cases' }).click();
  await expect(page.getByRole('heading', { name: 'Cases' })).toBeVisible({ timeout: 10000 });
  const today = new Date().toISOString().split('T')[0];
  await page.getByLabel('From', { exact: true }).fill(today);
  await page.getByLabel('Filter by case type').selectOption(caseType);
  await revealCase(page, employeeName);
  await page.getByText(employeeName).locator('xpath=following::input[@type="checkbox"][1]').click();
  const closeSaved = page.waitForResponse(r => r.url().includes('/rest/v1/cases') && ['PATCH', 'POST'].includes(r.request().method()));
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
  // Deliberately not a dismissal-type outcome — that triggers a separate
  // "Start offboarding checklist?" prompt unrelated to this test.
  await outcomeSelect.selectOption('Final written warning');
  await page.getByPlaceholder('Any additional notes…').fill('Consistent with the disciplinary policy.');
  await page.getByRole('button', { name: 'Issue outcome & generate letter' }).click();
  const qualityCheck = page.getByRole('dialog', { name: 'A few things worth checking before this outcome goes out' });
  const gotQualityCheck = await qualityCheck.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  if (gotQualityCheck) {
    await qualityCheck.getByRole('button', { name: 'Create follow-up action' }).click();
  }

  await expect(page.getByText('This letter was drafted by AI', { exact: false })).toBeVisible({ timeout: 60000 });

  await page.getByRole('button', { name: 'Ask why', exact: true }).click();
  const modal = page.getByRole('dialog');
  await expect(modal.getByText('Why Compass is saying this', { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(modal.getByRole('heading', { name: "This letter's draft" })).toBeVisible();
  // The allegation this test itself recorded, and the always-present
  // case-context entry, both resolved with no ids to look up — both
  // should be present regardless of what else this shared org's own
  // accumulated data adds. Scoped to the modal since the drafted
  // letter's own prose behind it may separately mention the allegation.
  await expect(modal.getByText('Unauthorised absence', { exact: true })).toBeVisible();
  await expect(modal.getByText('Case & employee details', { exact: true })).toBeVisible();
});
