import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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
};

const tabs = [
  // UAT Product Hierarchy pass, Part 2 — Weekly pay/Risk & tribunal
  // exposure no longer renders by default for an ordinary misconduct
  // investigation (it's contextual now, not unconditional), so the
  // marker for this tab is "Description", which always renders.
  ['overview', 'Description'],
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
    // Phase 2A — the proceeding title now shares a text node with the
    // owner metadata ("Disciplinary Investigation · Owner: Alex
    // Manager"), so this matches on the substring rather than the exact
    // string the line used to be alone.
    expect(screen.getByText(/Disciplinary Investigation/)).toBeInTheDocument();
  });

  // Phase 7.5B (P0 polish, item 3) — employee identity must be the
  // visually primary heading (larger, bold display weight), case type/
  // proceeding title secondary (smaller, muted) — the exact inverse of
  // the pre-polish styling. Asserted on the actual rendered style, not
  // just presence of both strings, since presence alone doesn't lock in
  // which one is primary. Visual Identity pass (rail-reference revision)
  // — the display font is now Archivo (FONT.serif in styles/tokens.js,
  // same family as FONT.sans — hierarchy comes from weight/tracking, not
  // a separate display family); the primary/secondary hierarchy this
  // test actually locks in is unchanged.
  it('gives the employee name the primary heading style and the proceeding title a secondary style', () => {
    render(<CaseViewScreen {...baseProps} />);
    const name = screen.getByText('Sam Employee');
    const proceedingTitle = screen.getByText(/Disciplinary Investigation/);
    expect(name.style.fontFamily).toContain('Archivo');
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

// Phase 2A (Compass Design Vision) — the 12 tabs are now rendered
// grouped (Case / Work / Decision) rather than as one flat row, purely a
// rendering-order change (TAB_GROUPS in CaseViewScreen.jsx). This proves
// the partition is actually complete in the real rendered output — every
// one of the 12 original tab labels is still a real, clickable button —
// rather than trusting the module's own "these three lists partition
// TABS completely" comment.
// IA & User Journey pass, §11 — the permanent row is reduced to
// Overview/Timeline/Evidence; the other nine tabs move behind a "More"
// popover, grouped under the same Case/Work/Decision labels the old flat
// row used (MORE_GROUPS derives from TAB_GROUPS, so the partition can't
// silently drop a tab). No route, id, or active-tab logic changed here —
// only which control reaches each tab.
describe('CaseViewScreen — Overview/Timeline/Evidence + More navigation (IA & User Journey pass, §11)', () => {
  it('renders exactly Overview, Timeline and Evidence as permanent tabs, plus a More trigger', () => {
    render(<CaseViewScreen {...baseProps} />);
    expect(screen.getByRole('button', { name: 'Overview' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Timeline' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Evidence' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'More' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Allegations' })).not.toBeInTheDocument();
  });

  it('reveals the other nine tabs, grouped under Case/Work/Decision, once More is opened', async () => {
    const user = userEvent.setup();
    render(<CaseViewScreen {...baseProps} />);
    await user.click(screen.getByRole('button', { name: 'More' }));
    expect(screen.getByRole('menu', { name: 'More case tabs' })).toBeInTheDocument();
    const remainingLabels = ['Allegations','Meetings','Participants','Tasks','Documents','Communications','Themes','Outcome','AI Assistant'];
    for (const label of remainingLabels) {
      expect(screen.getByRole('button', { name: new RegExp(`^${label}`) })).toBeInTheDocument();
    }
    expect(screen.getByText('Case')).toBeInTheDocument();
    expect(screen.getByText('Work')).toBeInTheDocument();
    expect(screen.getByText('Decision')).toBeInTheDocument();
  });

  it('switching tabs still works through More — clicking Allegations shows the Allegations tab body and closes the popover', async () => {
    const user = userEvent.setup();
    render(<CaseViewScreen {...baseProps} />);
    await user.click(screen.getByRole('button', { name: 'More' }));
    await user.click(screen.getByRole('button', { name: 'Allegations' }));
    expect(screen.getByText(/No allegations recorded yet/)).toBeInTheDocument();
    expect(screen.queryByRole('menu', { name: 'More case tabs' })).not.toBeInTheDocument();
  });

  it('shows the active tab\'s own label on the More trigger when a "more" tab is selected, so context is not lost', async () => {
    const user = userEvent.setup();
    render(<CaseViewScreen {...baseProps} />);
    await user.click(screen.getByRole('button', { name: 'More' }));
    // Two "Allegations" buttons exist for a moment: the popover item just
    // clicked, and the trigger this click is about to relabel — scope to
    // the popover explicitly to avoid ambiguity.
    await user.click(within(screen.getByRole('menu', { name: 'More case tabs' })).getByRole('button', { name: 'Allegations' }));
    expect(screen.getByRole('button', { name: 'Allegations' })).toHaveAttribute('aria-haspopup', 'true');
  });
});

// Phase 2A — the five equal-weight header buttons (Mark confidential,
// Reassign, Assign investigator, HR Intervention, +New meeting) become
// one primary action + a "More actions" menu. Every one of the original
// actions must still exist and call the exact same handler — this
// exercises the real ActionMenu component, not just checking labels are
// present as text.
describe('CaseViewScreen — header ActionMenu (Phase 2A)', () => {
  it('shows "+ New meeting" as the primary action when there is no next step, and every other action inside "More actions"', async () => {
    const user = userEvent.setup();
    render(<CaseViewScreen {...baseProps} />);
    expect(screen.getByRole('button', { name: '+ New meeting' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /More actions/ }));
    const menu = screen.getByRole('menu', { name: /More actions/ });
    expect(screen.getByRole('menuitem', { name: 'Mark confidential' })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Reassign/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /Assign investigator/ })).toBeInTheDocument();
    expect(screen.getByRole('menuitem', { name: /HR Intervention/ })).toBeInTheDocument();
    expect(menu).toBeInTheDocument();
  });

  it('clicking "Reassign" in the menu calls the exact same setShowReassignModal handler the old header button called', async () => {
    const setShowReassignModal = vi.fn();
    const user = userEvent.setup();
    render(<CaseViewScreen {...baseProps} header={{ ...baseProps.header, setShowReassignModal }} />);
    await user.click(screen.getByRole('button', { name: /More actions/ }));
    await user.click(screen.getByRole('menuitem', { name: /Reassign/ }));
    expect(setShowReassignModal).toHaveBeenCalledWith(true);
  });

  it('uses the real next-step action as the primary button when one exists, and offers +New meeting from the menu instead', async () => {
    const attemptSubmitInvestigation = vi.fn();
    const user = userEvent.setup();
    const props = {
      ...baseProps,
      shell: { ...baseProps.shell, getNextStep: () => ({ label: 'Submit investigation report', action: 'inv_report' }) },
      header: { ...baseProps.header, attemptSubmitInvestigation },
    };
    render(<CaseViewScreen {...props} />);
    const primary = screen.getByRole('button', { name: 'Submit investigation report' });
    expect(primary).toBeInTheDocument();
    await user.click(primary);
    expect(attemptSubmitInvestigation).toHaveBeenCalledWith('c1');
    // +New meeting moved into the menu since it's no longer primary.
    await user.click(screen.getByRole('button', { name: /More actions/ }));
    expect(screen.getByRole('menuitem', { name: '+ New meeting' })).toBeInTheDocument();
  });
});

// Case Closure Safety P0 remediation — every user-triggered close on this
// screen now goes through one shared requestCloseCase gate: it re-checks
// getNextStep(cs) (never a second, invented appeal-readiness model),
// shows a real confirmDialog with warnings built from the already-
// computed readiness/computeDueSoon signals, and only writes+audits after
// a genuinely successful save.
describe('CaseViewScreen — case closure safety (Case Closure Safety P0)', () => {
  const appealReadyNextStep = { label: 'Appeal outcome issued — close case', action: 'close_case', reason: 'The appeal is the final stage — nothing further to issue.' };
  const appealIncompleteNextStep = { label: 'Send appeal record for signature', action: 'send_signature', reason: 'The employee should confirm the appeal hearing record is accurate.' };

  function closureProps(overrides = {}) {
    return {
      ...baseProps,
      shell: { ...baseProps.shell, getCaseStage: () => 'appeal', confirmDialog: vi.fn(), saveCases: vi.fn(), showToast: vi.fn(), audit: vi.fn(), ...overrides },
    };
  }

  it('HARD BLOCKS closing an incomplete appeal: no confirm dialog, no save, no audit — surfaces the real next-step reason instead', async () => {
    const user = userEvent.setup();
    const props = closureProps({ getNextStep: () => appealIncompleteNextStep });
    render(<CaseViewScreen {...props} />);
    await user.click(screen.getByRole('button', { name: 'Close case' }));
    expect(props.shell.confirmDialog).not.toHaveBeenCalled();
    expect(props.shell.saveCases).not.toHaveBeenCalled();
    expect(props.shell.audit).not.toHaveBeenCalled();
    expect(props.shell.showToast).toHaveBeenCalledWith(expect.stringContaining('Send appeal record for signature'), 'error');
  });

  it('shows a confirmation (never claiming reopening is possible) and closes once the appeal is genuinely complete', async () => {
    const user = userEvent.setup();
    const props = closureProps({
      getNextStep: () => appealReadyNextStep,
      confirmDialog: vi.fn().mockResolvedValue(true),
      saveCases: vi.fn().mockResolvedValue({ ok: true }),
    });
    render(<CaseViewScreen {...props} />);
    await user.click(screen.getByRole('button', { name: 'Close case' }));
    expect(props.shell.confirmDialog).toHaveBeenCalledTimes(1);
    const dialogArgs = props.shell.confirmDialog.mock.calls[0][0];
    // Honest about irreversibility is fine ("no general way to reopen");
    // what must never appear is a claim that reopening IS possible/easy.
    expect(dialogArgs.message).not.toMatch(/you can .*reopen|reopen.*if needed|simply reopen/i);
    expect(props.shell.saveCases).toHaveBeenCalledTimes(1);
    const [savedArray, changedId] = props.shell.saveCases.mock.calls[0];
    expect(changedId).toBe('c1');
    expect(savedArray.find(c => c.id === 'c1').stage).toBe('closed');
    expect(props.shell.audit).toHaveBeenCalledWith('Case closed', expect.stringContaining('appeal'), 'c1');
    expect(props.shell.showToast).toHaveBeenCalledWith('Case closed');
  });

  it('cancelling the confirmation performs no save and no audit', async () => {
    const user = userEvent.setup();
    const props = closureProps({
      getNextStep: () => appealReadyNextStep,
      confirmDialog: vi.fn().mockResolvedValue(false),
      saveCases: vi.fn().mockResolvedValue({ ok: true }),
    });
    render(<CaseViewScreen {...props} />);
    await user.click(screen.getByRole('button', { name: 'Close case' }));
    expect(props.shell.confirmDialog).toHaveBeenCalledTimes(1);
    expect(props.shell.saveCases).not.toHaveBeenCalled();
    expect(props.shell.audit).not.toHaveBeenCalled();
  });

  it('a stale/conflicting save (optimistic concurrency) never produces a closure audit event', async () => {
    const user = userEvent.setup();
    const props = closureProps({
      getNextStep: () => appealReadyNextStep,
      confirmDialog: vi.fn().mockResolvedValue(true),
      saveCases: vi.fn().mockResolvedValue({ ok: false, reason: 'conflict' }),
    });
    render(<CaseViewScreen {...props} />);
    await user.click(screen.getByRole('button', { name: 'Close case' }));
    expect(props.shell.saveCases).toHaveBeenCalledTimes(1);
    expect(props.shell.audit).not.toHaveBeenCalled();
    expect(props.shell.showToast).not.toHaveBeenCalledWith('Case closed');
  });

  it('surfaces open case tasks and live deadlines as warnings inside the same confirmation, not as separate blockers', async () => {
    const user = userEvent.setup();
    const props = {
      ...baseProps,
      shell: {
        ...baseProps.shell,
        getCaseStage: () => 'appeal',
        getNextStep: () => appealReadyNextStep,
        caseTasks: [{ id: 't1', caseId: 'c1', status: 'open', name: 'Chase signature' }],
        confirmDialog: vi.fn().mockResolvedValue(true),
        saveCases: vi.fn().mockResolvedValue({ ok: true }),
        audit: vi.fn(),
        showToast: vi.fn(),
      },
    };
    render(<CaseViewScreen {...props} />);
    await user.click(screen.getByRole('button', { name: 'Close case' }));
    const dialogArgs = props.shell.confirmDialog.mock.calls[0][0];
    expect(dialogArgs.message).toMatch(/case task/i);
    // Still closes — a warning, not a hard block.
    expect(props.shell.saveCases).toHaveBeenCalledTimes(1);
  });

  it('double-clicking the close button only opens one confirmation and performs one save', async () => {
    const user = userEvent.setup();
    let resolveConfirm;
    const confirmDialog = vi.fn(() => new Promise(res => { resolveConfirm = res; }));
    const props = closureProps({ getNextStep: () => appealReadyNextStep, confirmDialog, saveCases: vi.fn().mockResolvedValue({ ok: true }) });
    render(<CaseViewScreen {...props} />);
    const btn = screen.getByRole('button', { name: 'Close case' });
    await user.click(btn);
    await user.click(btn); // fired again while the first confirm is still pending
    resolveConfirm(true);
    await new Promise(r => setTimeout(r, 0));
    expect(props.shell.confirmDialog).toHaveBeenCalledTimes(1);
    expect(props.shell.saveCases).toHaveBeenCalledTimes(1);
  });

  it('the "No case to answer — close" path confirms, closes, and only then opens the letter draft (no duplicate letters on cancel)', async () => {
    const user = userEvent.setup();
    const handleLetter = vi.fn();
    const props = {
      ...baseProps,
      shell: {
        ...baseProps.shell,
        getCaseStage: () => 'inv_report',
        getNextStep: () => ({ label: 'Proceed to disciplinary — send invitation', action: 'disciplinary_invite', secondary: { label: 'No case to answer — close', action: 'close_no_case' } }),
        confirmDialog: vi.fn().mockResolvedValue(true),
        saveCases: vi.fn().mockResolvedValue({ ok: true }),
        audit: vi.fn(),
        showToast: vi.fn(),
        handleLetter,
      },
    };
    render(<CaseViewScreen {...props} />);
    await user.click(screen.getByRole('button', { name: 'No case to answer — close' }));
    expect(props.shell.saveCases).toHaveBeenCalledTimes(1);
    // Defect #20 remediation — handleLetter now receives employee/manager
    // directly rather than relying on its own closure over caseInfo state.
    expect(handleLetter).toHaveBeenCalledWith('no-case-answer', { inline: true, employeeName: 'Sam Employee', manager: 'Alex Manager' });
    expect(props.shell.audit).toHaveBeenCalledWith('Case closed', expect.stringContaining('no case to answer'), 'c1');
  });

  it('cancelling "No case to answer — close" performs no save and never opens the letter draft', async () => {
    const user = userEvent.setup();
    const handleLetter = vi.fn();
    const props = {
      ...baseProps,
      shell: {
        ...baseProps.shell,
        getCaseStage: () => 'inv_report',
        getNextStep: () => ({ label: 'Proceed to disciplinary — send invitation', action: 'disciplinary_invite', secondary: { label: 'No case to answer — close', action: 'close_no_case' } }),
        confirmDialog: vi.fn().mockResolvedValue(false),
        saveCases: vi.fn(),
        handleLetter,
      },
    };
    render(<CaseViewScreen {...props} />);
    await user.click(screen.getByRole('button', { name: 'No case to answer — close' }));
    expect(props.shell.saveCases).not.toHaveBeenCalled();
    expect(handleLetter).not.toHaveBeenCalled();
  });
});

// Defect #17 remediation — the Outcome tab's own always-available
// "Draft outcome letter" route, exercised through the real CaseViewScreen
// (not just the OutcomeTab unit in isolation), using the exact Golden
// Path production shape: outcome decided, hearing record unsigned, no
// letter ever saved. Proves the restored route grounds caseInfo/
// reviewOutput/meetingType from the case's own hearing meeting and calls
// the one shared handleLetter("outcome", {inline:true}) pipeline — the
// same call every other letter-drafting path already uses — without
// writing cs.stage or touching cs.outcome.
describe('CaseViewScreen — Outcome tab "Draft outcome letter" route (Defect #17)', () => {
  const goldenPathShapedCase = {
    id: 'c1', employeeName: 'UAT - Test Employee (Golden Path)', manager: 'Walter Carta',
    caseType: 'misconduct', confidential: false, outcome: 'First written warning',
    outcomeIssuedAt: '2026-09-07T00:00:00.000Z', warningDurationMonths: 6, warningExpiresAt: '2027-03-07',
    evidence: [],
    meetings: [
      { type: 'Investigation', date: '2026-09-07', record: 'the investigation record', signStatus: null },
      { type: 'Disciplinary', date: '2026-09-07', record: 'the disciplinary hearing record', signStatus: null },
    ],
  };

  it('is offered and, on click, grounds the letter from the case\'s own hearing meeting and drafts via the shared handleLetter pipeline — no signature send, no re-issue, no stage write required', async () => {
    const user = userEvent.setup();
    const handleLetter = vi.fn();
    const setCaseInfo = vi.fn();
    const setReviewOutput = vi.fn();
    const saveCases = vi.fn();
    const props = {
      ...baseProps,
      shell: {
        ...baseProps.shell,
        cases: [goldenPathShapedCase],
        getCaseStage: () => 'outcome',
        getNextStep: () => ({ label: 'Draft outcome letter', action: 'outcome_letter', meetingType: 'disciplinary' }),
        setCaseInfo, setReviewOutput, saveCases, handleLetter,
      },
      initialTab: 'outcome',
    };
    render(<CaseViewScreen {...props} />);
    // Scoped to the Outcome tab's own panel — the Copilot banner/compact
    // header also render a same-labelled primary action for this same
    // nextStep in this fixture, which is expected (see the "unavoidable
    // consequence of correcting #17" note in the remediation report); this
    // test targets the Outcome tab's own durable, always-available route.
    const outcomePanel = within(screen.getByText('Outcome issued').parentElement);
    await user.click(outcomePanel.getByRole('button', { name: 'Draft outcome letter' }));
    // Defect #20 remediation — handleLetter now receives employee/manager/
    // date directly rather than relying on its own closure over caseInfo
    // state (which the setCaseInfo call just above hasn't flushed into yet
    // at the moment handleLetter itself runs).
    expect(handleLetter).toHaveBeenCalledWith('outcome', { inline: true, employeeName: 'UAT - Test Employee (Golden Path)', manager: 'Walter Carta', date: '2026-09-07' });
    expect(setReviewOutput).toHaveBeenCalledWith('the disciplinary hearing record');
    // No stage write: getCaseStage already infers "outcome" from
    // cs.outcome directly (caseStage.js) — this route has no business
    // deciding a stage, unlike the Copilot's own outcome_letter next-step
    // handler (which does write stage:"outcome", preserved unchanged).
    expect(saveCases).not.toHaveBeenCalled();
  });

  it('remains reachable even though the hearing record is unsigned and the case has never been sent for signature', async () => {
    const props = {
      ...baseProps,
      shell: {
        ...baseProps.shell,
        cases: [goldenPathShapedCase],
        getCaseStage: () => 'outcome',
        getNextStep: () => ({ label: 'Draft outcome letter', action: 'outcome_letter', meetingType: 'disciplinary' }),
      },
      initialTab: 'outcome',
    };
    render(<CaseViewScreen {...props} />);
    expect(goldenPathShapedCase.meetings.every(m => m.signStatus !== 'signed')).toBe(true);
    const outcomePanel = within(screen.getByText('Outcome issued').parentElement);
    expect(outcomePanel.getByRole('button', { name: 'Draft outcome letter' })).toBeInTheDocument();
  });
});
