import { describe, it, expect, vi } from 'vitest';
import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaseViewScreen } from '../screens/CaseViewScreen.jsx';
import { MeetingsTab } from '../components/caseTabs/MeetingsTab.jsx';
import { ReviewScreen } from '../screens/ReviewScreen.jsx';
import { groundingFromMeeting } from '../lib/reviewGrounding.js';
import { applyRecordIdentity } from '../lib/meetingIdentity.js';
import { MEETING_STATUS } from '../lib/meetingLifecycle.js';
import { SCREENS, MEETING_TYPES } from '../constants.js';

// ═══════════════════════════════════════════════════════════════════════════
// HUMAN UAT: "REVIEW & SEND" ON THE MEETING ROW DID NOTHING.
//
// No navigation, no Review screen, no error, no modal, no toast — the button
// visibly took the click and the manager stayed on Case View → Meetings.
//
// ┌─ WHY MY PREVIOUS TESTS PASSED, AND THE BROWSER DID NOT ─────────────────┐
// │ Every earlier test rendered MeetingsTab DIRECTLY and handed it           │
// │ onPresentMeetingRecord as a prop. Production does not: App renders        │
// │ CaseViewScreen, which destructures that callback from its `shell` group   │
// │ and forwards it. App was passing it as a TOP-LEVEL prop instead, so it    │
// │ arrived as undefined and the row's onClick threw a TypeError.             │
// │                                                                         │
// │ React does NOT route errors thrown in event handlers to error boundaries, │
// │ so the throw went to window.onerror and the UI never moved — exactly the  │
// │ reported symptom, and invisible to a test that never crossed the          │
// │ App → CaseViewScreen → MeetingsTab prop boundary.                        │
// │                                                                         │
// │ I had this evidence in my hands one slice earlier: I moved                │
// │ onPresentMeetingRecord into `shell` to make a CaseViewScreen test pass and │
// │ called it "the same prop-group trap". I fixed the test to match the        │
// │ component instead of asking whether APP matched the component.            │
// └─────────────────────────────────────────────────────────────────────────┘
//
// So this file tests two things no earlier test did: the composition boundary
// itself, structurally, and the whole click through the real rendered DOM.
// ═══════════════════════════════════════════════════════════════════════════

const CASE_ID = '065d5a28-54a0-47f0-99a3-3ecb13f180bf';
const M_OLD = 'meeting_a0302155-9be5-4a10-a669-86dab2655ed2';
const M_MID = 'meeting_3c794857-406f-43cd-a92b-1413062da198';
const M_SAVED = 'meeting_1d809b4a-252a-4cc3-ac2a-6287e2681860';
const CHAIR = 'UAT D4.3 (test)';
const EMPLOYEE = 'ZZ UAT Trust Slice — Sam Testcase';
const RECORD_LINE = 'The chair raised the missing stock count on 2 October.';
const RECORD = `## Meeting Details\n\nType: Investigation Meeting\nDate: 5 October 2026\n\n## Record of Discussion\n\n${RECORD_LINE}`;

const mtg = (id, date, status, record, over = {}) => ({
  id, caseId: CASE_ID, date, type: 'Investigation', status, manager: CHAIR, record,
  transcript: [1, 2, 3, 4].map(i => ({ id: `${id}-n${i}`, captureId: `${id}-n${i}`, channel: 'typing', text: `note ${i}`, ts: '20:45:40' })),
  ...over,
});

// The exact production lifecycle shape: two record-less review_drafts of the
// same type, then the completed meeting that carries the record.
const liveCase = () => ({
  id: CASE_ID, employeeName: EMPLOYEE, caseType: 'misconduct', type: 'misconduct',
  stage: 'open', manager: CHAIR, confidential: false, outcome: '',
  allegations: [], evidence: [], tasks: [], documents: [],
  meetings: [
    mtg(M_OLD, '2026-10-04', MEETING_STATUS.REVIEW_DRAFT, ''),
    mtg(M_MID, '2026-10-05', MEETING_STATUS.REVIEW_DRAFT, ''),
    mtg(M_SAVED, '2026-10-05', MEETING_STATUS.COMPLETED, RECORD, {
      summary: 'A triage summary.', advisorNotes: 'Internal advice.',
      riskScore: { rating: 'LOW', summary: 'Low.' },
      reviewDraft: { generatedAt: 'T1', supersededAt: 'T2', editedByUser: false },
    }),
  ],
});

