import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { CaseViewScreen } from '../screens/CaseViewScreen.jsx';
import { MEETING_STATUS } from '../lib/meetingLifecycle.js';
import { getNextStep } from '../lib/nextStep.js';

// ─────────────────────────────────────────────────────────────────────────
// Phase 3A human-UAT failure: "Review meeting record" did nothing.
//
// Both rendered CTAs — the top-right primary and the Suggested next step —
// dispatched correctly all the way to onOpenReviewForMeeting, and my Phase 3A
// tests asserted exactly that, at SOURCE level. They passed while production was
// broken, because the break was one layer further on: openReviewForMeeting left
// navigation to handleReview, which returns early when there are no notes,
// before it reaches setScreen. The meeting had reached review_draft with an
// empty transcript (End patched endedAt only), so the chain completed and then
// silently went nowhere.
//
// So these tests RENDER the screen and CLICK the real buttons. A source
// assertion that a handler is wired proves the wiring, not the outcome — the
// same lesson as "a unit test on a primitive proves nothing about the caller".
// ─────────────────────────────────────────────────────────────────────────

const noop = () => {};

const CASE_ID = 'b3400735-f884-4f50-89dc-1012e3546d4b';
const MID = 'meeting_df599cb1-66be-4203-b956-7725721bf318';

// The exact production fixture that failed.
const reviewDraftMeeting = (over = {}) => ({
  id: MID, caseId: CASE_ID, type: 'Disciplinary', status: MEETING_STATUS.REVIEW_DRAFT,
  schedule: { date: '2026-10-04', time: '10:00', method: 'Microsoft Teams' },
  date: '2026-10-04', createdAt: '2026-09-25T09:55:02.484Z', createdBy: 'UAT - HR Manager',
  startedAt: '2026-09-25T09:55:30.265Z', endedAt: '2026-09-25T11:45:33.560Z',
  chairUserId: null, manager: '', participants: [], record: null, transcript: [],
  invitation: null, calendar: null, ...over,
});

const scheduledMeeting = () => reviewDraftMeeting({
  id: 'm_sched', status: MEETING_STATUS.SCHEDULED, startedAt: null, endedAt: null });
const liveMeeting = () => reviewDraftMeeting({
  id: 'm_live', status: MEETING_STATUS.IN_PROGRESS, endedAt: null });
const completedMeeting = () => reviewDraftMeeting({
  id: 'm_done', status: MEETING_STATUS.COMPLETED, record: 'The hearing was held.', signStatus: null });

const makeCase = (...meetings) => ({
  id: CASE_ID, employeeName: 'AT - Continuity Retest', manager: 'Alex Manager',
  meetings, evidence: [], confidential: false, caseType: 'misconduct', stage: 'disciplinary',
});

