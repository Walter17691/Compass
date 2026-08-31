import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Phase 7 of the reasoning-layer build-out — Intelligent Document
// Ingestion, built as a prerequisite for Phase 24 (Email integration
// groundwork), which reuses this same extraction pipeline. Nothing is
// written anywhere until a specific finding is accepted — each finding
// type dispatches to an existing write path (case_tasks, Phase 6's
// evidence-allegation linking, Phase 0's case_signals) rather than a new
// one. No allegation exists on this case, so an "allegation_link" finding
// is structurally impossible here (App.jsx's analyseEvidenceDocument
// filters those to only allegations that actually exist on the case) —
// the uploaded text is written specifically to make a "witness" finding
// the clear, reliable read, so accepting it can be checked against a
// real, predictable outcome (a new case task) rather than asserting
// exact AI wording.
test('analysing an uploaded document surfaces a witness finding that creates a real task once accepted', async ({ page }) => {
  test.setTimeout(90000); // one real Claude call, but a slower one (multimodal-shaped prompt, more reasoning)
  const employeeName = `E2E DocIngest ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Evidence' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'colleague-account.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Note from HR: David Okafor, a colleague who sits near the employee, mentioned in passing that he ' +
      'personally saw the incident happen and has more detail than what is currently on file. David Okafor ' +
      'has not yet been formally interviewed or asked for a written account of what he witnessed.'
    ),
  });
  await expect(page.getByText('colleague-account.txt')).toBeVisible({ timeout: 10000 });

  const analyseButton = page.getByRole('button', { name: 'Analyse document' });
  await expect(analyseButton).toBeVisible();
  await analyseButton.click();
  await expect(page.getByText('Analysing…')).toBeVisible();
  await expect(page.getByText('Document analysed')).toBeVisible({ timeout: 30000 });

  const findingRow = page.getByText(/Potential witness: David Okafor/);
  await expect(findingRow).toBeVisible();
  const findingCard = findingRow.locator('xpath=ancestor::div[2]');
  const taskSaved = page.waitForResponse(r => r.url().includes('/rest/v1/audit_log') && r.request().method() === 'POST');
  await findingCard.getByRole('button', { name: 'Accept' }).click();
  await taskSaved;

  // The accepted finding no longer shows as an open item...
  await expect(page.getByText(/Potential witness: David Okafor/)).not.toBeVisible();

  // ...and a real task now exists on this case as a result. Not
  // exact:true — the Tasks tab button now carries a count badge ("Tasks1",
  // no separating space) since accepting the finding just created its
  // first open task (same quirk decision-workspace.spec.js hits for the
  // Allegations tab).
  const caseTabBar = page.locator('div')
    .filter({ has: page.getByRole('button', { name: 'Overview', exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Documents', exact: true }) })
    .last();
  await caseTabBar.getByRole('button', { name: /^Tasks/ }).click();
  await expect(page.getByText(/Interview David Okafor as a potential witness/)).toBeVisible({ timeout: 10000 });
});
