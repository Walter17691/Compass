import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Phase 23 of the reasoning-layer build-out — the one phase that touches
// *existing* AI surfaces rather than adding a new one. The AI case
// overview and the meeting risk-assessment panel both predate the
// case_signals/WhySourcesModal explainability primitive (Phase 0) and
// rendered as unsourced prose until now. Both reuse the exact same
// WhySourcesModal component already used for signal cards elsewhere
// (next-best-action.spec.js's own "Ask why" flow) rather than a new UI.
test('the AI case overview has an Ask why affordance sourced to its actual allegations/meetings', async ({ page }) => {
  test.setTimeout(60000); // one real Claude call (the overview itself)
  const employeeName = `E2E Explain ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // Give the overview a real allegation to cite — an empty case would
  // still work, but wouldn't prove sourceRefs actually carries real data.
  await page.getByRole('button', { name: 'Allegations', exact: true }).click();
  await expect(page.getByText('Allegations (0)')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Unauthorised absence');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (1)')).toBeVisible();

  await page.getByRole('button', { name: 'AI Assistant', exact: true }).click();
  await expect(page.getByText('AI case overview')).toBeVisible({ timeout: 10000 });
  // No "Ask why" until an overview actually exists.
  await expect(page.getByRole('button', { name: 'Ask why' })).not.toBeVisible();

  await page.getByRole('button', { name: 'Generate overview' }).click();
  await expect(page.getByText('Established facts')).toBeVisible({ timeout: 30000 });

  await page.getByRole('button', { name: 'Ask why' }).click();
  await expect(page.getByText('Why Compass is saying this')).toBeVisible();
  await expect(page.getByRole('heading', { name: 'AI case overview' })).toBeVisible();
  // The real allegation just created is the source cited, not a generic
  // placeholder — proves sourceRefs was actually threaded through from
  // App.jsx's generateCaseOverview, not just an empty array.
  await expect(page.getByText('Allegation').first()).toBeVisible();
  await expect(page.getByText('Unauthorised absence').last()).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Why Compass is saying this')).not.toBeVisible();
});

test('the meeting risk-assessment panel has an Ask why affordance citing the meeting record', async ({ page }) => {
  test.setTimeout(120000); // two real Claude calls back to back (meeting record, then risk score)
  const employeeName = `E2E ExplainRisk ${Date.now()}`;

  await login(page);
  await page.getByRole('button', { name: 'Start meeting' }).click();
  await page.getByText('Disciplinary', { exact: true }).click();
  await page.getByPlaceholder(/e.g. Sarah Johnson/).fill(employeeName);
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  await page.getByPlaceholder(/Type or speak your meeting notes here/).waitFor({ timeout: 10000 });
  await page.getByPlaceholder(/Type or speak your meeting notes here/).fill(
    'HR: We are here to discuss the allegation of gross misconduct following the incident on 5 August.\n' +
    'Employee: I understand, I have my representative with me.'
  );
  await page.getByRole('button', { name: 'End meeting' }).click();

  // Risk score is computed sequentially after the main meeting record
  // finishes streaming (App.jsx's handleReview), not in parallel, and
  // there's a real transcript-attribution AI call ahead of both of those
  // too (RecordScreen's End-meeting handler fires addUtterance for any
  // typed-but-not-yet-submitted text before handleReview) — the full
  // budget needs to cover all of it back to back.
  await expect(page.getByText('Risk assessment')).toBeVisible({ timeout: 90000 });
  await page.getByRole('button', { name: 'Ask why' }).click();
  await expect(page.getByText('Why Compass is saying this')).toBeVisible();
  await expect(page.getByRole('heading', { name: /^Risk assessment: / })).toBeVisible();
  await expect(page.getByText("This meeting's record")).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();
  await expect(page.getByText('Why Compass is saying this')).not.toBeVisible();
});