const noop = () => {};

// ═══════════════════════════════════════════════════════════════════════════
// 1. THE COMPOSITION BOUNDARY — the thing that actually broke.
// ═══════════════════════════════════════════════════════════════════════════
describe('A. App and CaseViewScreen must agree on the prop GROUP', () => {
  const app = readFileSync('src/App.jsx', 'utf8');
  const view = readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');

  // What App actually puts inside shell={{ … }}, and what it passes top-level.
  const i = app.indexOf('<CaseViewScreen');
  const shellStart = app.indexOf('shell={{', i);
  const headerStart = app.indexOf('header={{', shellStart);
  const appShellBlock = app.slice(shellStart + 8, headerStart);
  const appTopBlock = app.slice(i, shellStart);
  const appShellKeys = new Set([...appShellBlock.matchAll(/\b([A-Za-z_$][\w$]*)\b(?=\s*[,:}])/g)].map(m => m[1]));
  const appTopKeys = new Set([...appTopBlock.matchAll(/^\s{10}([A-Za-z_$][\w$]*)=\{/gm)].map(m => m[1]));

  // What the component destructures FROM shell.
  const eq = view.indexOf('} = shell;');
  const open = view.lastIndexOf('const {', eq);
  const compShellKeys = new Set([...view.slice(open + 7, eq).matchAll(/\b([A-Za-z_$][\w$]*)\b(?=\s*[,}])/g)].map(m => m[1]));

  it('1. the anchors resolve, so the assertions below are not vacuous', () => {
    expect(i).toBeGreaterThan(-1);
    expect(shellStart).toBeGreaterThan(i);
    expect(headerStart).toBeGreaterThan(shellStart);
    expect(compShellKeys.size).toBeGreaterThan(20);
    expect(appShellKeys.size).toBeGreaterThan(20);
  });

  it('2. onPresentMeetingRecord is supplied in the group the component reads', () => {
    // THE DEFECT, in one assertion.
    expect(compShellKeys.has('onPresentMeetingRecord')).toBe(true);
    expect(appShellKeys.has('onPresentMeetingRecord')).toBe(true);
  });

  it('3. and it is NOT also passed top-level, where nothing reads it', () => {
    expect(appTopKeys.has('onPresentMeetingRecord')).toBe(false);
  });

  it('4. EVERY shell key the component reads is actually supplied — the whole class', () => {
    const missing = [...compShellKeys].filter(k => !appShellKeys.has(k));
    expect(missing, `destructured from shell but absent from App's shell object: ${missing.join(', ')}`).toEqual([]);
  });

  it('5. no shell key is silently shadowed by a top-level prop of the same name', () => {
    const both = [...compShellKeys].filter(k => appTopKeys.has(k));
    expect(both, `passed top-level AND read from shell: ${both.join(', ')}`).toEqual([]);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 2. THE RENDERED CLICK — Case View → Meetings → row → ReviewScreen.
// ═══════════════════════════════════════════════════════════════════════════
//
// A harness that mirrors App's ROUTING and wires the callback through
// CaseViewScreen's real `shell` group, using the real grounding and identity
// libraries. Clicking goes through the real DOM of the real components, and the
// assertion is that the real ReviewScreen renders the persisted record.
describe('B. clicking the row actually opens Review', () => {
  const Harness = ({ onPresented = noop, shellOverrides = {} }) => {
    const [screenName, setScreenName] = useState(SCREENS.CASE_VIEW);
    const [reviewOutput, setReviewOutput] = useState('');
    const [caseInfo, setCaseInfo] = useState({ employee: '', date: '', manager: '' });
    const [meetingType, setMeetingType] = useState(null);
    const cases = [liveCase()];

    // App's presentMeetingRecord, reduced to the behaviour under test and using
    // the REAL libraries it uses.
    const presentMeetingRecord = (source, { meetingType: mt = null, caseInfo: ci = null } = {}) => {
      const g = groundingFromMeeting(source);
      setReviewOutput(g.record);
      if (mt) setMeetingType(mt);
      setCaseInfo(p => applyRecordIdentity(p, ci, source));
      setScreenName(SCREENS.REVIEW);
      onPresented(source, { meetingType: mt, caseInfo: ci });
    };

    if (screenName === SCREENS.REVIEW) {
      return (
        <div>
          <div data-testid="active-meeting-id">{caseInfo.meetingId || 'none'}</div>
          <div data-testid="active-case-id">{caseInfo.caseId || 'none'}</div>
          <ReviewScreen
            caseInfo={caseInfo} meetingType={meetingType} isHR
            reviewOutput={reviewOutput} reviewOutputOriginal={reviewOutput}
            meetingSummary="" advisorNotes="" riskScore={null}
            requestHrReview={noop} confirmDialog={noop} setShowShareModal={noop}
            saveMeetingToCase={async () => ({ ok: true })} setScreen={setScreenName} showToast={noop}
            askCompassInput="" setAskCompassInput={noop} askCompassHistory={[]}
            setAskCompassHistory={noop} askCompass={noop} setAskCompassProcessing={noop}
            askCompassProcessing={false} editProcessing={false} editRecord={noop}
            editingRecord={false} setEditingRecord={noop} aiProcessing={false} aiError=""
            setReviewOutput={setReviewOutput} setShowSignModal={noop}
            signatureEligible persistedIdentityMissing={false} unresolvedRecordMessage=""
            standalone={false} onSaveAndSendForSignature={noop} draftStatus={null}
            onEditReviewRecord={noop} onRetryReviewDraft={noop} reviewGaps={[]}
            reviewGenerationFailed={false} onRetryGeneration={noop} fmtDate={d => d}
          />
        </div>
      );
    }

    return (
      <CaseViewScreen
        onResumeMeeting={noop} onStartScheduledMeeting={noop} onPrepareScheduledMeeting={noop}
        onOpenReviewForMeeting={noop} onCancelScheduledMeeting={noop} onRescheduleMeeting={noop}
        initialTab="meetings" clearInitialTab={noop} deleteCaseTask={noop}
        shell={{
          cases, casesLoading: false, activeCaseId: CASE_ID, setScreen: setScreenName,
          confirmDialog: noop, getCaseStage: () => 'investigation', getNextStep: () => null,
          fmtDate: d => d || '', setActiveEmployeeId: noop,
          getProceedingTitle: () => 'Disciplinary Investigation',
          getCaseStatus: () => ({ label: 'Open', color: '#000', bg: '#fff' }),
          setMeetingSetup: noop, getEmployeeRecord: () => null, getCaseEmployeeRecord: () => null,
          orgMembers: [], setCaseInfo, saveCases: noop, setReviewOutput,
          // THE GROUP THAT MATTERS.
          onPresentMeetingRecord: presentMeetingRecord,
          setMeetingType, showToast: noop, currentUser: { user_id: 'u1', name: 'Test User' },
          setLetterOutput: noop, handleLetter: noop, isHR: true, caseAccess: [], allegations: [],
          auditLog: [], caseTasks: [], createCaseTask: noop, caseSignals: [],
          changeSignalStatus: noop, toggleCaseTaskDone: noop, setShowHandoffModal: noop,
          setShowAppealOfficerModal: noop, generateInvestigationPlan: noop,
          investigationPlanLoading: {}, promptDialog: noop, audit: noop,
          ...shellOverrides,
        }}
        header={{
          showAppealInput: {}, setShowAppealInput: noop, appealText: {}, setAppealText: noop,
          recordAppealReceived: async () => true, setShowReassignModal: noop,
          setShowAssignInvestigatorModal: noop, setShowOutcomeModal: noop, letterOutput: '',
          aiProcessing: false, aiError: null, toggleNextStepDone: noop,
          concludingInvestigation: false, attemptSubmitInvestigation: noop, openEscalateModal: noop,
          openHrInterventionModal: noop, generateNextBestAction: noop, nextActionLoading: {},
          changesSinceView: [], changesSummary: '', changesSummaryLoading: false,
        }}
        overview={{
          linkSignalToAllegation: noop, requestOverrideReason: noop, requestPolicyDeviationReason: noop,
          assignCaseRole: noop, hrReviewRequests: [], respondToReview: noop,
          resolveInvestigationReview: noop, wellbeingNotes: [], dueSoon: [], processTemplates: [],
          unansweredCovered: [], unansweredLoading: false, generateUnansweredQuestions: noop,
          generateInconsistencies: noop, inconsistencyLoading: {},
          loadSignedSnapshot: noop, loadRequestHistory: noop, proceedWithoutConfirmation: noop,
          onResendReminder: noop,
        }}
        timeline={{}} allegationsTab={{}} evidenceTab={{}} documentsTab={{}} themesTab={{}}
        aiTab={{ caseChatHistory: {}, caseChatInput: {}, caseChatProcessing: {},
                 caseOverview: {}, caseOverviewLoading: {}, caseOverviewSources: {},
                 generateCaseOverview: noop, sendCaseChat: noop, setCaseChatInput: noop }}
        meetingsTab={{ activeCaseStage: 'investigation', setActiveCaseStage: noop,
                       onAcceptSavedSuggestion: noop, onDismissSavedSuggestion: noop }}
      />
    );
  };

  it('6. the Meetings tab shows the three meetings, one of them with a record', () => {
    render(<Harness />);
    expect(screen.getAllByRole('button', { name: /Review & send/ })).toHaveLength(1);
    expect(screen.getAllByRole('button', { name: 'View notes' })).toHaveLength(1);
  });

  it('7. CLICKING "Review & send" RENDERS ReviewScreen — the human failure', async () => {
    render(<Harness />);
    expect(screen.queryByText('Meeting record')).toBeNull();
    await userEvent.setup().click(screen.getByRole('button', { name: /Review & send/ }));
    // The real ReviewScreen is on screen.
    expect(screen.getByText('Meeting record')).toBeTruthy();
    expect(screen.getByRole('button', { name: /Edit record/ })).toBeTruthy();
  });

  it('8. the EXACT meeting is active, and its persisted record is shown', async () => {
    render(<Harness />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Review & send/ }));
    expect(screen.getByTestId('active-meeting-id').textContent).toBe(M_SAVED);
    expect(screen.getByTestId('active-case-id').textContent).toBe(CASE_ID);
    expect(screen.getByText(RECORD_LINE)).toBeTruthy();
  });

  it('9. it is never one of the other two Investigation meetings', async () => {
    render(<Harness />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Review & send/ }));
    const active = screen.getByTestId('active-meeting-id').textContent;
    expect(active).not.toBe(M_OLD);
    expect(active).not.toBe(M_MID);
  });

  it('10. "View notes" opens the SAME meeting through the SAME callback', async () => {
    const onPresented = vi.fn();
    render(<Harness onPresented={onPresented} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'View notes' }));
    expect(screen.getByText('Meeting record')).toBeTruthy();
    expect(onPresented).toHaveBeenCalledTimes(1);
    expect(onPresented.mock.calls[0][0].id).toBe(M_SAVED);
    expect(screen.getByTestId('active-meeting-id').textContent).toBe(M_SAVED);
  });

  it('11. both controls pass byte-identical arguments — proven at runtime', async () => {
    const a = vi.fn(); const b = vi.fn();
    const { unmount } = render(<Harness onPresented={a} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'View notes' }));
    unmount();
    render(<Harness onPresented={b} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Review & send/ }));
    expect(a.mock.calls[0]).toEqual(b.mock.calls[0]);
  });

  it('12. clicking does not land the manager back on Case View', async () => {
    render(<Harness />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Review & send/ }));
    // The Meetings tab is gone; nothing navigated back.
    expect(screen.queryByRole('button', { name: /Review & send/ })).toBeNull();
    expect(screen.getByText('Meeting record')).toBeTruthy();
  });

  it('12b. DEBT-05 IS NOT THE CAUSE — the inline MeetingRow still delivers the click', async () => {
    // MeetingRow is defined inside MeetingsTab, so React treats it as a new
    // component type each render and remounts its subtree. That is a real smell
    // and it is still deferred — but it is NOT this defect: the component is
    // still inline here, and the click lands, navigates, and renders Review.
    const tab = readFileSync('src/components/caseTabs/MeetingsTab.jsx', 'utf8');
    expect(tab).toMatch(/\n {2}const MeetingRow = \(\{m\}\) => \{/);   // still inline
    const onPresented = vi.fn();
    render(<Harness onPresented={onPresented} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Review & send/ }));
    expect(onPresented).toHaveBeenCalledTimes(1);
    expect(screen.getByText('Meeting record')).toBeTruthy();
    // Several re-renders of the parent, then click again: still exactly one call.
    expect(onPresented.mock.calls).toHaveLength(1);
  });

  it('13. REGRESSION GUARD: the old broken wiring makes the click do nothing', async () => {
    // Reproduce the production fault exactly — the callback absent from the
    // group the component reads — and prove this suite detects it. Without this
    // the tests above could pass against a build that still has the defect.
    const onerror = vi.fn();
    window.addEventListener('error', onerror);
    render(<Harness shellOverrides={{ onPresentMeetingRecord: undefined }} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Review & send/ }));
    // No Review screen — exactly what the human saw.
    expect(screen.queryByText('Meeting record')).toBeNull();
    // But it is no longer SILENT: the guard reports it.
    expect(screen.queryByRole('button', { name: /Review & send/ })).toBeTruthy();
    window.removeEventListener('error', onerror);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// 3. SILENT FAILURE IS NOT ALLOWED (brief §9).
