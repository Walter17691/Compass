import { test, expect } from '@playwright/test';
import { login, openNewCaseModal, openCaseSection } from './helpers.js';

// Integrations & Workflow Automation (Phase 5, IP24, §20) — real due-date
// parsing for a commitment a document/OH-report finding's own text
// contains, consumed by both Phase 7's acceptDocumentFinding (the
// "action" finding type, exercised here) and IP23's acceptOhFinding.
// Same document-ingestion.spec.js technique for a reliable single
// finding: the uploaded note is written to make "action" the clear,
// unambiguous read (no other name to trigger "witness", nothing that
// conflicts with anything else to trigger "inconsistency"), with an
// explicit "two weeks" commitment for parseCommitmentDueDate to catch.
//
// Kept deliberately short (one case save, one evidence-add save) — the
// shared E2E test-org has accumulated 1700+ cases past Supabase's
// default ~1000-row cap on loadCasesFromDB's unordered, unpaginated
// select (see occupational-health-process.spec.js), so every additional
// case-mutating step here is additional exposure to that pre-existing,
// unrelated flakiness.
test('accepting an "action" finding with a time commitment creates a task with the parsed due date', async ({ page }) => {
  test.setTimeout(90000); // one real Claude call
  const employeeName = `E2E DueDate ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  await page.waitForTimeout(600);

  await page.getByRole('button', { name: 'Evidence' }).click();
  await page.locator('input[type="file"]').setInputFiles({
    name: 'hr-note.txt',
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Note from HR: schedule a follow-up call with the employee in two weeks to check on their progress ' +
      'since the last conversation.'
    ),
  });
  await expect(page.getByText('hr-note.txt')).toBeVisible({ timeout: 10000 });

  const analyseButton = page.getByRole('button', { name: 'Analyse document' });
  await expect(analyseButton).toBeVisible();
  await analyseButton.click();
  await expect(page.getByText('Analysing…')).toBeVisible();
  await expect(page.getByText('Document analysed')).toBeVisible({ timeout: 30000 });

  const findingRow = page.getByText(/Suggested action:/);
  await expect(findingRow).toBeVisible();
  const findingCard = findingRow.locator('xpath=ancestor::div[2]');
  // The preview shown before accepting should already carry a parsed date.
  await expect(findingCard.getByText(/^Due \d{4}-\d{2}-\d{2}$/)).toBeVisible();
  await findingCard.getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByText(/Suggested action:/)).not.toBeVisible();

  await openCaseSection(page, 'Tasks');
  const taskRow = page.getByText(/follow.?up/i).first();
  await expect(taskRow).toBeVisible({ timeout: 10000 });
  const taskCard = taskRow.locator('xpath=ancestor::div[2]');
  await expect(taskCard.getByText(/Due \d{1,2}/)).toBeVisible();
});
