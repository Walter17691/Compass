import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { useState } from 'react';
import { readFileSync } from 'node:fs';
import { render, screen, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaseViewScreen } from '../screens/CaseViewScreen.jsx';
import { ReviewScreen } from '../screens/ReviewScreen.jsx';
import { scrollWorkspaceToTop, entryResetsScroll, useScrollToTopOnEnter } from '../lib/screenScroll.js';
import { groundingFromMeeting } from '../lib/reviewGrounding.js';
import { applyRecordIdentity } from '../lib/meetingIdentity.js';
import { MEETING_STATUS } from '../lib/meetingLifecycle.js';
import { SCREENS } from '../constants.js';

// ═══════════════════════════════════════════════════════════════════════════
// HUMAN UAT: REVIEW OPENED PART-WAY DOWN THE MEETING RECORD.
//
// Both "Review & send" and "View notes" now correctly open the exact persisted
// record (human verified) — but the manager landed mid-document rather than at
// the top of the Review workspace.
//
// There was no scroll reset anywhere in Compass. The app swaps a subtree on
// `screen`, so Review inherited the Meetings tab's scroll position.
//
// The scroller is the DOCUMENT, established by elimination: when Review mounts
// the previous screen unmounts with its own overflow containers, so a persisted
// scroll position can only live on a survivor — and both App shell wrappers are
// minHeight:100vh with no overflow. ReviewScreen's position:sticky action bar
// confirms it, since sticky resolves against the scrolling ancestor.
//
// The fix must be a NAVIGATION behaviour, never a render behaviour: editing,
// switching analysis tabs, approving a proposal and saving-while-staying must
// not move the manager's reading position.
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

// A stand-in for the document scroller. jsdom performs no layout, so the test
// drives scrollTop directly — which is exactly what the fix has to reset.
let scrollToSpy;
const setDocScroll = (y) => {
  document.documentElement.scrollTop = y;
  if (document.body) document.body.scrollTop = y;
};
const docScroll = () => document.documentElement.scrollTop;

beforeEach(() => {
  scrollToSpy = vi.fn((x, y) => setDocScroll(typeof y === 'number' ? y : 0));
  window.scrollTo = scrollToSpy;
  setDocScroll(0);
  window.innerWidth = 1440;
  window.matchMedia = window.matchMedia || (q => ({
    matches: false, media: q,
    addListener() {}, removeListener() {}, addEventListener() {}, removeEventListener() {},
  }));
});
afterEach(() => { setDocScroll(0); });

