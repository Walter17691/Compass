import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { CaseViewScreen } from '../screens/CaseViewScreen.jsx';

// Phase 6.5 hardening (Batch 10b, task #205) — CaseViewScreen had zero test
// coverage before this, despite being the single largest prop surface in
// the codebase (132 props, 2 of them dead — concludeInvestigation/
// assignInvestigator, removed as part of the same refactor this test
// locks in). Smoke test: render once per workspace tab (via initialTab,
// same deep-link mechanism SettingsScreen/InsightsScreen already use),
// assert one stable string unique to that tab's body — never the tab's
// own nav label, since every tab button renders its label regardless of
// which tab is active (same collision SettingsScreen's own test avoids).
const noop = () => {};
const cs = { id: 'c1', employeeName: 'Sam Employee', manager: 'Alex Manager', meetings: [], evidence: [], confidential: false, caseType: 'misconduct' };
const cases = [cs];

const baseProps = {
  shell: {
    cases, activeCaseId: 'c1', setScreen: noop, confirmDialog: noop, getCaseStage: () => 'investigation',
    getNextStep: () => null, fmtDate: (d) => d || '', getProceedingTitle: () => 'Disciplinary Investigation',
    getCaseStatus: () => ({ label: 'Open', color: '#000', bg: '#fff' }), setMeetingSetup: noop,
    getEmployeeRecord: () => null, orgMembers: [], setCaseInfo: noop, saveCases: noop, setReviewOutput: noop,
    setMeetingType: noop, showToast: noop, currentUser: { user_id: 'u1', name: 'Test User' },
    setLetterOutput: noop, handleLetter: noop, isHR: true, caseAccess: [], allegations: [], auditLog: [],
    caseTasks: [], createCaseTask: noop, caseSignals: [], changeSignalStatus: noop, toggleCaseTaskDone: noop,
    setShowHandoffModal: noop, generateInvestigationPlan: noop, investigationPlanLoading: {},
  },
  header: {
    showAppealInput: {}, setShowAppealInput: noop, appealText: {}, setAppealText: noop,
    setShowReassignModal: noop, setShowAssignInvestigatorModal: noop, setShowOutcomeModal: noop,
    setShowSignModal: noop, letterOutput: '', aiProcessing: false, aiError: null, toggleNextStepDone: noop,
    concludingInvestigation: false, attemptSubmitInvestigation: noop, openEscalateModal: noop,
    openHrInterventionModal: noop, generateNextBestAction: noop, nextActionLoading: {},
    changesSinceView: [], changesSummary: '', changesSummaryLoading: false,
  },
  initialTab: null,
  clearInitialTab: noop,
  deleteCaseTask: noop,
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
  evidenceTab: { documentFindings: {}, documentAnalysisLoading: {}, analyseEvidenceDocument: noop, acceptDocumentFinding: noop, dismissDocumentFinding: noop },
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
};

const tabs = [
  ['overview', 'Weekly pay (£, gross)'],
  ['timeline', undefined], // TimelinePanel has no reliable empty-state string; presence of the tab switch itself (no crash) is the assertion
  ['allegations', 'No allegations recorded yet — add the specific issues under investigation so evidence and the AI overview can be tied to each one.'],
  ['meetings', /No .* meetings yet/],
  ['evidence', 'No evidence added yet'],
  ['people', /Participants \(1\)/], // cs.employeeName always counts as one participant
  ['tasks', 'No tasks yet.'],
  ['documents', 'No letters or files on this case yet.'],
  ['communications', 'No emails, letters or meeting invitations recorded on this case yet.'],
  ['themes', 'No themes applied to this case yet.'],
  ['outcome', /No outcome yet/],
  ['ai', /Generates a structured, neutral summary/],
];

describe('CaseViewScreen — tab smoke test (Phase 6.5, task #205)', () => {
  it('renders the header for a case', () => {
    render(<CaseViewScreen {...baseProps} />);
    expect(screen.getByText('Sam Employee')).toBeInTheDocument();
    expect(screen.getByText('Disciplinary Investigation')).toBeInTheDocument();
  });

  // Phase 7.5B (P0 polish, item 3) — employee identity must be the
  // visually primary heading (larger, DM Serif Display), case type/
  // proceeding title secondary (smaller, muted) — the exact inverse of
  // the pre-polish styling. Asserted on the actual rendered style, not
  // just presence of both strings, since presence alone doesn't lock in
  // which one is primary.
  it('gives the employee name the primary heading style and the proceeding title a secondary style', () => {
    render(<CaseViewScreen {...baseProps} />);
    const name = screen.getByText('Sam Employee');
    const proceedingTitle = screen.getByText('Disciplinary Investigation');
    expect(name.style.fontFamily).toContain('DM Serif Display');
    expect(Number(name.style.fontSize.replace('px',''))).toBeGreaterThan(Number(proceedingTitle.style.fontSize.replace('px','')));
  });

  // Phase 7.5B (P0 polish, item 2) — a direct nav/reload/bookmark to a
  // case URL must show a loading state, never "Case not found", while
  // the org's cases are still loading. Genuine not-found (cases have
  // loaded, id truly isn't in them) must still say so — both branches
  // asserted here so the distinction can't silently collapse back into
  // "always not found" or "always loading".
  describe('loading vs. genuinely not found (Phase 7.5B, item 2)', () => {
    const missingCaseProps = { ...baseProps, shell: { ...baseProps.shell, activeCaseId: 'does-not-exist' } };

    it('shows a loading state, not "Case not found", while cases are still loading', () => {
      render(<CaseViewScreen {...missingCaseProps} shell={{ ...missingCaseProps.shell, casesLoading: true }} />);
      expect(screen.queryByText(/Case not found/)).not.toBeInTheDocument();
    });

    it('shows "Case not found" once cases have loaded and the id genuinely is not among them', () => {
      render(<CaseViewScreen {...missingCaseProps} shell={{ ...missingCaseProps.shell, casesLoading: false }} />);
      expect(screen.getByText(/Case not found/)).toBeInTheDocument();
    });
  });

  for (const [id, expectedText] of tabs) {
    it(`renders the ${id} tab`, () => {
      render(<CaseViewScreen {...baseProps} initialTab={id} />);
      if (expectedText) expect(screen.getByText(expectedText)).toBeInTheDocument();
    });
  }
});
