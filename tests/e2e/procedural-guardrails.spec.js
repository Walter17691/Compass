import { test, expect } from '@playwright/test';
import { login, startMeeting } from './helpers.js';

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
  await startMeeting(page);
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
  // now lives in the header's "More actions" menu (Phase 2A), same
  // reasoning as inconsistency-detection.spec.js: the primary button is
  // occupied by the real next-step recommendation once a meeting has
  // been recorded (see inconsistency-detection.spec.js's own precedent
  // for why the meeting-type button also needs role-scoping here: the
  // case's own stage badge already renders "Investigation" as plain
  // text by this point).
  await page.getByRole('button', { name: /More actions/ }).click();
  await page.getByRole('menuitem', { name: '+ New meeting' }).click();
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
  // getByText's default substring matching resolves against every
  // ancestor whose own aggregate text also happens to contain this
  // string, and a plain ancestor:: div-count walk from an arbitrary one
  // of those starting points doesn't reliably land on the actual
  // SignalCard (SignalCard.jsx) boundary. filter-by-content +
  // filter-by-descendant-button + .last() guarantees a match that both
  // contains the signal's own title AND its own "Not relevant" button as
  // real descendants, then picks the innermost.
  const signalCard = page.locator('div')
    .filter({ hasText: 'Same person chaired the investigation and the disciplinary hearing' })
    .filter({ has: page.getByRole('button', { name: 'Not relevant' }) })
    .last();
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

  // Phase 6.5 hardening (closes Prompt 16 audit finding H13, HIGH) —
  // guardrailSyncedRuleIdsRef (App.jsx) is per-session, wiped on every
  // fresh mount; it used to reseed only from status==="open" signals on
  // reload, so a dismissed-but-still-triggering guardrail (this test's
  // own condition — the same chair name never changes — is exactly that
  // shape, unlike a check that genuinely clears) got recreated as a fresh
  // duplicate the moment the case was reopened. Same reload idiom as
  // decision-workspace.spec.js's own guardrail-recheck.
  await page.reload();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Same person chaired the investigation and the disciplinary hearing')).not.toBeVisible({ timeout: 10000 });
});