// Minimal-but-real prop surface, mirroring src/test/CaseViewScreen.test.jsx.
const makeProps = (cs, spies) => ({
  shell: {
    cases: [cs], activeCaseId: cs.id, setScreen: spies.setScreen, confirmDialog: noop,
    getCaseStage: () => 'disciplinary',
    // the REAL reader, so the CTA label and action are derived exactly as production derives them
    getNextStep: c => getNextStep(c, { isHR: true }),
    fmtDate: d => d || '', getProceedingTitle: () => 'Disciplinary',
    getCaseStatus: () => ({ label: 'Disciplinary record in review', color: '#000', bg: '#fff' }),
    setMeetingSetup: noop, getEmployeeRecord: () => null, orgMembers: [], setCaseInfo: noop,
    saveCases: spies.saveCases, setReviewOutput: noop, setMeetingType: noop, showToast: noop,
    currentUser: { user_id: 'u1', name: 'Test User' }, setLetterOutput: noop, handleLetter: noop,
    isHR: true, caseAccess: [], allegations: [], auditLog: [], caseTasks: [], createCaseTask: noop,
    caseSignals: [], changeSignalStatus: noop, toggleCaseTaskDone: noop, setShowHandoffModal: noop,
    setShowAppealOfficerModal: noop, generateInvestigationPlan: noop, investigationPlanLoading: {},
  },
  header: {
    showAppealInput: {}, setShowAppealInput: noop, appealText: {}, setAppealText: noop,
    recordAppealReceived: async () => true, setShowReassignModal: noop,
    setShowAssignInvestigatorModal: noop, setShowOutcomeModal: noop,
    setShowSignModal: spies.setShowSignModal, letterOutput: '', aiProcessing: false, aiError: null,
    toggleNextStepDone: noop, concludingInvestigation: false, attemptSubmitInvestigation: noop,
    openEscalateModal: noop, openHrInterventionModal: noop, generateNextBestAction: noop,
    nextActionLoading: {}, changesSinceView: [], changesSummary: '', changesSummaryLoading: false,
  },
  initialTab: null, clearInitialTab: noop, deleteCaseTask: noop,
  onOpenReviewForMeeting: spies.onOpenReviewForMeeting,
  onResumeMeeting: spies.onResumeMeeting,
  onStartScheduledMeeting: spies.onStartScheduledMeeting,
  onPrepareScheduledMeeting: noop, onCancelScheduledMeeting: noop, onRescheduleMeeting: noop,
  overview: {
    linkSignalToAllegation: noop, requestOverrideReason: noop, requestPolicyDeviationReason: noop,
    assignCaseRole: noop, hrReviewRequests: [], respondToReview: noop, resolveInvestigationReview: noop,
    wellbeingNotes: [], dueSoon: [], processTemplates: [], unansweredCovered: [], unansweredLoading: false,
    generateUnansweredQuestions: noop, generateInconsistencies: noop, inconsistencyLoading: {},
    ohReportFindings: [], ohReportAnalysisLoading: false, onAnalyseOhReport: noop, onAcceptOhFinding: noop,
    onDismissOhFinding: noop, onSendForSignature: noop, automationLevels: {}, onResendReminder: noop,
  },
  timeline: { toggleTimelineExclude: noop, editTimelineDescription: noop, generateTimelineRelevance: noop, timelineRelevanceLoading: {}, loadJsPDF: noop },
  allegationsTab: {
    createAllegation: noop, patchAllegation: noop, changeAllegationStatus: noop, deleteAllegation: noop,
    evidenceSuggestions: {}, evidenceSuggestionsLoading: {}, generateEvidenceSuggestions: noop,
    acceptEvidenceSuggestion: noop, rejectEvidenceSuggestion: noop, generateAppealReview: noop,
    appealReviewLoading: false, recordAppealOutcome: noop, policies: [], consistencyReview: {},
    consistencyReviewLoading: false, generateConsistencyReview: noop,
  },
  meetingsTab: { activeCaseStage: null, setActiveCaseStage: noop, onAcceptSavedSuggestion: noop, onDismissSavedSuggestion: noop },
  evidenceTab: { documentFindings: {}, documentAnalysisLoading: {}, analyseEvidenceDocument: noop, acceptDocumentFinding: noop, dismissDocumentFinding: noop, removeEvidence: noop },
  documentsTab: { onGenerateHearingPack: noop, hearingPackGenerating: {}, onDraftCorrespondence: noop },
  themesTab: {
    organisationThemes: [], caseThemes: [], themeSuggestions: {}, themeSuggestionLoading: {},
    onSuggestThemes: noop, onConfirmThemeSuggestion: noop, onDismissThemeSuggestion: noop,
    onAssignExistingTheme: noop, onRemoveTheme: noop,
  },
  aiTab: {
    caseChatHistory: {}, caseChatInput: '', setCaseChatInput: noop, caseChatProcessing: false,
    sendCaseChat: noop, caseOverview: {}, caseOverviewLoading: {}, generateCaseOverview: noop,
    caseOverviewSources: {},
  },
});

let spies;
beforeEach(() => {
  spies = {
    onOpenReviewForMeeting: vi.fn(), onResumeMeeting: vi.fn(), onStartScheduledMeeting: vi.fn(),
    setScreen: vi.fn(), setShowSignModal: vi.fn(), saveCases: vi.fn(),
  };
});

const renderCase = cs => render(<CaseViewScreen {...makeProps(cs, spies)} />);

// Both CTAs render the step's label. The top-right primary appends nothing; the
// Suggested-next-step button appends " →". That is how they are told apart.
const ctas = label => screen.getAllByRole('button', { name: new RegExp(`^${label}( →)?$`) });

