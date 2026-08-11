import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Phase 4 of the reasoning-layer build-out (process intelligence, after
// meeting intelligence). Unlike Next Best Action/Contradiction Detection/
// Unanswered Questions, computeGuardrailChecks (lib/guardrails.js) is a
// plain deterministic comparison, not an AI call — so App.jsx's
// syncGuardrailSignals runs automatically the moment the case is opened,
// with no button/loading state to wait on. This proves the real-world
// case: the same person chairing both the investigation and the
// disciplinary hearing for one case, which the chair-name field defaults
// don't prevent on their own.
test('Compass flags the same chair running both the investigation and the disciplinary hearing', async ({ page }) => {
  test.setTimeout(90000); // two meeting-record saves
  const employeeName = `E2E Guardrail ${Date.now()}`;
  const chairName = 'Priya Shah';

  await login(page);
  await page.getByRole('button', { name: 'Start meeting' }).click();
  await page.getByText('Investigation', { exact: true }).click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByPlaceholder('e.g. Tom Norton').fill(chairName);
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  await page.getByPlaceholder(/Type or speak your meeting notes here/).waitFor({ timeout: 10000 });
  await page.getByPlaceholder(/Type or speak your meeting notes here/).fill(
    'HR: Can you talk me through what happened on 6 August?\nEmployee: Yes, of course.'
  );
  await page.getByRole('button', { name: 'End meeting' }).click();
  await page.getByText('Meeting Dialogue', { exact: false }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /Save and go to case/ }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // Second meeting for the same case, same chair name — "+ New meeting"
  // from the case header (see inconsistency-detection.spec.js's own
  // precedent for why the meeting-type button needs role-scoping here:
  // the case's own stage badge already renders "Investigation" as plain
  // text by this point).
  await page.getByRole('button', { name: '+ New meeting' }).click();
  await page.getByRole('button', { name: 'Disciplinary ACAS S2' }).click();
  await page.getByPlaceholder('e.g. Tom Norton').fill(chairName);
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  await page.getByPlaceholder(/Type or speak your meeting notes here/).waitFor({ timeout: 10000 });
  await page.getByPlaceholder(/Type or speak your meeting notes here/).fill(
    'HR: We are here to discuss the outcome of the investigation.\nEmployee: Understood.'
  );
  await page.getByRole('button', { name: 'End meeting' }).click();
  await page.getByText('Meeting Dialogue', { exact: false }).waitFor({ timeout: 30000 });
  await page.getByRole('button', { name: /Save and go to case/ }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await expect(page.getByText('Procedural guardrails', { exact: true })).toBeVisible({ timeout: 10000 });
  const signalCard = page.getByText('Same person chaired the investigation and the disciplinary hearing').locator('xpath=ancestor::div[2]');
  await expect(signalCard).toBeVisible({ timeout: 10000 });
  await expect(signalCard.getByText(chairName)).toBeVisible();
  await expect(signalCard.getByRole('button', { name: 'Not relevant' })).toBeVisible();

  // Ask why resolves both real meeting sources.
  await signalCard.getByRole('button', { name: 'Ask why' }).click();
  await expect(page.getByText('Why Compass is saying this')).toBeVisible();
  await expect(page.getByText('Investigation', { exact: true }).first()).toBeVisible();
  await expect(page.getByText('Disciplinary', { exact: true }).first()).toBeVisible();
  await page.getByRole('button', { name: 'Close' }).click();

  await signalCard.getByRole('button', { name: 'Not relevant' }).click();
  await expect(page.getByText('Same person chaired the investigation and the disciplinary hearing')).not.toBeVisible();
});
