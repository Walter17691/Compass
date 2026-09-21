import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { transcriptMentionsAppeal } from '../lib/appealReview.js';
import { appealLinkCandidates } from '../lib/appealLink.js';

// NEW-19 (Human UAT, P1). A structured appeal hearing — launched from the case,
// chair locked to the appointed appeal officer, invitation already issued —
// reached the Review screen and was asked "Link to an existing case?",
// offering the very case it had been launched from.
//
// transcriptMentionsAppeal already guarded the case of a meeting that merely
// MENTIONS appealing ("you have the right to appeal this decision"). Nothing
// guarded the inverse: a meeting that genuinely IS an appeal hearing mentions
// the appeal constantly, so detection fired with certainty on exactly the
// meetings that needed it least. The parent-case identity was present at
// Review the whole time (caseInfo.preparedCaseId); the condition simply never
// looked at it.
//
// These pin the deterministic gate. The modal-open condition is inline in
// handleReview, so the gate itself is asserted against the source, and the
// rule it encodes is exercised directly as a predicate.
const app = readFileSync('src/App.jsx', 'utf8');

// The predicate exactly as implemented in handleReview.
const hasAuthoritativeParentCase = caseInfo => !!(caseInfo.preparedCaseId || caseInfo._linkedCaseId);
// The full modal-open decision, mirroring the shipped condition.
const wouldOpenLinkModal = (caseInfo, tx, alreadyDetected = false) =>
  !hasAuthoritativeParentCase(caseInfo) && !alreadyDetected && transcriptMentionsAppeal(tx);

// Real appeal-hearing language — the kind the UAT hearing actually contained.
const APPEAL_HEARING_NOTES = [
  'The employee confirmed they are appealing the first written warning.',
  'They said they were not aware of the specific vehicle policy requirement.',
  'They consider the sanction disproportionate and want the warning removed.',
].join('\n');

describe('NEW-19 — structured meetings skip generic case discovery (1-4)', () => {
  it('1. preparedCaseId set + appeal language → modal does NOT open', () => {
    const structured = { preparedCaseId: '3e99e129', _linkedCaseId: null, employee: 'UAT - Fresh Golden Path 2' };
    expect(transcriptMentionsAppeal(APPEAL_HEARING_NOTES)).toBe(true); // detection would have fired
    expect(hasAuthoritativeParentCase(structured)).toBe(true);
    expect(wouldOpenLinkModal(structured, APPEAL_HEARING_NOTES)).toBe(false);
  });

  it('2. _linkedCaseId set + appeal language → modal does NOT open', () => {
    const witnessRouted = { preparedCaseId: null, _linkedCaseId: 'c-parent', employee: 'Someone Else' };
    expect(hasAuthoritativeParentCase(witnessRouted)).toBe(true);
    expect(wouldOpenLinkModal(witnessRouted, APPEAL_HEARING_NOTES)).toBe(false);
  });

  it('3. both null + genuine appeal language → modal DOES open', () => {
    const adHoc = { preparedCaseId: null, _linkedCaseId: null, employee: 'Ad Hoc Employee' };
    expect(hasAuthoritativeParentCase(adHoc)).toBe(false);
    expect(wouldOpenLinkModal(adHoc, APPEAL_HEARING_NOTES)).toBe(true);
  });

  it('3b. undefined fields behave as absent, not as a parent case', () => {
    expect(hasAuthoritativeParentCase({})).toBe(false);
    expect(wouldOpenLinkModal({}, APPEAL_HEARING_NOTES)).toBe(true);
    expect(hasAuthoritativeParentCase({ preparedCaseId: '', _linkedCaseId: '' })).toBe(false);
  });

  it('4. ad-hoc appeal discovery therefore remains available end to end', () => {
    const adHoc = { preparedCaseId: null, _linkedCaseId: null, employee: 'UAT - Fresh Golden Path 2' };
    expect(wouldOpenLinkModal(adHoc, 'The employee told me they want to appeal the outcome of the disciplinary.')).toBe(true);
    // and the candidate list it would offer is still produced the same way
    const cases = [{ id: 'c1', employeeName: 'UAT - Fresh Golden Path 2', meetings: [] }, { id: 'c2', employeeName: 'Other Person', meetings: [] }];
    expect(appealLinkCandidates(cases, adHoc.employee).map(c => c.id)).toEqual(['c1']);
  });

  it('the once-per-session guard still applies independently of parentage', () => {
    const adHoc = { preparedCaseId: null, _linkedCaseId: null, employee: 'X' };
    expect(wouldOpenLinkModal(adHoc, APPEAL_HEARING_NOTES, true)).toBe(false);
  });
});