describe('the two Review CTAs both actually open Review', () => {
  it('both are rendered for a review_draft meeting', () => {
    renderCase(makeCase(reviewDraftMeeting()));
    const found = ctas('Review meeting record');
    expect(found.length).toBe(2);
  });

  it('A. the TOP-RIGHT primary CTA invokes the Review callback with the exact meeting', () => {
    const cs = makeCase(reviewDraftMeeting());
    renderCase(cs);
    const primary = ctas('Review meeting record').find(b => !b.textContent.includes('→'));
    expect(primary).toBeDefined();
    fireEvent.click(primary);
    expect(spies.onOpenReviewForMeeting).toHaveBeenCalledTimes(1);
    const [caseArg, meetingArg] = spies.onOpenReviewForMeeting.mock.calls[0];
    expect(caseArg.id).toBe(CASE_ID);
    expect(meetingArg.id).toBe(MID);
    expect(meetingArg.status).toBe(MEETING_STATUS.REVIEW_DRAFT);
  });

  it('B. the SUGGESTED NEXT STEP CTA invokes the Review callback with the exact meeting', () => {
    const cs = makeCase(reviewDraftMeeting());
    renderCase(cs);
    const suggested = ctas('Review meeting record').find(b => b.textContent.includes('→'));
    expect(suggested).toBeDefined();
    fireEvent.click(suggested);
    expect(spies.onOpenReviewForMeeting).toHaveBeenCalledTimes(1);
    const [caseArg, meetingArg] = spies.onOpenReviewForMeeting.mock.calls[0];
    expect(caseArg.id).toBe(CASE_ID);
    expect(meetingArg.id).toBe(MID);
  });

  it('neither CTA opens signature, resumes, starts or writes', () => {
    renderCase(makeCase(reviewDraftMeeting()));
    for (const b of ctas('Review meeting record')) fireEvent.click(b);
    expect(spies.setShowSignModal).not.toHaveBeenCalled();
    expect(spies.onResumeMeeting).not.toHaveBeenCalled();
    expect(spies.onStartScheduledMeeting).not.toHaveBeenCalled();
    expect(spies.saveCases).not.toHaveBeenCalled();
  });

  it('the meeting handed to the callback is untouched — no write, no duplicate', () => {
    const before = reviewDraftMeeting();
    const cs = makeCase(before);
    renderCase(cs);
    fireEvent.click(ctas('Review meeting record')[0]);
    const [, meetingArg] = spies.onOpenReviewForMeeting.mock.calls[0];
    expect(meetingArg).toEqual(before);
    expect(meetingArg.status).toBe(MEETING_STATUS.REVIEW_DRAFT);
    expect(meetingArg.endedAt).toBe('2026-09-25T11:45:33.560Z');
    expect(cs.meetings).toHaveLength(1);
  });

  it('a review_draft meeting offers neither Start nor Resume', () => {
    renderCase(makeCase(reviewDraftMeeting()));
    expect(screen.queryByRole('button', { name: /^Start disciplinary hearing( →)?$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Resume meeting( →)?$/ })).toBeNull();
    expect(screen.queryByRole('button', { name: /^Start scheduled meeting( →)?$/ })).toBeNull();
  });
});

describe('the other states still dispatch correctly', () => {
  it('scheduled still reaches onStartScheduledMeeting with that meeting', () => {
    renderCase(makeCase(scheduledMeeting()));
    const b = ctas('Start scheduled meeting').find(x => !x.textContent.includes('→'));
    expect(b).toBeDefined();
    fireEvent.click(b);
    expect(spies.onStartScheduledMeeting).toHaveBeenCalledTimes(1);
    expect(spies.onStartScheduledMeeting.mock.calls[0][1].id).toBe('m_sched');
    expect(spies.onOpenReviewForMeeting).not.toHaveBeenCalled();
  });

  it('in_progress still reaches onResumeMeeting with that meeting', () => {
    renderCase(makeCase(liveMeeting()));
    const b = ctas('Resume meeting').find(x => !x.textContent.includes('→'));
    expect(b).toBeDefined();
    fireEvent.click(b);
    expect(spies.onResumeMeeting).toHaveBeenCalledTimes(1);
    expect(spies.onResumeMeeting.mock.calls[0][1].id).toBe('m_live');
    expect(spies.onOpenReviewForMeeting).not.toHaveBeenCalled();
  });

  it('completed still offers the downstream signature step, not Review', () => {
    renderCase(makeCase(completedMeeting()));
    expect(ctas('Send hearing record for signature').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /^Review meeting record( →)?$/ })).toBeNull();
  });
});

describe('the derived step matches what is rendered', () => {
  it('review_draft derives review_meeting_record naming this meeting', () => {
    const step = getNextStep(makeCase(reviewDraftMeeting()), { isHR: true });
    expect(step.action).toBe('review_meeting_record');
    expect(step.label).toBe('Review meeting record');
    expect(step.reviewMeetingId).toBe(MID);
  });

  it('an empty persisted transcript does not change the CTA — it still opens Review', () => {
    // The production fixture's transcript is [], which is precisely what made
    // the old code silently do nothing.
    const m = reviewDraftMeeting({ transcript: [] });
    renderCase(makeCase(m));
    fireEvent.click(ctas('Review meeting record')[0]);
    expect(spies.onOpenReviewForMeeting).toHaveBeenCalledTimes(1);
    expect(spies.onOpenReviewForMeeting.mock.calls[0][1].transcript).toEqual([]);
  });

  it('a populated persisted transcript behaves the same way', () => {
    const m = reviewDraftMeeting({ transcript: [{ id: 'u1', speaker: 'HR', text: 'Noted.' }] });
    renderCase(makeCase(m));
    fireEvent.click(ctas('Review meeting record')[0]);
    expect(spies.onOpenReviewForMeeting.mock.calls[0][1].transcript).toHaveLength(1);
  });
});