// ═══════════════════════════════════════════════════════════════════════════
describe('A. the scroll helper', () => {
  it('1. resets the window and every document scroller candidate', () => {
    setDocScroll(820);
    expect(docScroll()).toBe(820);
    expect(scrollWorkspaceToTop(window)).toBe(true);
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
    expect(docScroll()).toBe(0);
  });

  it('2. still resets the scrolling element when window.scrollTo is a no-op', () => {
    setDocScroll(500);
    window.scrollTo = undefined;
    expect(scrollWorkspaceToTop(window)).toBe(true);
    expect(docScroll()).toBe(0);
  });

  it('3. never throws, and a throwing scrollTo still leaves the page at the top', () => {
    // A navigation helper must not be able to break navigation.
    expect(() => scrollWorkspaceToTop({})).not.toThrow();
    expect(scrollWorkspaceToTop({})).toBe(false);          // nothing to reset
    setDocScroll(300);
    const hostile = { scrollTo() { throw new Error('nope'); }, document };
    expect(() => scrollWorkspaceToTop(hostile)).not.toThrow();
    expect(docScroll()).toBe(0);                           // reset anyway
    // Omitting the argument falls back to the real window, deliberately: the
    // helper should never silently do nothing because a caller passed nothing.
    setDocScroll(300);
    expect(scrollWorkspaceToTop()).toBe(true);
    expect(docScroll()).toBe(0);
  });

  it('4. only Review resets on entry — every other destination is untouched', () => {
    expect(entryResetsScroll(SCREENS.REVIEW, SCREENS.REVIEW)).toBe(true);
    for (const s of [SCREENS.CASE_VIEW, SCREENS.RECORD, SCREENS.HOME, SCREENS.MEETINGS, null, undefined, '']) {
      expect(entryResetsScroll(s, SCREENS.REVIEW), String(s)).toBe(false);
    }
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// The real routing boundary: App's effect, keyed on `screen` alone.
// ═══════════════════════════════════════════════════════════════════════════
describe('B. entering Review from Case View starts at the top', () => {
  const Harness = ({ onPresented = noop, startOn = SCREENS.CASE_VIEW, onRender = noop }) => {
    const [screenName, setScreenName] = useState(startOn);
    const [reviewOutput, setReviewOutput] = useState(startOn === SCREENS.REVIEW ? RECORD : '');
    const [caseInfo, setCaseInfo] = useState({ employee: '', date: '', manager: '' });
    const [meetingType, setMeetingType] = useState(null);
    const [editingRecord, setEditingRecord] = useState(false);
    const [nudge, setNudge] = useState(0);
    const cases = [liveCase()];

    // THE REAL BOUNDARY — the same hook App calls, not a copy of it.
    useScrollToTopOnEnter(screenName, SCREENS.REVIEW);

    onRender({ setNudge, setReviewOutput, setEditingRecord });

    const presentMeetingRecord = (source, { meetingType: mt = null, caseInfo: ci = null } = {}) => {
      const g = groundingFromMeeting(source);
      setReviewOutput(g.record);
      if (mt) setMeetingType(mt);
      setCaseInfo(p => applyRecordIdentity(p, ci, source));
      setScreenName(SCREENS.REVIEW);
      onPresented(source);
    };

    if (screenName === SCREENS.REVIEW) {
      return (
        <div>
          <div data-testid="active-meeting-id">{caseInfo.meetingId || 'none'}</div>
          <div data-testid="nudge">{nudge}</div>
          <ReviewScreen
            caseInfo={caseInfo} meetingType={meetingType} isHR
            reviewOutput={reviewOutput} reviewOutputOriginal={RECORD}
            meetingSummary="A triage summary." advisorNotes="Internal advice."
            riskScore={{ rating: 'LOW', summary: 'Low.' }}
            requestHrReview={noop} confirmDialog={noop} setShowShareModal={noop}
            saveMeetingToCase={async () => ({ ok: true })} setScreen={setScreenName} showToast={noop}
            askCompassInput="" setAskCompassInput={noop} askCompassHistory={[]}
            setAskCompassHistory={noop} askCompass={noop} setAskCompassProcessing={noop}
            askCompassProcessing={false} editProcessing={false} editRecord={noop}
            editingRecord={editingRecord} setEditingRecord={setEditingRecord}
            aiProcessing={false} aiError="" setReviewOutput={setReviewOutput}
            setShowSignModal={noop} signatureEligible persistedIdentityMissing={false}
            unresolvedRecordMessage="" standalone={false} onSaveAndSendForSignature={noop}
            draftStatus={null} onEditReviewRecord={setReviewOutput} onRetryReviewDraft={noop}
            reviewGaps={[]} reviewGenerationFailed={false} onRetryGeneration={noop} fmtDate={d => d}
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
          onPresentMeetingRecord: presentMeetingRecord,
          setMeetingType, showToast: noop, currentUser: { user_id: 'u1', name: 'Test User' },
          setLetterOutput: noop, handleLetter: noop, isHR: true, caseAccess: [], allegations: [],
          auditLog: [], caseTasks: [], createCaseTask: noop, caseSignals: [],
          changeSignalStatus: noop, toggleCaseTaskDone: noop, setShowHandoffModal: noop,
          setShowAppealOfficerModal: noop, generateInvestigationPlan: noop,
          investigationPlanLoading: {}, promptDialog: noop, audit: noop,
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

  it('5. Case View scrolled down → "Review & send" → Review begins at top', async () => {
    render(<Harness />);
    // 1. the manager has scrolled the Meetings tab well down.
    setDocScroll(940);
    expect(docScroll()).toBe(940);
    // 2. they open Review through the row control.
    await userEvent.setup().click(screen.getByRole('button', { name: /Review & send/ }));
    // 3. Review is open AND at the top.
    expect(screen.getByText('Meeting record')).toBeTruthy();
    expect(docScroll()).toBe(0);
    expect(scrollToSpy).toHaveBeenCalledWith(0, 0);
  });

  it('6. Case View scrolled down → "View notes" → Review begins at top', async () => {
    render(<Harness />);
    setDocScroll(1240);
    await userEvent.setup().click(screen.getByRole('button', { name: 'View notes' }));
    expect(screen.getByText('Meeting record')).toBeTruthy();
    expect(docScroll()).toBe(0);
  });

  it('7. End meeting → Review begins at top (same boundary, no per-button call)', () => {
    // Every route into Review ends in setScreen(SCREENS.REVIEW), so mounting
    // straight into Review — which is what handleReview produces — resets too.
    setDocScroll(700);
    render(<Harness startOn={SCREENS.REVIEW} />);
    expect(docScroll()).toBe(0);
    expect(screen.getByText('Meeting record')).toBeTruthy();
  });

  it('8. the exact meeting and its persisted record are unaffected by the reset', async () => {
    render(<Harness />);
    setDocScroll(600);
    await userEvent.setup().click(screen.getByRole('button', { name: /Review & send/ }));
    expect(screen.getByTestId('active-meeting-id').textContent).toBe(M_SAVED);
    expect(screen.getByText(RECORD_LINE)).toBeTruthy();
    expect(docScroll()).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// NAVIGATION BEHAVIOUR, NOT RENDER BEHAVIOUR — the half that could go wrong.
// ═══════════════════════════════════════════════════════════════════════════
describe('C. once inside Review, the reading position is left alone', () => {
  const Harness = ({ onRender = noop }) => {
    const [screenName, setScreenName] = useState(SCREENS.REVIEW);
    const [reviewOutput, setReviewOutput] = useState(RECORD);
    const [editingRecord, setEditingRecord] = useState(false);
    const [nudge, setNudge] = useState(0);
    // THE REAL BOUNDARY — the same hook App calls, not a copy of it.
    useScrollToTopOnEnter(screenName, SCREENS.REVIEW);
    onRender({ setNudge, setReviewOutput, setEditingRecord });
    return (
      <div>
        <div data-testid="nudge">{nudge}</div>
        <ReviewScreen
          caseInfo={{ employee: EMPLOYEE, manager: CHAIR, date: '2026-10-05', caseId: CASE_ID, meetingId: M_SAVED, recordSource: 'persisted' }}
          meetingType={{ id: 'investigation', label: 'Investigation Meeting' }} isHR
          reviewOutput={reviewOutput} reviewOutputOriginal={RECORD}
          meetingSummary="A triage summary." advisorNotes="Internal advice."
          riskScore={{ rating: 'LOW', summary: 'Low.' }}
          requestHrReview={noop} confirmDialog={noop} setShowShareModal={noop}
          saveMeetingToCase={async () => ({ ok: true })} setScreen={setScreenName} showToast={noop}
          askCompassInput="" setAskCompassInput={noop} askCompassHistory={[]}
          setAskCompassHistory={noop} askCompass={noop} setAskCompassProcessing={noop}
          askCompassProcessing={false} editProcessing={false} editRecord={noop}
          editingRecord={editingRecord} setEditingRecord={setEditingRecord}
          aiProcessing={false} aiError="" setReviewOutput={setReviewOutput}
          setShowSignModal={noop} signatureEligible persistedIdentityMissing={false}
          unresolvedRecordMessage="" standalone={false} onSaveAndSendForSignature={noop}
          draftStatus={null} onEditReviewRecord={setReviewOutput} onRetryReviewDraft={noop}
          reviewGaps={[]} reviewGenerationFailed={false} onRetryGeneration={noop} fmtDate={d => d}
        />
      </div>
    );
  };

  it('9. an ordinary state update does NOT reset the scroll', () => {
    let api;
    render(<Harness onRender={(a) => { api = a; }} />);
    setDocScroll(0);
    // The manager scrolls down to read.
    setDocScroll(680);
    scrollToSpy.mockClear();
    act(() => { api.setNudge(n => n + 1); });
    expect(screen.getByTestId('nudge').textContent).toBe('1');
    expect(docScroll()).toBe(680);
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('10. repeated re-renders never claw the page back to the top', () => {
    let api;
    render(<Harness onRender={(a) => { api = a; }} />);
    setDocScroll(455);
    scrollToSpy.mockClear();
    for (let i = 0; i < 8; i++) act(() => { api.setNudge(n => n + 1); });
    expect(docScroll()).toBe(455);
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('11. switching the Review analysis tabs does not move the main scroll', async () => {
    render(<Harness />);
    setDocScroll(720);
    scrollToSpy.mockClear();
    const user = userEvent.setup();
    for (const tab of screen.getAllByRole('tab')) {
      await user.click(tab);
      expect(docScroll(), tab.textContent).toBe(720);
    }
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('12. toggling Edit record does not jump to the top', async () => {
    render(<Harness />);
    setDocScroll(530);
    scrollToSpy.mockClear();
    await userEvent.setup().click(screen.getByRole('button', { name: /Edit record/ }));
    expect(docScroll()).toBe(530);
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('13. editing the record text in place does not jump to the top', () => {
    let api;
    render(<Harness onRender={(a) => { api = a; }} />);
    setDocScroll(610);
    scrollToSpy.mockClear();
    act(() => { api.setReviewOutput(`${RECORD}\n\nA manager edit.`); });
    expect(screen.getByText(/A manager edit\./)).toBeTruthy();
    expect(docScroll()).toBe(610);
    expect(scrollToSpy).not.toHaveBeenCalled();
  });

  it('14. saving while remaining on Review does not jump to the top', async () => {
    render(<Harness />);
    setDocScroll(390);
    scrollToSpy.mockClear();
    // "Save and go to case" navigates away; the one that STAYS is Share, and
    // any in-place save is a plain state update — covered above. Here: a
    // control that re-renders Review without changing `screen`.
    await userEvent.setup().click(screen.getByRole('button', { name: 'Share' }));
    expect(docScroll()).toBe(390);
    expect(scrollToSpy).not.toHaveBeenCalled();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
describe('D. the boundary is central and correctly keyed', () => {
  const app = readFileSync('src/App.jsx', 'utf8');

  it('15. App calls the ONE shared boundary, and it is keyed on screen alone', () => {
    // App must use the same hook the tests above exercise — not a second copy.
    expect((app.match(/useScrollToTopOnEnter\(screen, SCREENS\.REVIEW\)/g) || []).length).toBe(1);
    expect(app).not.toContain('scrollWorkspaceToTop(');
    // And the hook itself fires on navigation only.
    const lib = readFileSync('src/lib/screenScroll.js', 'utf8');
    const i = lib.indexOf('export function useScrollToTopOnEnter');
    expect(i).toBeGreaterThan(-1);
    const hook = lib.slice(i);
    expect(hook).toContain('if (!entryResetsScroll(screen, target)) return;');
    expect(hook).toContain('scrollWorkspaceToTop();');
    expect(hook).toMatch(/\}, \[screen\]\);/);
  });

  it('16. no scrollTo was scattered across the Review entry buttons', () => {
    const tab = readFileSync('src/components/caseTabs/MeetingsTab.jsx', 'utf8');
    const view = readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');
    const review = readFileSync('src/screens/ReviewScreen.jsx', 'utf8');
    for (const [name, src] of [['MeetingsTab', tab], ['CaseViewScreen', view], ['ReviewScreen', review]]) {
      expect(src, name).not.toContain('scrollWorkspaceToTop');
      expect(src, name).not.toContain('window.scrollTo');
    }
  });

  it('17. presentMeetingRecord itself is unchanged — the fix is at the boundary', () => {
    const i = app.indexOf('const presentMeetingRecord =');
    const block = app.slice(i, app.indexOf('};', app.indexOf('setScreen(SCREENS.REVIEW);', i)));
    expect(block).not.toContain('scroll');
    expect(block).toContain('setScreen(SCREENS.REVIEW);');
  });
});
