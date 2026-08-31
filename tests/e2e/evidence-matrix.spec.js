import { test, expect } from '@playwright/test';
import { login, openNewCaseModal } from './helpers.js';

// Phase 6 of the reasoning-layer build-out (4 of 5 in the ER Intelligence
// MVP — see plan file). The grid itself and manual link/unlink already
// existed via allegations.js/AllegationsPanel; this only adds the
// aggregate matrix view and AI-suggested links. Live-verified separately
// for suggestion quality — this proves the matrix reflects both a
// manually-linked item and an AI-accepted suggestion correctly.
test('Evidence matrix shows a manually-linked item and an AI-suggested link once accepted', async ({ page }) => {
  test.setTimeout(60000); // one real Claude call for suggestions
  const employeeName = `E2E EvidenceMatrix ${Date.now()}`;

  await login(page);
  await openNewCaseModal(page);
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Evidence' }).click();
  await page.locator('input[type="file"]').setInputFiles([
    { name: 'absence-cctv-log.txt', mimeType: 'text/plain', buffer: Buffer.from('Site exit logged 14:32.') },
    { name: 'carpark-cctv-footage.txt', mimeType: 'text/plain', buffer: Buffer.from('Footage of the car park incident on 6 August.') },
  ]);
  await expect(page.getByText('absence-cctv-log.txt')).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Allegations', exact: true }).click();
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Unauthorised absence');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Car park altercation');
  await page.getByLabel('Description').fill('Alleged altercation in the staff car park on 6 August.');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (2)')).toBeVisible();

  // Manually link one evidence item to "Unauthorised absence" — existing
  // link mechanism, exercised here to seed the matrix's non-AI half.
  // .last() — the matrix table (rendered above the card list) has its own
  // "Unauthorised absence" cell sharing this text with the allegation
  // card's title.
  await page.getByText('Unauthorised absence', { exact: true }).last().click();
  await page.locator('select').filter({ hasText: 'Link existing evidence...' }).selectOption({ label: 'absence-cctv-log.txt' });
  await expect(page.getByText('Linked evidence (1)')).toBeVisible();

  // The matrix table should now show the manually-linked item under
  // Supporting evidence for that row.
  const matrixTable = page.locator('table');
  await expect(matrixTable.getByRole('button', { name: 'absence-cctv-log.txt' })).toBeVisible();

  // Get an AI suggestion for the remaining unlinked item and accept it.
  await page.getByRole('button', { name: /Suggest links for 1 unlinked item/ }).click();
  await expect(page.getByText('Suggested links — confirm or reject each one')).toBeVisible({ timeout: 30000 });
  await page.getByRole('button', { name: 'Accept' }).click();
  await expect(page.getByText('Suggested links — confirm or reject each one')).not.toBeVisible();
  await expect(matrixTable.getByRole('button', { name: 'carpark-cctv-footage.txt' })).toBeVisible();
});