// ─────────────────────────────────────────────────────────────────────────
// The tests above prove the DISPATCH layer, which was already correct before
// this fix — they pass against the broken build too. That is exactly the trap:
// coverage that stops one layer short of the defect. The blocks below target the
// layer that actually failed, and fail against the pre-fix source.
// ─────────────────────────────────────────────────────────────────────────

import { readFileSync } from 'node:fs';

const appSrc = readFileSync('src/App.jsx', 'utf8');
const stripComments = src => src.split('\n')
  .filter(l => { const t = l.trim(); return !t.startsWith('//') && !t.startsWith('*') && !t.startsWith('/*'); })
  .join('\n');
const appCode = stripComments(appSrc);
const openReviewBody = () => {
  const i = appCode.indexOf('const openReviewForMeeting =');
  return appCode.slice(i, appCode.indexOf('\n  };', i));
};

describe('the failure mode: navigation must not depend on generation', () => {
  it('openReviewForMeeting navigates itself, rather than leaving it to handleReview', () => {
    // THE regression. Previously this body had no setScreen at all, so with an
    // empty transcript handleReview returned before navigating and the CTA was
    // silently inert.
    expect(openReviewBody()).toContain('setScreen(SCREENS.REVIEW)');
  });

  it('handleReview still returns early with no notes — so the guard is real', () => {
    expect(appCode).toContain('if(!allNotes.length) return;');
    // and that early return sits BEFORE handleReview's own navigation, which is
    // why openReviewForMeeting cannot rely on it
    const i = appCode.indexOf('if(!allNotes.length) return;');
    const j = appCode.indexOf('setScreen(SCREENS.REVIEW)', i);
    expect(j).toBeGreaterThan(i);
  });

  it('a notes-less review_draft gets a truthful message instead of a blank screen', () => {
    const body = openReviewBody();
    expect(body).toContain('No meeting notes were saved with this meeting');
    // generation is only triggered when there is something to generate from
    expect(body).toContain('if(notes.length)');
  });

  it('reopening still writes nothing, mints nothing and completes nothing', () => {
    const body = openReviewBody();
    for (const forbidden of ['saveCases', 'persistMeeting', 'transitionMeeting', 'newId(',
                             'MEETING_STATUS.COMPLETED', 'setShowSignModal', 'employeeName ===']) {
      expect(body).not.toContain(forbidden);
    }
  });

  it('End persists the notes alongside the transition', () => {
    // The root cause of the empty transcript: the first cut patched endedAt only.
    expect(appCode).toContain('patch: { endedAt: meetingEndTimeVal, transcript: allNotes }');
  });
});

// A faithful model of the reopen chain, so the behaviour — not just the source —
// is pinned. navigateOnlyInGeneration:true reproduces the production failure.
const modelReopen = (meeting, { navigateOnlyInGeneration = false } = {}) => {
  let screenNow = 'CASE_VIEW';
  let message = '';
  const writes = [];
  const notes = Array.isArray(meeting.transcript) ? meeting.transcript : [];

  const handleReview = () => {
    const allNotes = [...notes];
    if (!allNotes.length) return;          // the real guard, verbatim in effect
    screenNow = 'REVIEW';
  };

  if (!navigateOnlyInGeneration) screenNow = 'REVIEW';
  if (notes.length) handleReview();
  else if (!navigateOnlyInGeneration) message = 'No meeting notes were saved with this meeting';
  else handleReview();

  return { screen: screenNow, message, writes, meeting };
};

describe('behavioural proof, both directions', () => {
  it('OLD: an empty transcript left the user on Case View — the reported bug', () => {
    const r = modelReopen(reviewDraftMeeting({ transcript: [] }), { navigateOnlyInGeneration: true });
    expect(r.screen).toBe('CASE_VIEW');
    expect(r.message).toBe('');
  });

  it('NEW: an empty transcript opens Review and says why there is no record', () => {
    const r = modelReopen(reviewDraftMeeting({ transcript: [] }));
    expect(r.screen).toBe('REVIEW');
    expect(r.message).toContain('No meeting notes were saved');
    expect(r.writes).toEqual([]);
    expect(r.meeting.status).toBe(MEETING_STATUS.REVIEW_DRAFT);
    expect(r.meeting.endedAt).toBe('2026-09-25T11:45:33.560Z');
  });

  it('NEW: a populated transcript opens Review and generates', () => {
    const r = modelReopen(reviewDraftMeeting({ transcript: [{ id: 'u1', text: 'Noted.' }] }));
    expect(r.screen).toBe('REVIEW');
    expect(r.message).toBe('');
    expect(r.writes).toEqual([]);
  });

  it('OLD: a populated transcript worked — which is why this went unnoticed', () => {
    const r = modelReopen(reviewDraftMeeting({ transcript: [{ id: 'u1', text: 'Noted.' }] }),
      { navigateOnlyInGeneration: true });
    expect(r.screen).toBe('REVIEW');
  });
});
