import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'fs';
import { MeetingsTab } from '../components/caseTabs/MeetingsTab.jsx';
import { ReviewScreen } from '../screens/ReviewScreen.jsx';
import {
  RECORD_SOURCE, RESOLUTION, UNRESOLVABLE_REASON,
  persistedMeetingContext, detachedRecordContext, resolvePersistedMeeting,
  isPersistedIdentityMissing, canIssueFirstConfirmation, describeUnresolvedPersistedRecord,
  applyRecordIdentity,
} from '../lib/meetingIdentity.js';
import { MEETING_STATUS } from '../lib/meetingLifecycle.js';

// ═══════════════════════════════════════════════════════════════════════════
// TRUST SLICE 1c — A PERSISTED MEETING STAYS ACTIONABLE AFTER YOU LEAVE.
//
// Found by human UAT. A meeting had two identities: (case.id, meeting.id) where
// it was DISPLAYED, and caseInfo.caseId/meetingId where it was ACTED ON — and
// only the in-session meeting flow populated the second. So a manager who
// completed a meeting, left, and came back could not issue the record, and the
// one button that looked like the answer would have created a DUPLICATE CASE,
// because a missing identity fell through to a create rather than to an error.
//
// The resumeability tests below deliberately never populate the transient state:
// they construct the situation of a manager returning later with nothing in
// memory, which is the case that was broken.
// ═══════════════════════════════════════════════════════════════════════════

const CASE_ID = 'c-1111';
const MID = 'meeting_2222';

const completedMeeting = (over = {}) => ({
  id: MID, caseId: CASE_ID, type: 'Disciplinary', date: '2026-10-04',
  status: MEETING_STATUS.COMPLETED,
  record: '## Meeting Details\nA full disciplinary hearing record of real length.',
  manager: 'Jane Manager', ...over,
});

const caseWith = (m, over = {}) => ({
  id: CASE_ID, employeeName: 'E2E Synthetic Subject', caseType: 'misconduct',
  stage: 'disciplinary', meetings: [m], evidence: [], ...over,
});

// A FRESH session: caseInfo exactly as App.jsx initialises it. No caseId, no
// meetingId, no recordSource — the state a manager returning tomorrow has.
const FRESH_CASE_INFO = Object.freeze({
  employee: '', date: '2026-10-05', manager: '', context: '', email: '',
});

