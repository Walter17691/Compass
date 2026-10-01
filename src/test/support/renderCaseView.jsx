import { render } from '@testing-library/react';
import { CaseViewScreen } from '../../screens/CaseViewScreen.jsx';

// ─────────────────────────────────────────────────────────────────────────
// Shared Case View render harness.
//
// Extracted during the Wave B.2 corrective pass, after a missing import crashed
// the Case View in production for 252 cases and no test caught it because every
// guardrail assertion read source text instead of rendering the screen.
//
// The standard for critical UI is now: render it. This exists so doing that is
// cheap enough that there is no excuse not to.
// ─────────────────────────────────────────────────────────────────────────

const noop = () => {};

export const renderCase = (caseOverrides = {}, { nextStep = null, stage = 'disciplinary', extraShell = {}, meetingsTabOverrides = {}, overviewOverrides = {} } = {}) => {
  const theCase = {
    id: 'c1', employeeName: 'Sam Employee', manager: 'Alex Manager',
    meetings: [], evidence: [], confidential: false, caseType: 'misconduct', ...caseOverrides,
  };
  const shell = {
    cases: [theCase], activeCaseId: 'c1', setScreen: noop, confirmDialog: noop,
    getCaseStage: () => stage, getNextStep: () => nextStep, fmtDate: d => d || '',
    getProceedingTitle: () => 'Disciplinary Investigation',
    getCaseStatus: () => ({ label: 'Disciplinary record in review', color: '#000', bg: '#fff' }),
    setMeetingSetup: noop, getEmployeeRecord: () => null, orgMembers: [], setCaseInfo: noop,
    saveCases: noop, setReviewOutput: noop, setMeetingType: noop, showToast: noop,
    currentUser: { user_id: 'u1', name: 'Test User' }, setLetterOutput: noop, handleLetter: noop,
    isHR: true, caseAccess: [], allegations: [], auditLog: [], caseTasks: [], createCaseTask: noop,
    caseSignals: [], changeSignalStatus: noop, toggleCaseTaskDone: noop, setShowHandoffModal: noop,
    setShowAppealOfficerModal: noop, generateInvestigationPlan: noop, investigationPlanLoading: {},
    ...extraShell,
  };
  const header = {
    showAppealInput: {}, setShowAppealInput: noop, appealText: {}, setAppealText: noop,
    recordAppealReceived: async () => true, setShowReassignModal: noop, setShowAssignInvestigatorModal: noop,
    setShowOutcomeModal: noop, setShowSignModal: noop, letterOutput: '', aiProcessing: false, aiError: null,
    toggleNextStepDone: noop, concludingInvestigation: false, attemptSubmitInvestigation: noop,
    openEscalateModal: noop, openHrInterventionModal: noop, generateNextBestAction: noop,
    nextActionLoading: {}, changesSinceView: [], changesSummary: '', changesSummaryLoading: false,
  };
  const overview = {
    linkSignalToAllegation: noop, requestOverrideReason: noop, requestPolicyDeviationReason: noop,
    assignCaseRole: noop, hrReviewRequests: [], respondToReview: noop, resolveInvestigationReview: noop,
    wellbeingNotes: [], dueSoon: [], processTemplates: [], unansweredCovered: [], unansweredLoading: false,
    generateUnansweredQuestions: noop, generateInconsistencies: noop, inconsistencyLoading: {},
    ohReportFindings: [], ohReportAnalysisLoading: false, onAnalyseOhReport: noop, onAcceptOhFinding: noop,
    onDismissOhFinding: noop, onSendForSignature: noop, automationLevels: {}, onResendReminder: noop,
    ...overviewOverrides,
  };
  return render(<CaseViewScreen
    shell={shell} header={header} overview={overview} initialTab={null} clearInitialTab={noop} deleteCaseTask={noop}
    timeline={{ toggleTimelineExclude: noop, editTimelineDescription: noop, generateTimelineRelevance: noop, timelineRelevanceLoading: {}, loadJsPDF: noop }}
    allegationsTab={{ createAllegation: noop, patchAllegation: noop, changeAllegationStatus: noop, deleteAllegation: noop,
      evidenceSuggestions: {}, evidenceSuggestionsLoading: {}, generateEvidenceSuggestions: noop, acceptEvidenceSuggestion: noop,
      rejectEvidenceSuggestion: noop, generateAppealReview: noop, appealReviewLoading: false, recordAppealOutcome: noop,
      policies: [], consistencyReview: {}, consistencyReviewLoading: false, generateConsistencyReview: noop }}
    meetingsTab={{ activeCaseStage: null, setActiveCaseStage: noop, onAcceptSavedSuggestion: noop, onDismissSavedSuggestion: noop, ...meetingsTabOverrides }}
    evidenceTab={{ documentFindings: {}, documentAnalysisLoading: {}, analyseEvidenceDocument: noop, acceptDocumentFinding: noop, dismissDocumentFinding: noop, removeEvidence: noop }}
    documentsTab={{ onGenerateHearingPack: noop, hearingPackGenerating: {}, onDraftCorrespondence: noop }}
    themesTab={{ organisationThemes: [], caseThemes: [], themeSuggestions: {}, themeSuggestionLoading: {}, onSuggestThemes: noop,
      onConfirmThemeSuggestion: noop, onDismissThemeSuggestion: noop, onAssignExistingTheme: noop, onRemoveTheme: noop }}
    aiTab={{ caseChatHistory: {}, caseChatInput: '', setCaseChatInput: noop, caseChatProcessing: false, sendCaseChat: noop,
      caseOverview: {}, caseOverviewLoading: {}, generateCaseOverview: noop, caseOverviewSources: {} }}
  />);
};

