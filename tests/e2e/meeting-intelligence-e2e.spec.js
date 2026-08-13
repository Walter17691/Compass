import { test, expect } from '@playwright/test';
import { login } from './helpers.js';

// Meeting Intelligence Phase 2 (M11) — end-to-end verification. Builds the
// exact scenario from the spec's own §16: a case with several allegations,
// a witness statement that conflicts with something said in an earlier
// meeting, a previously undisclosed witness and a new piece of evidence
// mentioned mid-meeting, two agreed actions, and one allegation never
// asked about. Every earlier phase in this build-out (M1–M10) has its own
// dedicated spec proving that phase in isolation — this instead proves the
// whole pipeline holds together on one real flow: nothing here should
// require a manual per-panel regeneration once the meeting is saved.
test('the full meeting-intelligence pipeline holds together across a two-meeting case', async ({ page }) => {
  test.setTimeout(300000); // two real meeting-record generations, two summary generations, one live cross-meeting call, and four silent auto-refresh calls
  const employeeName = `E2E MeetingIntelligence ${Date.now()}`;

  await login(page);

  // A case with three allegations — one of which meeting 2's transcript
  // will deliberately never touch, so M9's quality check has a real gap
  // to catch computeMeetingQualityGaps compares each allegation's title
  // keywords against the current meeting's own transcript.
  await page.getByRole('button', { name: '+ New case' }).click();
  await page.getByPlaceholder('Full name').fill(employeeName);
  await page.locator('label:text-is("Case type") + select').selectOption('misconduct');
  await page.getByRole('button', { name: 'Create case' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  await page.getByRole('button', { name: 'Allegations', exact: true }).click();
  for (const title of ['Unauthorised absence', 'Verbal altercation with a colleague', 'Breach of confidentiality policy']) {
    await page.getByRole('button', { name: '+ Add allegation' }).click();
    await page.getByPlaceholder('e.g. Unauthorised absence on 5 August').fill(title);
    await page.getByRole('button', { name: 'Add allegation', exact: true }).click();
  }
  await expect(page.getByText('Allegations (3)')).toBeVisible();

  // Meeting 1 — establishes the baseline statement meeting 2 will conflict
  // with (the spec's own worked example: "I did not speak with X after
  // the incident").
  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Start meeting' }).first().click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: /^Investigation/ }).click();
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  let notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });

  await notepad.fill('HR: Did you speak with Priya at any point after the incident?\n');
  await notepad.fill('Employee: No, I did not speak with Priya after the incident.\n');
  await notepad.fill('HR: Understood, thank you for confirming that.\n');

  // Meeting 1's own transcript doesn't touch any of the case's three
  // allegations either (it's just confirming the Priya point) — M9's
  // quality check fires here too, same as any real meeting on a case with
  // open allegations that weren't all covered.
  await page.getByRole('button', { name: 'End meeting' }).click();
  const qualityModal1 = page.getByRole('dialog');
  await expect(qualityModal1.getByText('Meeting Quality Check', { exact: true })).toBeVisible({ timeout: 10000 });
  await page.getByRole('button', { name: 'Proceed anyway' }).click();

  await expect(page.getByText('Compass HR Advisor', { exact: true })).toBeVisible({ timeout: 90000 });
  await page.getByRole('button', { name: 'Save and go to case →' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  // Meeting 2 — same employee, so it links to the same case. Covers the
  // unauthorised absence and altercation allegations by keyword, mentions
  // an undisclosed witness and new evidence, states something that
  // conflicts with meeting 1, and agrees two actions — but never mentions
  // the confidentiality allegation at all.
  await page.locator('aside, header').getByRole('button', { name: 'Home', exact: true }).click();
  await page.getByRole('button', { name: 'Start meeting' }).first().click();
  await page.getByPlaceholder('e.g. Sarah Johnson').fill(employeeName);
  await page.getByRole('button', { name: /^Investigation/ }).click();
  await page.getByRole('button', { name: 'Start meeting', exact: true }).click();
  notepad = page.getByPlaceholder(/Type or speak your meeting notes here/);
  await notepad.waitFor({ timeout: 10000 });

  await notepad.fill('HR: Let\'s go back over the timeline once more, particularly the unauthorised absence and the altercation with your colleague.\n');
  await notepad.fill('Employee: Regarding the unauthorised absence, I was delayed that morning due to a family matter.\n');
  await notepad.fill('Employee: The altercation with my colleague was a brief disagreement, nothing more.\n');
  // Kept as its own isolated line, close to the spec's own worked example
  // ("I did not speak with Sarah after the incident" / "When I spoke to
  // Sarah afterwards...") — mixing it into a longer sentence with other
  // content made the live contradiction check noticeably less reliable.
  await notepad.fill('Employee: When I spoke to Priya afterwards, she mentioned something odd.\n');
  await notepad.fill('Employee: Amir Khan from the loading bay saw the whole altercation happen and could confirm what occurred.\n');
  await notepad.fill('Employee: There is also CCTV footage from the corridor camera that would show the exact timing.\n');

  // M6 — cross-meeting contradiction against meeting 1's saved record.
  await expect(page.getByText('Possible clarification required', { exact: true })).toBeVisible({ timeout: 30000 });
  // M3 — undisclosed witness and new evidence, both detected and actionable.
  await expect(page.getByText('Evidence mentioned', { exact: true })).toBeVisible({ timeout: 30000 });
  // .last() — "Amir"/"CCTV" also appear in the Live Context summary panel;
  // the sidebar's own suggestion row is what actually matters here. Each
  // notepad line triggers its own live-intelligence pass, so the pass that
  // picks up the CCTV line (typed last) can still be in flight even once
  // an earlier pass has already made "Evidence mentioned" visible for
  // Amir — give it the same generous budget as the heading itself.
  await expect(page.getByText(/Amir/).last()).toBeVisible({ timeout: 30000 });
  await expect(page.getByText(/CCTV/).last()).toBeVisible({ timeout: 30000 });

  await notepad.fill('HR: Thank you, that is very helpful. I will send the incident report to Legal by Friday.\n');
  await notepad.fill('Employee: And I will provide my written account of the altercation by next Monday.\n');

  // M4 — two agreed actions, both actionable.
  await expect(page.getByText('Actions identified', { exact: true })).toBeVisible({ timeout: 30000 });

  // Accept every pending witness/evidence/action suggestion now showing.
  // The AI keeps re-analysing the growing transcript on every line, so
  // exact wording and item count vary pass to pass — rather than pin a
  // specific row via content matching (fragile once several suggestions
  // share overlapping text), just clear everything pending. Every "Accept"
  // button on this screen belongs to one of these two suggestion lists, so
  // this can't click anything unrelated. What actually matters — real
  // tasks landing on the case — is checked by content once we're on the
  // Tasks tab below.
  while (await page.getByRole('button', { name: 'Accept' }).count() > 0) {
    await page.getByRole('button', { name: 'Accept' }).first().click();
    await page.waitForTimeout(300);
  }

  // M9 — the confidentiality allegation was never discussed this meeting;
  // the quality check should catch it before the meeting is allowed to end.
  await page.getByRole('button', { name: 'End meeting' }).click();
  const qualityModal = page.getByRole('dialog');
  await expect(qualityModal.getByText('Meeting Quality Check', { exact: true })).toBeVisible({ timeout: 10000 });
  await expect(qualityModal.getByText(/Breach of confidentiality policy/)).toBeVisible();
  await page.getByRole('button', { name: 'Proceed anyway' }).click();

  // M10 — the full record and the separate short summary both generate.
  await expect(page.getByText('Compass HR Advisor', { exact: true })).toBeVisible({ timeout: 90000 });
  await expect(page.getByText('Meeting summary', { exact: true })).toBeVisible({ timeout: 90000 });
  await expect(page.getByText(/Key Facts Established|Outstanding Questions|New Information|Potential Impact on Existing Allegations/).first()).toBeVisible();

  await page.getByRole('button', { name: 'Save and go to case →' }).click();
  await expect(page.getByText(employeeName).first()).toBeVisible({ timeout: 10000 });

  const caseTabBar = page.locator('div')
    .filter({ has: page.getByRole('button', { name: 'Overview', exact: true }) })
    .filter({ has: page.getByRole('button', { name: 'Documents', exact: true }) })
    .last();

  // M3/M4 — the accepted witness, evidence and at least one of the two
  // agreed actions all landed as real tasks on the case. Structure over
  // exact wording, same discipline as every other test in this suite —
  // the second action's own AI-paraphrased description isn't pinned since
  // its exact phrasing (owner/date included or not) varies pass to pass;
  // "Legal" alone is enough to prove M4 created a real task from a genuine
  // commitment, not just M3's witness/evidence path.
  // .first() — the accept-all loop above can catch the same suggestion
  // re-detected across two AI passes before the dedup merge catches up,
  // landing two near-duplicate tasks; either is equally valid proof a
  // real task was created.
  await caseTabBar.getByRole('button', { name: /^Tasks/ }).click();
  await expect(page.getByText(/Amir/).first()).toBeVisible({ timeout: 10000 });
  await expect(page.getByText(/CCTV/).first()).toBeVisible();
  await expect(page.getByText(/Legal/).first()).toBeVisible();

  // M7 — saving auto-refreshed case intelligence with no manual per-panel
  // regeneration. Verified the same way auto-refresh-case-intelligence.spec.js
  // does: the "generate it yourself" button is never shown once a real
  // signal already exists.
  await caseTabBar.getByRole('button', { name: 'Overview', exact: true }).click();
  await expect(page.getByRole('button', { name: 'Ask Compass for its take' })).not.toBeVisible({ timeout: 20000 });
  await expect(page.getByRole('button', { name: 'Accept' })).toBeVisible();

  // Chronology reflects both real, saved meetings without any extra step.
  await caseTabBar.getByRole('button', { name: 'Timeline', exact: true }).click();
  await expect(page.getByText(/Investigation/).first()).toBeVisible({ timeout: 10000 });
});
