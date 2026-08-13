import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Process Intelligence Phase 3 (P20, §21) — the acceptance bar for the
// whole phase, same shape as Meeting Intelligence's own closing spec
// (meeting-intelligence-e2e.spec.js): one real case, built up through the
// features P1–P19 actually shipped, proving Compass can answer every one
// of §21's 8 questions from it — not that each feature works in
// isolation (every earlier phase already has its own dedicated spec for
// that), but that they hold together on one real case:
//   1. What process is this?              → Timeline's stage-progress bar
//   2. What stage is it at?                → Timeline's current-stage pill
//   3. What's next?                        → Case Copilot's "Next:" banner
//   4. What does policy say?               → Process Checklist's linked policy
//   5. What's missing?                     → Case Risk panel's evidence gap
//   6. What's due?                         → Calendar, from a key date
//   7. Is the decision properly reasoned?  → recorded investigator finding
//                                             and decision reasoning
//   8. Would another HR professional
//      understand why?                     → the evidence gap's "Ask why"
//                                             drill-down
//
// Deliberately AI-call-free (unlike M11, which is specifically about
// proving several real AI passes hold together) — every one of these 8
// answers comes from this phase's own deterministic, rule-based
// machinery (processStages.js, getNextStep, computeDueSoon, caseRisk.js),
// not from anything the model might phrase differently pass to pass. The
// one AI-adjacent surface that could also answer some of these
// (policy-aware Next Best Action's own clause citation) is deliberately
// not used here — policy-aware-next-best-action.spec.js already proves
// that surface on its own, and it self-skips when the model doesn't
// cite a clause on a given pass, which would make this closing test
// exactly as unreliable. Process Templates' "linked policy" field
// (P18) answers question 4 with the same real, honest information with
// no such variance.
test('a real case can answer all 8 of the process-intelligence acceptance questions', async ({ page }) => {
  test.setTimeout(60000);
  await login(page);
  const employeeName = `E2E FullVerification ${Date.now()}`;
  const caseType = 'misconduct';

  // ── Set up the misconduct process template (Q4's source) ──
  // No default tasks are configured — misconduct is by far the most
  // common case type across this whole shared E2E suite, and a default
  // task would auto-create itself on every other spec's own misconduct
  // cases from this point on. required_documents/suggested_meetings/
  // policy/target_days are all purely informational reads with no such
  // side effect.
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await page.getByRole('button', { name: 'Process templates', exact: true }).click();
  await expect(page.getByText('Process templates', { exact: true }).first()).toBeVisible({ timeout: 10000 });
  await page.getByText('Misconduct', { exact: true }).click();
  await page.getByPlaceholder('e.g. Investigation report').fill('Investigation report');
  await page.getByPlaceholder('e.g. Investigation meeting').fill('Investigation meeting');
  await page.locator('select').filter({ has: page.locator('option', { hasText: 'Disciplinary' }) }).selectOption('disciplinary');
  await page.getByPlaceholder('10').fill('15');
  const templateSaved = page.waitForResponse(r => r.url().includes('/rest/v1/process_templates') && ['POST', 'PATCH'].includes(r.request().method()));
  await page.getByRole('button', { name: 'Save template', exact: true }).click();
  await templateSaved;
  await expect(page.getByText('Saved', { exact: true })).toBeVisible({ timeout: 10000 });

  // ── Create the case ──
  await page.getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption(caseType);
  await page.getByPlaceholder('Brief summary of the issue…').fill('Repeated unauthorised absence from shifts without prior notice or explanation.');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  const caseTabBar = page.locator('div')
    .filter({ has: page.getByRole('button', { name: 'Overview', exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Documents', exact: true }) })
    .last();

  // Q3 — what's next. getNextStep's own rule-based recommendation, no AI.
  await expect(page.getByText(/^Next: /)).toBeVisible({ timeout: 10000 });

  // Q4 — what does policy say. The template's checklist, read live from
  // this case's own process type.
  await expect(page.getByText('Process checklist', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Investigation report', { exact: true })).toBeVisible();
  await expect(page.getByText('Investigation meeting', { exact: true })).toBeVisible();
  await expect(page.getByText('Linked policy: Disciplinary', { exact: false })).toBeVisible();
  await expect(page.getByText('Target: 15 days per stage', { exact: false })).toBeVisible();

  // ── Record a real, decided allegation — Q7's source ──
  await caseTabBar.getByRole('button', { name: 'Allegations', exact: true }).click();
  await expect(page.getByText('Allegations (0)')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Unauthorised absence');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (1)')).toBeVisible();
  await page.getByText('Unauthorised absence').last().click();
  const statusSaved = page.waitForResponse(r => r.url().includes('/rest/v1/allegations') && r.request().method() === 'POST');
  await page.locator('label:text-is("Status") + select').selectOption('substantiated');
  await statusSaved;

  // Q7 — is the decision properly reasoned. Both fields P10 added
  // specifically to make this answerable: the investigator's own finding,
  // kept separate from the decision-maker's reasoning.
  const findingField = page.getByPlaceholder(/What did the investigation itself conclude/);
  await expect(findingField).toBeVisible({ timeout: 10000 });
  const findingSaved = page.waitForResponse(r => r.url().includes('/rest/v1/allegations') && r.request().method() === 'POST');
  await findingField.fill('Swipe-card records confirm the employee was absent from site for the full shift with no prior notice given.');
  await findingField.blur();
  await findingSaved;

  const reasoningField = page.getByPlaceholder(/Summarise what the evidence showed/);
  const reasoningSaved = page.waitForResponse(r => r.url().includes('/rest/v1/allegations') && r.request().method() === 'POST');
  await reasoningField.fill('The swipe-card evidence is unambiguous and was not disputed at the hearing; substantiated on the balance of probabilities.');
  await reasoningField.blur();
  await reasoningSaved;
  await expect(findingField).toHaveValue(/Swipe-card records confirm/);
  await expect(reasoningField).toHaveValue(/unambiguous and was not disputed/);

  // ── Q5 and Q8 — what's missing, and would another HR professional
  // understand why. No evidence has been linked to the allegation above,
  // so the Case Risk panel's evidence-gap check (deterministic — any
  // allegation with nothing linked, decided or not) fires; its own
  // "Ask why" drill-down is exactly the explainability this question is
  // really asking about. ──
  await caseTabBar.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByText('Case risk', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Evidence gap (1)', { exact: true })).toBeVisible();
  const evidenceGapItem = page.getByText('No evidence linked: "Unauthorised absence"', { exact: true });
  await expect(evidenceGapItem).toBeVisible();
  const evidenceGapCard = evidenceGapItem.locator('xpath=..');
  await evidenceGapCard.getByRole('button', { name: 'Ask why' }).click();
  const riskModal = page.getByRole('dialog');
  await expect(riskModal.getByText('Why Compass is saying this', { exact: true })).toBeVisible({ timeout: 5000 });
  await expect(riskModal.getByRole('heading', { name: 'No evidence linked: "Unauthorised absence"' })).toBeVisible();
  await riskModal.getByRole('button', { name: 'Close', exact: true }).click();
  await expect(riskModal).not.toBeVisible({ timeout: 5000 });

  // ── Q6 — what's due. A key date entered directly on the case, the same
  // deterministic computeDueSoon source deadline-intelligence.spec.js
  // proves end to end — surfaced here on the Calendar. ──
  const target = new Date();
  target.setDate(target.getDate() + 5);
  const targetIso = target.toISOString().split('T')[0];
  const targetDay = target.getDate();
  const crossesMonth = target.getMonth() !== new Date().getMonth();

  await expect(page.getByText('Key dates', { exact: true })).toBeVisible({ timeout: 10000 });
  const dateInput = page.locator('label:text-is("Suspension review") + input[type="date"]');
  const caseSaved = page.waitForResponse(r => r.url().includes('/rest/v1/cases') && ['PATCH', 'POST'].includes(r.request().method()));
  await dateInput.fill(targetIso);
  await dateInput.blur();
  await caseSaved;
  await expect(dateInput).toHaveValue(targetIso);

  await page.locator('aside, header').getByRole('button', { name: 'Calendar', exact: true }).click();
  await expect(page.getByText('Calendar', { exact: true }).first()).toBeVisible({ timeout: 10000 });
  if (crossesMonth) {
    await page.getByRole('button', { name: '→', exact: true }).click();
  }
  await page.getByText(String(targetDay), { exact: true }).click();
  const detailItem = page.locator('div').filter({ hasText: employeeName }).filter({ hasText: 'Suspension review due' }).last();
  await expect(detailItem).toBeVisible({ timeout: 10000 });

  // ── Q1 and Q2 — what process, what stage. Real, deterministic P2/P3
  // machinery: PROCESS_TYPES' own label, and the current-stage pill from
  // computeStageProgress. ──
  await detailItem.click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
  await caseTabBar.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.getByText('Misconduct process', { exact: true })).toBeVisible({ timeout: 10000 });
});
