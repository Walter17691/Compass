import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Organisational ER Intelligence (Phase 6, OP22, §18) — Improvement
// Initiatives. Fully deterministic — creating an initiative, adding a
// milestone, changing status, and saving an outcome are all plain
// Supabase client-library operations, no AI call anywhere in this path.
test('HR can create an initiative, it persists across a reload, and milestones/status/outcome can be managed', async ({ page }) => {
  const title = `E2E Initiative ${Date.now()}`;
  // The shared test org accumulates initiatives across every run — a
  // generic supporting-insight label like "Trend: grievance cases"
  // collides with earlier runs' own initiatives once there are enough
  // of them (the same accumulation problem already found in
  // tasks.spec.js/theme-taxonomy.spec.js). Folding the unique title into
  // the label keeps this assertion scoped to this run's own initiative.
  const supportingInsight = `Trend: ${title}`;

  await login(page);
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Improvement Initiatives', exact: true }).click();
  await expect(page.getByRole('button', { name: '+ New initiative' })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: '+ New initiative' }).click();

  await page.getByPlaceholder('Title').fill(title);
  await page.getByPlaceholder('Problem identified').fill('Grievance volume rising at one site.');
  await page.getByPlaceholder('Supporting insights (comma-separated, optional)').fill(supportingInsight);
  await page.getByPlaceholder('Owner').fill('Priya Shah');
  const initiativeSaved = page.waitForResponse(r => r.url().includes('/rest/v1/improvement_initiatives') && r.request().method() === 'POST');
  await page.getByRole('button', { name: 'Create initiative', exact: true }).click();
  await initiativeSaved;
  await expect(page.getByText(title, { exact: true })).toBeVisible();
  await expect(page.locator('div').filter({ hasText: title }).getByText(supportingInsight, { exact: true }).first()).toBeVisible();

  await page.reload();
  await page.getByRole('button', { name: 'Insights', exact: true }).click();
  await page.getByRole('button', { name: 'Improvement Initiatives', exact: true }).click();
  await expect(page.getByText(title, { exact: true })).toBeVisible({ timeout: 10000 });
  // React StrictMode (main.jsx, dev-only — doesn't double-invoke in a
  // production build) double-invokes the org-load effect on mount, so
  // loadImprovementInitiatives() fires twice here; the second GET can
  // resolve after this test's own optimistic PATCH update and silently
  // overwrite it with pre-update data, since it's an unconditional full
  // list replace (same shape as every other loader in that effect).
  // Waiting for the network to settle before interacting avoids racing
  // that dev-only duplicate load — a real user never reloads and acts
  // within the same sub-second window this scripted test does.
  await page.waitForLoadState('networkidle');

  // Every div ancestor containing the (unique) title also contains the
  // same single "View details" button as a descendant, same
  // nested-div-structure reasoning org-events.spec.js's own comment
  // documents for this pattern.
  const initiativeCard = () => page.locator('div').filter({ hasText: title });
  await initiativeCard().getByRole('button', { name: 'View details' }).first().click();
  await expect(initiativeCard().getByText('No milestones set yet.').first()).toBeVisible();

  await initiativeCard().getByPlaceholder('New milestone').first().fill('Draft new rota policy');
  const milestoneSaved = page.waitForResponse(r => r.url().includes('/rest/v1/improvement_initiatives') && r.request().method() === 'PATCH');
  await initiativeCard().getByRole('button', { name: 'Add milestone', exact: true }).first().click();
  await milestoneSaved;
  await expect(initiativeCard().getByText('Draft new rota policy', { exact: true }).first()).toBeVisible();

  const milestoneToggled = page.waitForResponse(r => r.url().includes('/rest/v1/improvement_initiatives') && r.request().method() === 'PATCH');
  await initiativeCard().getByRole('checkbox').first().click();
  await milestoneToggled;
  await expect(initiativeCard().getByRole('checkbox').first()).toBeChecked();

  const statusChanged = page.waitForResponse(r => r.url().includes('/rest/v1/improvement_initiatives') && r.request().method() === 'PATCH');
  await initiativeCard().locator('select').first().selectOption('completed');
  await statusChanged;
  await expect(initiativeCard().getByText('Completed', { exact: true }).first()).toBeVisible();

  await initiativeCard().getByPlaceholder('What happened once this was implemented…').first().fill('Grievance volume dropped after the rota change.');
  const outcomeSaved = page.waitForResponse(r => r.url().includes('/rest/v1/improvement_initiatives') && r.request().method() === 'PATCH');
  await initiativeCard().getByRole('button', { name: 'Save outcome', exact: true }).first().click();
  await outcomeSaved;
});
