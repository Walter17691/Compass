import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// CasesScreen paginates employee groups 15 at a time (useLoadMore), and
// this shared E2E test org has accumulated enough same-day "capability"
// cases across this suite's own repeated runs that a freshly created case
// can land past the first page. Newly created cases aren't reliably first
// in that order, so page through "Load more" until the target appears.
async function revealCase(page, employeeName) {
  for (let i = 0; i < 20; i++) {
    if (await page.getByText(employeeName).first().isVisible().catch(() => false)) return;
    const loadMore = page.getByRole('button', { name: /^Load more/ });
    if (!(await loadMore.isVisible().catch(() => false))) break;
    await loadMore.click();
  }
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });
}

// Phase 19 — the final "scale/commercialisation" item before Phase 20.
// Builds directly on appeal-detection.spec.js's existing link flow: once a
// case has a real appeal meeting record AND a finding recorded on an
// allegation, the Appeal review block appears, letting the chair generate
// Compass's neutral grounds-vs-finding comparison (a process_risk signal,
// same explainability substrate as guardrails/inconsistencies) and record
// the actual outcome themselves — Compass never proposes upheld/not upheld.
test('appeal review: generating a review creates a signal, and recording the outcome stamps who/when', async ({ page }) => {
  test.setTimeout(200000); // two real AI calls: the appeal meeting's own record generation, then generateAppealReview
  const employeeName = `E2E AppealReview ${Date.now()}`;

  await login(page);

  // Create a case, add an allegation, and record a finding with reasoning
  // — the Appeal review block only renders once isFindingStatus(a.status)
  // is true (same gate as Decision Workspace's reasoning block).
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('capability');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Allegations', exact: true }).click();
  await expect(page.getByText('Allegations (0)')).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: '+ Add allegation' }).click();
  await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill('Unauthorised absence');
  await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  await expect(page.getByText('Allegations (1)')).toBeVisible();

  await page.getByText('Unauthorised absence').last().click();
  const statusSaved = page.waitForResponse(r => r.url().includes('/rest/v1/allegations') && r.request().method() === 'POST');
  await page.locator('label:text-is("Status") + select').selectOption('substantiated');
  await statusSaved;
  const reasoningField = page.getByPlaceholder(/Summarise what the evidence showed/);
  const reasoningSaved = page.waitForResponse(r => r.url().includes('/rest/v1/allegations') && r.request().method() === 'POST');
  await reasoningField.fill('Swipe-card records confirm the employee left site without authorisation.');
  await reasoningField.blur();
  await reasoningSaved;

  // No appeal meeting yet — the block must not render.
  await expect(page.getByText('Appeal review')).not.toBeVisible();

  // Close the case, then reopen it via an appeal meeting (same detection
  // flow as appeal-detection.spec.js) to produce a real appeal meeting
  // record for appealMeetingsForCase() to find.
  await page.getByRole('button', { name: '← Cases' }).click();
  await expect(page.getByRole('heading', { name: 'Cases' })).toBeVisible({ timeout: 10000 });
  const today = new Date().toISOString().split('T')[0];
  await page.getByLabel('From').fill(today);
  await page.locator('select').first().selectOption('capability');
  await revealCase(page, employeeName);
  await page.getByText(employeeName).locator('xpath=following::input[@type="checkbox"][1]').click();
  // bulkClose's own DB write is fire-and-forget (not awaited by the
  // click handler) and, once it lands, bumps this case's local updatedAt
  // — the value the later appeal-link save's own optimistic-concurrency
  // check (saveCaseToDB's conditional update) must match. Proceeding to
  // the meeting/link flow before this write settles risks the link save
  // reading a since-stale updatedAt, failing its conditional match, and
  // silently reverting to the pre-link (closed, no meeting) DB state —
  // waiting for the actual cases-table response closes that race.
  const closeSaved = page.waitForResponse(r => r.url().includes('/rest/v1/cases') && ['PATCH','POST'].includes(r.request().method()));
  await page.getByRole('button', { name: 'Close', exact: true }).click();
  await page.getByRole('alertdialog').getByRole('button', { name: 'Close', exact: true }).click();
  await expect(page.getByText('1 case closed')).toBeVisible({ timeout: 10000 });
  await closeSaved;

  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Start meeting' }).click();
  await page.getByText('Disciplinary Appeal', { exact: true }).click();
  await page.getByPlaceholder(/e.g. Sarah Johnson/).fill(employeeName);
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  await page.getByPlaceholder(/Type or speak your meeting notes here/).waitFor({ timeout: 10000 });
  await page.getByPlaceholder(/Type or speak your meeting notes here/).fill(
    'Employee: I want to appeal the finding — the swipe-card record doesn\'t account for the fact I was covering an emergency delivery that day.\n' +
    'HR: Understood, let\'s go through your grounds of appeal.'
  );
  // The appeal-detected dialog fires as soon as the appeal keywords are
  // seen — well before the AI meeting record finishes streaming. But the
  // link handler snapshots reviewOutput into the meeting's record field at
  // click time (App.jsx's showLinkCase handler), and appealMeetingsForCase()
  // requires a non-empty record — so clicking Link too early would silently
  // produce a meeting Phase 19's own detection can never find.
  //
  // Process Intelligence (P13) found the actual bug here: "Compass is
  // generating your record..." disappears the instant reviewOutput has
  // ANY content — even a single streamed-in fragment like "## Meeting
  // Details" — not once the record is actually complete, so clicking Link
  // right after it clears can snapshot a near-empty record. The old,
  // looser appeal-review prompt apparently guessed content from that
  // sparse a record anyway, which is exactly the kind of fabrication P13's
  // stricter prompt now correctly refuses to do — surfacing this pre-
  // existing race rather than causing it. ReviewScreen only renders its
  // "Compass HR Advisor" card once reviewOutput has streamed all the way
  // through the LAST of the record's three sections
  // (reviewOutput.includes("## HR Advisor")), so waiting for it — same
  // condition-based signal every other spec in this suite already waits
  // on after "End meeting" — is what actually proves the record is done,
  // not just started.
  await page.getByRole('button', { name: 'End meeting' }).click();
  // Human Override (P1), added after this test was first written: "End
  // meeting" now runs attemptEndMeeting first, which can show the Meeting
  // Quality Check modal (this sparse transcript reliably has gaps) and
  // blocks handleReview — where appeal detection itself lives — until
  // it's dismissed. Same optional-handling every newer spec in this
  // suite already uses.
  const qualityModal = page.getByRole('dialog').filter({ hasText: 'Meeting Quality Check' });
  const gotQualityCheck = await qualityModal.waitFor({ state: 'visible', timeout: 3000 }).then(() => true).catch(() => false);
  if (gotQualityCheck) {
    await page.getByRole('button', { name: 'Proceed anyway' }).click();
    await page.getByRole('dialog', { name: 'Proceed anyway?' }).getByRole('button', { name: 'Proceed', exact: true }).click();
  }
  await expect(page.getByText('Appeal detected')).toBeVisible({ timeout: 15000 });
  await expect(page.getByText('Compass HR Advisor', { exact: true })).toBeVisible({ timeout: 90000 });
  const linkButton = page.getByRole('button', { name: new RegExp(employeeName) });
  await expect(linkButton).toBeVisible();
  await linkButton.click();
  await expect(page.getByText('Appeal detected')).not.toBeVisible({ timeout: 10000 });
  // The "Appeal linked to <name>" success toast (App.jsx's showToast,
  // 3000ms default) contains the employee name too — without waiting for
  // it to clear, revealCase()'s getByText(employeeName) check below can
  // match the still-visible toast instead of an actual Cases-list row,
  // reporting the case "found" before the list has actually rendered it.
  await expect(page.getByText('Appeal linked to')).not.toBeVisible({ timeout: 5000 });

  // Back into the case — reload (not the Cases list, unreliable against
  // this shared org's accumulated case count) to get a fresh mount whose
  // guardrail/signal state reflects the just-linked appeal meeting.
  await page.locator('aside, header').getByRole('button', { name: /^Cases/ }).click();
  await expect(page.getByRole('heading', { name: 'Cases' })).toBeVisible({ timeout: 10000 });
  await page.getByLabel('From').fill(today);
  await page.locator('select').first().selectOption('capability');
  await revealCase(page, employeeName);
  // The broader "div hasText+has(checkbox)" group filter used earlier in
  // this suite (appeal-detection.spec.js) gets ambiguous at this org's
  // accumulated case count — many ancestor divs satisfy both conditions
  // once there are 15+ rows on the page. Following the checkbox that comes
  // right after the employee name in document order (same pattern as the
  // close-case step above) stays unambiguous since this employee has
  // exactly one case. The employee-name heading itself has no click
  // handler — only the case row (the checkbox's parent div) navigates
  // into the case, per CasesScreen.jsx's onClick being on the row.
  const checkbox = page.getByText(employeeName).locator('xpath=following::input[@type="checkbox"][1]');
  const caseRow = checkbox.locator('xpath=..');
  await expect(caseRow).toContainText(/Appeal/);
  await caseRow.click();

  await page.getByRole('button', { name: /^Allegations/ }).click();
  await page.getByText('Unauthorised absence').last().click();
  const generateButton = page.getByRole('button', { name: 'Generate appeal review' });
  await expect(generateButton).toBeVisible({ timeout: 10000 });
  await generateButton.click();
  // Wait for the async round trip to fully finish — the button is
  // disabled ("Reviewing…") for the duration of generateAppealReview and
  // only becomes "Generate appeal review" again once the try/catch
  // completes, so this is a direct signal the resulting signal has
  // actually landed in state, rather than racing a fixed network wait.
  await expect(page.getByRole('button', { name: 'Generate appeal review' })).toBeEnabled({ timeout: 60000 });

  // Real AI call — assert structure, not exact wording, matching
  // org-intelligence.spec.js's established pattern for AI-generated
  // content. Process Intelligence (P13) restructured the appeal review
  // from one combined blob per allegation (a deterministic "Appeal
  // review: <allegation title>" signal title) into one AppealGroundCard
  // per distinct ground of appeal, titled from the AI's own free-text
  // ground label — not assertable verbatim. The card's own fixed section
  // labels are the deterministic, structural thing to check instead.
  await expect(page.getByText("Employee’s argument", { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(page.getByText('Compass review', { exact: true })).toBeVisible();

  // Record the outcome — the chair's own call, never Compass's.
  const outcomeSaved = page.waitForResponse(r => r.url().includes('/rest/v1/allegations') && r.request().method() === 'POST');
  await page.locator('label:text-is("Appeal outcome — recorded by the chair, never Compass") + select').selectOption('not_upheld');
  await outcomeSaved;
  await expect(page.getByText(/^Not upheld — decided /)).toBeVisible({ timeout: 10000 });
});