describe('NEW-19 — existing detection behaviour is untouched (5-6)', () => {
  it('5. the "right to appeal this decision" false-positive guard still holds', () => {
    expect(transcriptMentionsAppeal('You have the right to appeal this decision within five working days.')).toBe(false);
    const adHoc = { preparedCaseId: null, _linkedCaseId: null, employee: 'X' };
    expect(wouldOpenLinkModal(adHoc, 'You have the right to appeal this decision within five working days.')).toBe(false);
  });

  it('6. transcriptMentionsAppeal itself is unchanged — the gate sits outside it', () => {
    const lib = readFileSync('src/lib/appealReview.js', 'utf8');
    expect(lib).not.toContain('preparedCaseId');
    expect(lib).not.toContain('hasAuthoritativeParentCase');
    expect(lib).not.toContain('_linkedCaseId');
  });
});

describe('NEW-19 — the shipped gate (source invariants)', () => {
  it('the predicate is defined and applied to the detection condition', () => {
    expect(app).toContain('const hasAuthoritativeParentCase = !!(caseInfo.preparedCaseId || caseInfo._linkedCaseId);');
    expect(app).toContain('if(!hasAuthoritativeParentCase && !appealDetectedRef.current && transcriptMentionsAppeal(tx)){');
  });

  it('the old ungated condition is gone', () => {
    expect(app).not.toContain('if(!appealDetectedRef.current && transcriptMentionsAppeal(tx)){');
  });

  it('15. the predicate is used only for the modal gate, never for authorization', () => {
    expect((app.match(/hasAuthoritativeParentCase/g) || []).length).toBe(2); // definition + single use
    const i = app.indexOf('const hasAuthoritativeParentCase');
    const region = app.slice(i, i + 400);
    expect(region).not.toMatch(/requireCaseAccess|canAccess|isHR|authoriz|permission|saveCases|supabase/i);
  });
});

describe('NEW-19 — nothing else in the appeal path changed (7-14, 16-17)', () => {
  it('7. appealLinkCandidates is unchanged (pure employee-name match)', () => {
    const lib = readFileSync('src/lib/appealLink.js', 'utf8');
    expect(lib).toContain('export function appealLinkCandidates(cases, employeeName)');
    expect(lib).toContain('cs.employeeName || ""');
    expect(lib).not.toContain('preparedCaseId');
  });

  it('8. recordAppealReceived is unchanged', () => {
    expect(app).toContain('const recordAppealReceived = async (caseId, applyFields = {}) => {');
    expect(app).toContain('const result = await saveCases(cases.map(x => x.id === caseId ? { ...x, stage: "appeal", ...applyFields } : x), caseId);');
    expect(app).toContain('audit("Appeal received", cs.employeeName || "", caseId);');
    expect(app).toContain('requestLateAppealAcceptance(promptDialog, audit, { deadline, caseId })');
  });

  it('9. Skip still only clears local flags', () => {
    expect(app).toContain('onClick={()=>{setShowLinkCase(false);setAppealDetected(false);appealDetectedRef.current=false;}}');
  });

  it('10. the case-card handler still routes through recordAppealReceived', () => {
    expect(app).toContain('const ok = await recordAppealReceived(cs.id, { meetings:[...cs.meetings, meeting] });');
    expect(app).toContain('type: meetingType?.label||"Meeting",');
  });

  it('11/12. saveMeetingToCaseImpl is unchanged and still stamps the appointed chair', () => {
    expect(app).toContain('const saveMeetingToCaseImpl = async (signatureInfo = {}) => {');
    expect(app).toContain('chairUserId: caseInfo.appealManagerId || null,');
    expect(app).toContain('if(caseInfo._linkedCaseId) {');
  });

  it('13. preparedCaseId still never triggers witness/evidence routing', () => {
    // The witness branch keys on _linkedCaseId alone; preparedCaseId cannot reach it.
    const i = app.indexOf('const saveMeetingToCaseImpl');
    const witnessBranch = app.slice(i, app.indexOf('const targetCase = cases.find(x=>x.id===caseInfo._linkedCaseId);', i) + 80);
    expect(witnessBranch).toContain('if(caseInfo._linkedCaseId) {');
    expect(witnessBranch).not.toContain('preparedCaseId');
  });

  it('14. the two fields remain structurally distinct at the launch site', () => {
    const view = readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');
    expect(view).toContain('preparedCaseId:cs.id,');
    expect(view).toContain('_linkedCaseId:null,');
  });

  it('16/17. no schema, API or AI-call change accompanies this gate', () => {
    const i = app.indexOf('const hasAuthoritativeParentCase');
    const region = app.slice(i, i + 400);
    expect(region).not.toMatch(/authedFetch|\/api\/|streamClaude|migration|supabase/i);
  });
});