// ═══════════════════════════════════════════════════════════════════════════
// 1. IDENTITY RESOLVES FROM PERSISTED DATA  (brief tests 1, 2)
// ═══════════════════════════════════════════════════════════════════════════
describe('a persisted meeting identifies itself', () => {
  it('resolves caseId and meetingId from the meeting object alone', () => {
    const ctx = persistedMeetingContext(completedMeeting());
    expect(ctx).toEqual({ recordSource: RECORD_SOURCE.PERSISTED, caseId: CASE_ID, meetingId: MID });
  });

  it('an explicit caseId wins, for the 884 legacy meetings that carry none', () => {
    const legacy = completedMeeting({ caseId: undefined });
    expect(persistedMeetingContext(legacy, { caseId: CASE_ID }))
      .toEqual({ recordSource: RECORD_SOURCE.PERSISTED, caseId: CASE_ID, meetingId: MID });
    // And with neither, it reports null rather than inventing one.
    expect(persistedMeetingContext(legacy).caseId).toBeNull();
  });

  it('record TEXT gets no identity, and actively clears any stale one', () => {
    expect(detachedRecordContext())
      .toEqual({ recordSource: RECORD_SOURCE.DRAFT, caseId: null, meetingId: null });
  });

  it('resolution against persisted state finds the exact meeting', () => {
    const r = resolvePersistedMeeting([caseWith(completedMeeting())], persistedMeetingContext(completedMeeting()));
    expect(r.kind).toBe(RESOLUTION.RESOLVED);
    expect(r.caseRecord.id).toBe(CASE_ID);
    expect(r.meeting.id).toBe(MID);
  });

  it('identity is by ID, never by employee name, date or case similarity', () => {
    // A second case with the SAME employee name and date must not be matched.
    const decoy = { ...caseWith(completedMeeting({ id: 'other_meeting' })), id: 'c-9999' };
    const r = resolvePersistedMeeting([decoy, caseWith(completedMeeting())], persistedMeetingContext(completedMeeting()));
    expect(r.kind).toBe(RESOLUTION.RESOLVED);
    expect(r.caseRecord.id).toBe(CASE_ID);
    const lib = readFileSync('src/lib/meetingIdentity.js', 'utf8');
    expect(lib).not.toMatch(/employeeName|employee_name|\.date\b/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. RESUMEABILITY — THE CRITICAL TEST  (brief tests 3-7)
// ═══════════════════════════════════════════════════════════════════════════
describe('returning later, with nothing in memory', () => {
  const noop = () => {};
  const tabProps = (cs, over = {}) => ({
    cs, cases: [cs], saveCases: noop, activeCaseStage: 'disciplinary',
    setActiveCaseStage: noop, setMeetingSetup: noop, setCaseInfo: noop,
    getEmployeeRecord: () => null, orgMembers: [], setScreen: noop, screens: {},
    onPresentMeetingRecord: noop, meetingTypes: [{ id: 'disciplinary', label: 'Disciplinary' }],
    fmtDate: d => d, attemptSubmitInvestigation: noop, concludingInvestigation: false,
    investigationReportDraft: '', setShowHandoffModal: noop, setLetterOutput: noop,
    promptDialog: noop, audit: noop, ...over,
  });

  it('the row offers a route to issue a completed, never-issued record', async () => {
    const cs = caseWith(completedMeeting());
    render(<MeetingsTab {...tabProps(cs)} />);
    // THE UAT BLOCKER: before 1c the only action was "View notes".
    expect(screen.getByRole('button', { name: 'Review & send' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'View notes' })).toBeInTheDocument();
  });

  it('and hands the persisted identity to the review screen', async () => {
    const onPresentMeetingRecord = vi.fn();
    const cs = caseWith(completedMeeting());
    render(<MeetingsTab {...tabProps(cs, { onPresentMeetingRecord })} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'Review & send' }));

    expect(onPresentMeetingRecord).toHaveBeenCalledTimes(1);
    const [source, opts] = onPresentMeetingRecord.mock.calls[0];
    // The MEETING OBJECT, so identity can be derived from it...
    expect(source.id).toBe(MID);
    // ...and the case id explicitly, for legacy meetings carrying none.
    expect(opts.caseInfo.caseId).toBe(CASE_ID);
  });

  it('"View notes" carries the identity too — it was the broken route', async () => {
    const onPresentMeetingRecord = vi.fn();
    const cs = caseWith(completedMeeting());
    render(<MeetingsTab {...tabProps(cs, { onPresentMeetingRecord })} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'View notes' }));
    const [source, opts] = onPresentMeetingRecord.mock.calls[0];
    expect(source.id).toBe(MID);
    expect(opts.caseInfo.caseId).toBe(CASE_ID);
  });

  it('FRESH SESSION: identity comes from the meeting, not from prior state', () => {
    // The whole defect in one assertion. Start from App.jsx's initial caseInfo —
    // no ids at all — apply only what the route supplies, and the record is
    // resolvable. No in-session meeting flow, no refresh infrastructure needed.
    const cs = caseWith(completedMeeting());
    const afterNavigation = {
      ...FRESH_CASE_INFO,
      employee: cs.employeeName, manager: 'Jane Manager', date: '2026-10-04',
      ...persistedMeetingContext(completedMeeting(), { caseId: cs.id }),
    };
    const r = resolvePersistedMeeting([cs], afterNavigation);
    expect(r.kind).toBe(RESOLUTION.RESOLVED);
    expect(isPersistedIdentityMissing([cs], afterNavigation)).toBe(false);
  });

  it('THE SEAM: presenting a persisted meeting APPLIES the identity to caseInfo', () => {
    // Mutation P8 removed the spread that applies identity and every other test
    // still passed — the seam between "the route knows" and "the state receives"
    // was untested. This asserts the merge itself.
    const next = applyRecordIdentity(
      FRESH_CASE_INFO,
      { employee: 'E2E Synthetic Subject', manager: 'Jane Manager', date: '2026-10-04', caseId: CASE_ID },
      completedMeeting(),
    );
    expect(next.recordSource).toBe(RECORD_SOURCE.PERSISTED);
    expect(next.caseId).toBe(CASE_ID);
    expect(next.meetingId).toBe(MID);
    expect(resolvePersistedMeeting([caseWith(completedMeeting())], next).kind).toBe(RESOLUTION.RESOLVED);
  });

  it('identity is applied LAST — caller display fields cannot overwrite it', () => {
    const next = applyRecordIdentity(
      { caseId: 'stale-case', meetingId: 'stale-meeting' },
      { caseId: CASE_ID, meetingId: 'caller-tried-this' },
      completedMeeting(),
    );
    expect(next.caseId).toBe(CASE_ID);
    expect(next.meetingId).toBe(MID);           // from the meeting, not the caller
  });

  it('presenting record TEXT clears a previously-open meeting identity', () => {
    // The bug in reverse: viewing evidence after a meeting must not leave the
    // meeting's ids in place for a later action to target.
    const afterMeeting = applyRecordIdentity(FRESH_CASE_INFO, { caseId: CASE_ID }, completedMeeting());
    const afterText = applyRecordIdentity(afterMeeting, {}, 'Some evidence text.');
    expect(afterText.caseId).toBeNull();
    expect(afterText.meetingId).toBeNull();
    expect(afterText.recordSource).toBe(RECORD_SOURCE.DRAFT);
    expect(resolvePersistedMeeting([caseWith(completedMeeting())], afterText).kind).toBe(RESOLUTION.NOT_PERSISTED);
  });

  it('the presenter uses the shared merge rather than composing inline', () => {
    const src = readFileSync('src/App.jsx', 'utf8');
    expect(src).toMatch(/setCaseInfo\(p => applyRecordIdentity\(p, ci, source\)\)/);
  });

  it('the same-session flow is unaffected — it already set both ids', () => {
    const inSession = { ...FRESH_CASE_INFO, caseId: CASE_ID, meetingId: MID, recordSource: RECORD_SOURCE.PERSISTED };
    expect(resolvePersistedMeeting([caseWith(completedMeeting())], inSession).kind).toBe(RESOLUTION.RESOLVED);
  });

  it('a logout/refresh-equivalent reset leaves no stale identity behind', () => {
    // Nothing survives the reset, so nothing can be silently reused: a bare
    // FRESH_CASE_INFO is NOT_PERSISTED, so no action is offered at all.
    expect(resolvePersistedMeeting([caseWith(completedMeeting())], FRESH_CASE_INFO).kind)
      .toBe(RESOLUTION.NOT_PERSISTED);
    expect(isPersistedIdentityMissing([caseWith(completedMeeting())], FRESH_CASE_INFO)).toBe(false);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. FAIL CLOSED  (brief tests 8-12)
// ═══════════════════════════════════════════════════════════════════════════
describe('a persisted record that cannot be identified refuses', () => {
  const cs = caseWith(completedMeeting());

  it('missing ids are UNRESOLVABLE, not "fine to create"', () => {
    const r = resolvePersistedMeeting([cs], { recordSource: RECORD_SOURCE.PERSISTED });
    expect(r.kind).toBe(RESOLUTION.UNRESOLVABLE);
    expect(r.reason).toBe(UNRESOLVABLE_REASON.MISSING_IDS);
  });

  it('a case that no longer exists is UNRESOLVABLE', () => {
    const r = resolvePersistedMeeting([cs], { recordSource: RECORD_SOURCE.PERSISTED, caseId: 'gone', meetingId: MID });
    expect(r.reason).toBe(UNRESOLVABLE_REASON.CASE_NOT_FOUND);
  });

  it('a meeting that is not on that case is UNRESOLVABLE', () => {
    const r = resolvePersistedMeeting([cs], { recordSource: RECORD_SOURCE.PERSISTED, caseId: CASE_ID, meetingId: 'gone' });
    expect(r.reason).toBe(UNRESOLVABLE_REASON.MEETING_NOT_FOUND);
  });

  it('the save path refuses BEFORE any write, and creates nothing', () => {
    const src = readFileSync('src/App.jsx', 'utf8');
    const guard = src.slice(src.indexOf('const persisted = resolvePersistedMeeting(cases, caseInfo);'));
    expect(guard.slice(0, 500)).toMatch(/if\(persisted\.kind === RESOLUTION\.UNRESOLVABLE\)/);
    expect(guard.slice(0, 500)).toMatch(/return \{ ok:false, reason:"persisted_identity_unresolved" \}/);
    // It sits BEFORE the create path, which is the whole point.
    const guardAt = src.indexOf('const persisted = resolvePersistedMeeting(cases, caseInfo);');
    const createAt = src.indexOf('const caseId = existing ? existing.id : crypto.randomUUID();');
    expect(guardAt).toBeGreaterThan(-1);
    expect(createAt).toBeGreaterThan(guardAt);
  });

  it('the review screen offers NO action and says what to do', () => {
    const noop = () => {};
    render(<ReviewScreen
      caseInfo={{ employee: 'Sam', manager: 'Jane', date: '2026-10-04' }}
      meetingType={{ id: 'disciplinary', label: 'Disciplinary' }} isHR cases={[cs]}
      requestHrReview={noop} reviewOutput="A record." reviewOutputOriginal="A record." meetingSummary=""
      confirmDialog={noop} setShowShareModal={noop} saveMeetingToCase={noop}
      setScreen={noop} showToast={noop} askCompassInput="" setAskCompassInput={noop}
      askCompassHistory={[]} setAskCompassHistory={noop} askCompass={noop} setAskCompassProcessing={noop}
      askCompassProcessing={false} editProcessing={false} editRecord={noop} editingRecord={false}
      setEditingRecord={noop} aiProcessing={false} aiError="" setReviewOutput={noop}
      setShowSignModal={noop} onSaveAndSendForSignature={noop}
      persistedIdentityMissing unresolvedRecordMessage={describeUnresolvedPersistedRecord()}
      riskScore={null} reviewGenerationFailed={false} onRetryGeneration={noop} />);

    expect(screen.getByText(/couldn't identify the saved meeting record/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /send for signature/i })).toBeNull();
    expect(screen.queryByRole('button', { name: /Save & send/i })).toBeNull();
  });

  it('the message is actionable and leaks nothing technical', () => {
    const m = describeUnresolvedPersistedRecord();
    expect(m).toMatch(/return to the case/i);
    ['caseId', 'meetingId', 'undefined', 'null', 'uuid', 'caseInfo']
      .forEach(leak => expect(m.toLowerCase()).not.toContain(leak.toLowerCase()));
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 4. DUPLICATE PREVENTION  (brief section 9)
// ═══════════════════════════════════════════════════════════════════════════
describe('nothing can manufacture a duplicate', () => {
  it('the create path is reachable only for a record that is NOT persisted', () => {
    const src = readFileSync('src/App.jsx', 'utf8');
    // The guard returns before structuredCaseId is even read.
    const guardAt = src.indexOf('resolvePersistedMeeting(cases, caseInfo)');
    const structuredAt = src.indexOf('const structuredCaseId = caseInfo.caseId || null;');
    expect(guardAt).toBeLessThan(structuredAt);
  });

  it('a send refusal cannot create a case as a side effect', () => {
    // saveAndSendForSignature's stage 1 is saveMeetingToCase, which now refuses
    // for an unresolvable persisted record — so stage 2 is never reached and
    // nothing is created. Asserted on the ordering that makes it true.
    const src = readFileSync('src/App.jsx', 'utf8');
    const fn = src.slice(src.indexOf('const saveAndSendForSignature'), src.indexOf('const saveMeetingToCaseImpl'));
    expect(fn).toMatch(/const saved = await saveMeetingToCase\(\);/);
    expect(fn).toMatch(/if\(!saved\?\.ok\) return saved;/);
  });

  it('repeated clicks cannot produce two cases', () => {
    const src = readFileSync('src/App.jsx', 'utf8');
    // The pre-existing in-flight ref, plus the new guard, plus identity by id.
    expect(src).toMatch(/savingMeetingRef/);
    expect(src).toMatch(/if\(persisted\.kind === RESOLUTION\.UNRESOLVABLE\)/);
  });

  it('resolution never falls back to a fuzzy match of any kind', () => {
    const lib = readFileSync('src/lib/meetingIdentity.js', 'utf8');
    expect(lib).not.toMatch(/includes\(|startsWith\(|toLowerCase\(|similar/i);
    // Only strict id equality.
    expect(lib).toMatch(/c\.id === caseId/);
    expect(lib).toMatch(/m\.id === meetingId/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 5. WHEN MAY A RECORD BE ISSUED?  (brief sections 10, 11)
// ═══════════════════════════════════════════════════════════════════════════
describe('first-issue eligibility', () => {
  it('a completed record with no current request may be issued', () => {
    expect(canIssueFirstConfirmation(completedMeeting())).toBe(true);
  });

  it('an empty record may not', () => {
    expect(canIssueFirstConfirmation(completedMeeting({ record: '' }))).toBe(false);
    expect(canIssueFirstConfirmation(completedMeeting({ record: '   ' }))).toBe(false);
  });

  it('an incomplete meeting may not', () => {
    [MEETING_STATUS.SCHEDULED, MEETING_STATUS.IN_PROGRESS, MEETING_STATUS.REVIEW_DRAFT, MEETING_STATUS.CANCELLED]
      .forEach(st => expect(canIssueFirstConfirmation(completedMeeting({ status: st })), st).toBe(false));
  });

  it('a LEGACY meeting with no declared status may not — the pre-1c rule, unchanged', () => {
    const legacy = { ...completedMeeting() };
    delete legacy.status;
    expect(canIssueFirstConfirmation(legacy)).toBe(false);
  });

  it('a record that already has a request is not a FIRST issue', () => {
    expect(canIssueFirstConfirmation(completedMeeting({ signId: 'sign-1' }))).toBe(false);
  });

  it('eligibility does not depend on case stage', () => {
    // Deliberate: giving someone the record of their own hearing is not made
    // wrong by the hearing being over. Whether it is the PRIMARY next step is
    // nextStep.js's question, and that is unchanged.
    const m = completedMeeting();
    ['intake', 'investigation', 'disciplinary', 'outcome', 'appeal', 'closed', undefined]
      .forEach(() => expect(canIssueFirstConfirmation(m)).toBe(true));
    // Comments stripped: the only occurrence of "stage" in that file is the
    // comment EXPLAINING the independence, and asserting against prose is how a
    // claim about code gets faked.
    const code = readFileSync('src/lib/meetingIdentity.js', 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/[^\n]*$/gm, '').replace(/^\s*\*.*$/gm, '');
    expect(code).not.toMatch(/\bstage\b/);
  });

  it('permissions are NOT broadened — the row CTA adds no new gate', () => {
    const tab = readFileSync('src/components/caseTabs/MeetingsTab.jsx', 'utf8');
    const block = tab.slice(tab.indexOf('canIssueFirstConfirmation(m)'), tab.indexOf('canIssueFirstConfirmation(m)') + 700);
    // It navigates only. Authorisation remains where it already was: reaching the
    // case at all, plus requireOrgMembership on /api/signing.
    //
    // Both row controls now route through openMeetingRecord — one opener that
    // reports a missing handler instead of throwing a TypeError nobody sees.
    expect(block).toMatch(/openMeetingRecord\(m\)/);
    expect(block).not.toMatch(/isHR|canDecide|role/);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 6. EVERY PROCESS PATH  (brief tests 18-21)
// ═══════════════════════════════════════════════════════════════════════════
describe('every meeting type resumes identically', () => {
  const noop = () => {};
  it.each([
    ['Investigation', 'investigation'],
    ['Disciplinary', 'disciplinary'],
    ['Grievance', 'hearing'],
    ['Disciplinary Appeal', 'appeal'],
  ])('%s resolves and offers the issue route', async (type, stageId) => {
    const m = completedMeeting({ type, id: `meeting_${stageId}` });
    const cs = caseWith(m, { stage: stageId, caseType: /Grievance/.test(type) ? 'grievance' : 'misconduct' });
    const onPresentMeetingRecord = vi.fn();
    render(<MeetingsTab cs={cs} cases={[cs]} saveCases={noop} activeCaseStage={stageId}
      setActiveCaseStage={noop} setMeetingSetup={noop} setCaseInfo={noop}
      getEmployeeRecord={() => null} orgMembers={[]} setScreen={noop} screens={{}}
      onPresentMeetingRecord={onPresentMeetingRecord}
      meetingTypes={[{ id: 'disciplinary', label: type }]} fmtDate={d => d}
      attemptSubmitInvestigation={noop} concludingInvestigation={false}
      investigationReportDraft="" setShowHandoffModal={noop} setLetterOutput={noop}
      promptDialog={noop} audit={noop} />);

    expect(canIssueFirstConfirmation(m), type).toBe(true);
    const btn = screen.queryByRole('button', { name: 'Review & send' });
    expect(btn, `${type} must offer the issue route`).toBeInTheDocument();
    await userEvent.setup().click(btn);
    expect(onPresentMeetingRecord.mock.calls[0][1].caseInfo.caseId).toBe(CASE_ID);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 7. TRUST SLICE 1 / 1b GUARANTEES INTACT  (brief section 12)
// ═══════════════════════════════════════════════════════════════════════════
describe('earlier trust guarantees are untouched', () => {
  it('the row still shows no confirmation controls without a request', () => {
    const cs = caseWith(completedMeeting());
    const noop = () => {};
    render(<MeetingsTab cs={cs} cases={[cs]} saveCases={noop} activeCaseStage="disciplinary"
      setActiveCaseStage={noop} setMeetingSetup={noop} setCaseInfo={noop}
      getEmployeeRecord={() => null} orgMembers={[]} setScreen={noop} screens={{}}
      onPresentMeetingRecord={noop} meetingTypes={[]} fmtDate={d => d}
      attemptSubmitInvestigation={noop} concludingInvestigation={false}
      investigationReportDraft="" setShowHandoffModal={noop} setLetterOutput={noop}
      promptDialog={noop} audit={noop} />);
    // No reminder, no proceed, no issued-copy view, and nothing claiming a signature.
    expect(screen.queryByRole('button', { name: /Send reminder/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /Proceed without confirmation/ })).toBeNull();
    expect(screen.queryByText(/Signed copy/)).toBeNull();
  });

  it('the identity helper touches no signing, snapshot or supersession concern', () => {
    const lib = readFileSync('src/lib/meetingIdentity.js', 'utf8');
    ['signing_requests', 'superseded', 'document', 'participant_comment', 'proceeded']
      .forEach(t => expect(lib, t).not.toContain(t));
  });

  it('nothing in 1c weakened the signing gate', () => {
    const src = readFileSync('src/App.jsx', 'utf8');
    // sendForSignature's own defence-in-depth check is still there and unchanged.
    expect(src).toMatch(/if\(!signatureEligibleIn\(casesRef\.current, ids\)\) \{/);
    expect(src).toMatch(/only a confirmed record can be sent for signature/);
  });
});
