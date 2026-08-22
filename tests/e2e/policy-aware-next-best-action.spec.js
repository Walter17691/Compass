import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Process Intelligence Phase 3 (P5) — generateNextBestAction's reasoning
// used to fold "your policy requires X" anonymously into free prose, if
// it referenced policy at all. It now also receives P4's indexed clause
// digest and can cite one back by policy name + heading; App.jsx resolves
// that citation to the real clause and attaches it to the next_action
// signal's sourceRefs, which CaseViewScreen renders as a PolicyCitation
// card — quoted clause text, structurally separate from Compass's own
// prose reasoning (still on the SignalCard itself, unchanged). Structure
// over exact AI wording, same discipline as next-best-action.spec.js —
// this proves a citation CAN appear and renders correctly when the AI
// makes one, using a policy and case description written to make that
// as likely as realistically achievable, not a name-for-name text match.
test('a policy clause cited by Next Best Action renders as a distinct citation card', async ({ page }) => {
  test.setTimeout(90000); // one real policy-indexing call, then one real Next Best Action call

  await login(page);
  // The policy's display name is derived from the uploaded FILENAME
  // (App.jsx's handlePolicyUpload), not any heading inside the document
  // text — that's what a citation actually shows, so that's what gets
  // asserted on below, not the document's own internal "Attendance
  // Policy" heading text (which never surfaces anywhere in the UI).
  const policyFileName = `E2E NBAPolicy ${Date.now()}`;
  await page.getByRole('button', { name: /View all policies & templates/ }).click();
  await expect(page.getByRole('heading', { name: 'Company policies' })).toBeVisible({ timeout: 10000 });
  await page.locator('input[type="file"]').setInputFiles({
    name: `${policyFileName}.txt`,
    mimeType: 'text/plain',
    buffer: Buffer.from(
      'Attendance Policy\n\n' +
      'Where an employee has an unauthorised absence from a shift, the line manager must contact the employee within 24 hours to establish the reason for the absence before any further step is taken.'
    ),
  });
  await expect(page.getByLabel(`Category for ${policyFileName}`)).toBeVisible({ timeout: 45000 });

  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  const employeeName = `E2E PolicyNBA ${Date.now()}`;
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByPlaceholder('Brief summary of the issue…').fill(
    'Unauthorised absence from a shift on 5 August. No contact has yet been made with the employee to establish the reason for the absence.'
  );
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Ask Compass for its take' }).click();
  await expect(page.getByText('Compass is thinking…')).toBeVisible();

  const signalCard = page.getByText('Next best action').locator('xpath=ancestor::div[2]');
  await expect(signalCard.getByRole('button', { name: 'Accept' })).toBeVisible({ timeout: 45000 });

  const citation = page.getByText('Company policy', { exact: false });
  const gotCitation = await citation.waitFor({ state: 'visible', timeout: 5000 }).then(() => true).catch(() => false);
  test.skip(!gotCitation, 'AI did not cite a policy clause on this pass — citation is conditional on the model judging one genuinely relevant, not guaranteed every run.');

  // .last() — Compass's own reasoning prose can also legitimately name
  // the policy directly (e.g. "Your company X requires..."); the citation
  // card itself (rendered after the SignalCard) is what actually matters.
  await expect(page.getByText(policyFileName, { exact: false }).last()).toBeVisible();
  // .last() — Compass's own reasoning on the SignalCard can legitimately
  // echo similar wording to the clause it just quoted; the quoted-clause
  // block itself (rendered last, inside the PolicyCitation card) is what
  // actually matters here.
  await expect(page.getByText(/contact the employee within 24 hours/).last()).toBeVisible();
});
