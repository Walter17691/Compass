import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Phase 18 of the reasoning-layer build-out (scale/commercialisation
// wave, after outcome consistency). ErReportScreen's "Generate AI
// summary" already existed — this only extends the prompt with two real
// signals that were either computed-but-unused (the month-over-month
// deltas) or entirely new (lib/orgIntelligence.js's recurring-theme
// extraction), plus a wording constraint so any pattern gets framed as
// "Compass has identified a correlation…" rather than a causal claim
// about a named manager or individual.
//
// extractThemeKeywords' actual logic (frequency counting, the 2-case
// floor, stop-word filtering) is covered by orgIntelligence.test.js's 7
// unit tests. This proves the integration doesn't break: the button
// still produces a real narrative, not an error state — not the exact
// wording, which depends on genuine (and here, unpredictable) AI output
// and this shared test org's accumulated case data, matching how
// ai-assistant.spec.js/investigation-report.spec.js already assert
// structure over literal AI text.
test('Generate AI summary produces a narrative, not an error state', async ({ page }) => {
  test.setTimeout(60000);

  await login(page);
  await page.getByRole('button', { name: 'Reports' }).click();
  await expect(page.getByRole('heading', { name: 'HR Reports' })).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Generate AI summary' }).click();
  await expect(page.getByText('Generating AI summary…')).toBeVisible({ timeout: 5000 });
  await expect(page.getByText('Generating AI summary…')).not.toBeVisible({ timeout: 30000 });
  await expect(page.getByText('Error generating summary.')).not.toBeVisible();
  await expect(page.getByText('Executive summary', { exact: true })).toBeVisible();
});