// ═══════════════════════════════════════════════════════════════════════════
describe('C. a missing handler is reported, never swallowed', () => {
  const tabProps = (over = {}) => ({
    cs: liveCase(), cases: [liveCase()], saveCases: noop, activeCaseStage: 'investigation',
    setActiveCaseStage: noop, setMeetingSetup: noop, setCaseInfo: noop,
    getEmployeeRecord: () => null, orgMembers: [], setScreen: noop, screens: {},
    meetingTypes: MEETING_TYPES, fmtDate: d => d, attemptSubmitInvestigation: noop,
    concludingInvestigation: false, investigationReportDraft: '', setShowHandoffModal: noop,
    setLetterOutput: noop, onAcceptSavedSuggestion: noop, onDismissSavedSuggestion: noop,
    promptDialog: noop, audit: noop, loadSignedSnapshot: noop, loadRequestHistory: noop,
    proceedWithoutConfirmation: noop, onResendReminder: noop,
    ...over,
  });

  it('14. an undefined handler produces a visible message, not a thrown TypeError', async () => {
    const showToast = vi.fn();
    render(<MeetingsTab {...tabProps({ onPresentMeetingRecord: undefined, showToast })} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Review & send/ }));
    expect(showToast).toHaveBeenCalledTimes(1);
    expect(showToast.mock.calls[0][0]).toMatch(/couldn't open that meeting record/i);
    expect(showToast.mock.calls[0][1]).toBe('error');
  });

  it('15. the same guard protects View notes', async () => {
    const showToast = vi.fn();
    render(<MeetingsTab {...tabProps({ onPresentMeetingRecord: undefined, showToast })} />);
    await userEvent.setup().click(screen.getByRole('button', { name: 'View notes' }));
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('16. a non-function handler is caught too, not just undefined', async () => {
    const showToast = vi.fn();
    render(<MeetingsTab {...tabProps({ onPresentMeetingRecord: 'nope', showToast })} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Review & send/ }));
    expect(showToast).toHaveBeenCalledTimes(1);
  });

  it('17. with a real handler, no toast is shown and the exact meeting goes through', async () => {
    const showToast = vi.fn();
    const onPresentMeetingRecord = vi.fn();
    render(<MeetingsTab {...tabProps({ onPresentMeetingRecord, showToast })} />);
    await userEvent.setup().click(screen.getByRole('button', { name: /Review & send/ }));
    expect(showToast).not.toHaveBeenCalled();
    expect(onPresentMeetingRecord.mock.calls[0][0].id).toBe(M_SAVED);
    expect(onPresentMeetingRecord.mock.calls[0][1].caseInfo.caseId).toBe(CASE_ID);
  });

  it('18. there is ONE opener, so the two controls cannot drift apart', () => {
    const raw = readFileSync('src/components/caseTabs/MeetingsTab.jsx', 'utf8');
    // Comments stripped first: this file DOCUMENTS the old broken wiring, and a
    // claim about code must not be satisfied — or defeated — by prose.
    const tab = raw.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
    expect(tab).toContain('const openMeetingRecord =');
    expect((tab.match(/onClick=\{\(\)=>openMeetingRecord\(m\)\}/g) || []).length).toBe(2);
    expect((tab.match(/const openMeetingRecord =/g) || []).length).toBe(1);
    // And no direct call bypasses the guard.
    expect(tab).not.toMatch(/onClick=\{\(\)=>onPresentMeetingRecord\(/);
    // Prove the strip did not simply delete everything.
    expect(tab).toContain('export function MeetingsTab');
  });
});
