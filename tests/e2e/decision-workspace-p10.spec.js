import { test, expect } from '@playwright/test';
import { login, openNewCaseModal, openCaseSection } from './helpers.js';

// Process Intelligence Phase 3 (P10) — Decision-Maker Workspace
// enhancement. AllegationsPanel/EvidenceMatrixPanel gain three things:
// a per-allegation policy citation (keyword search seeded from the
// allegation's own title, not a fixed concern-specific list like every
// other citation in this phase — see allegationPolicyClauseRef in
// guardrails.js), a distinct investigator-finding field (separate from
// the decision-maker's own decisionReasoning, added in Phase 16), and an
// outstanding-uncertainty field. Follows decision-workspace.spec.js's
// fast "+ New case" setup rather than a full meeting — nothing here
// needs a meeting record to exist.
test('an allegation shows a policy citation from its own title, and records investigator findings distinct from the decision-maker\'s reasoning', async ({ page }) => {
  test.setTimeout(60000);

  await login(page);
  const policyFileName = `E2E DecisionWorkspacePolicy ${Date.now()}`;
  await page.getByRole('button', { name: 'Organisation', exact: true }).click();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Policies', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Company policies' })).toBeVisible({ timeout: 10000 });
  await page.locator('input[type="file"]').setInputFiles({
    name: `${policyFileName}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from('Attendance Policy\n\nUnauthorised absence\n\nAny unauthorised absence from work must be reported to a line manager within 24 hours.'),
  });
  await expect(page.getByLabel(`Category for ${policyFileName}`)).toBeVisible({ timeout: 45000 });

  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  const employeeName = `E2E DecisionWorkspace ${Date.now()}`;
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

  // .last() — the Evidence Matrix (rendered above the card list) also has
  // an "Unauthorised absence" cell sharing this text with the allegation
  // card's title; this page only ever shows the one case just navigated
  // to, so both matches are this case's own content, never another case's.
  await page.getByText('Unauthorised absence').last().click();

  // Per-allegation policy citation — found via the allegation's own title,
  // not a fixed keyword list.
  await expect(page.getByText('Company policy', { exact: false })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(policyFileName, { exact: false })).toBeVisible();
  await expect(page.getByText(/reported to a line manager within 24 hours/)).toBeVisible();

  // Investigator's finding — distinct field from decisionReasoning, and
  // visible regardless of status (no finding needs to be recorded yet).
  const investigatorField = page.getByPlaceholder(/What did the investigation itself conclude/);
  await expect(investigatorField).toBeVisible();
  const investigatorSaved = page.waitForResponse(r => r.url().includes('/rest/v1/allegations') && ['POST','PATCH'].includes(r.request().method()));
  await investigatorField.fill('Swipe-card records confirm the employee was off-site without prior authorisation.');
  await investigatorField.blur();
  await investigatorSaved;

  // Outstanding uncertainty.
  const uncertaintyField = page.getByPlaceholder(/Anything still unclear or unresolved/);
  const uncertaintySaved = page.waitForResponse(r => r.url().includes('/rest/v1/allegations') && ['POST','PATCH'].includes(r.request().method()));
  await uncertaintyField.fill('Not yet confirmed whether the employee attempted to call in sick.');
  await uncertaintyField.blur();
  await uncertaintySaved;

  // Both survive a reload — same round-trip discipline as
  // decision-workspace.spec.js's own reasoning-field check.
  await page.reload();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  await openCaseSection(page, 'Allegations');
  // .last() — the Evidence Matrix (rendered above the card list) also has
  // an "Unauthorised absence" cell sharing this text with the allegation
  // card's title; this page only ever shows the one case just navigated
  // to, so both matches are this case's own content, never another case's.
  await page.getByText('Unauthorised absence').last().click();
  await expect(page.getByPlaceholder(/What did the investigation itself conclude/)).toHaveValue('Swipe-card records confirm the employee was off-site without prior authorisation.');
  await expect(page.getByPlaceholder(/Anything still unclear or unresolved/)).toHaveValue('Not yet confirmed whether the employee attempted to call in sick.');
});
