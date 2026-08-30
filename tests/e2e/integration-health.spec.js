import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Client IA cleanup, §3 — "Integration health" is no longer a separate
// Settings destination. It was four rows duplicating the four OAuth
// integrations Integrations itself already lists, with no functionality
// of its own beyond a status badge — that badge now renders contextually
// against each connected integration inside Integrations (still isHR-
// gated at the badge level, since Integrations itself has never been
// isHR-gated — see IntegrationsSection.jsx's own permission-note
// comment). The shared E2E account has no real OAuth connections and so
// no integration_events rows, which is exactly the case a health badge
// should stay silent for rather than claiming "no activity yet" — the
// absence of the badge is the honest signal now, not a stated empty state.
test('Integrations lists every tracked provider, with no health badge when there is no sync history', async ({ page }) => {
  await login(page);

  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Integrations', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'Integrations', exact: true })).toBeVisible({ timeout: 10000 });

  for (const label of ['Microsoft Outlook', 'Gmail', 'Microsoft 365 Calendar', 'Google Calendar']) {
    await expect(page.getByText(label, { exact: true })).toBeVisible();
  }

  await expect(page.getByText('Healthy', { exact: true })).not.toBeVisible();
  await expect(page.getByText(/recent failure/)).not.toBeVisible();

  // Roadmap integrations live in a clearly separate, honestly-labelled
  // area — never implying an admin could connect them today.
  await expect(page.getByText('Coming soon', { exact: true })).toBeVisible();
  await expect(page.getByText('Requires administrator')).not.toBeVisible();
});
