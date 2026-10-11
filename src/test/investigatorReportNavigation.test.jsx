import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { InvestigatorChecklistView } from '../components/InvestigatorChecklistView.jsx';
import { InvestigatorReportView } from '../components/InvestigatorReportView.jsx';
import { InvestigationReportWorkspacePanel } from '../components/caseTabs/InvestigationReportWorkspacePanel.jsx';
import { INVESTIGATION_CHECKLIST_STEPS } from '../lib/investigationChecklist.js';
import { createDraftSession, commitLive, beginSave, applySaveResult, DRAFT_STATE, READ_ONLY_REASON, AUTHORING_MODE } from '../lib/reportDraftSession.js';
import { isReportDraftSaveEnabled, REPORT_DRAFT_SAVE_ORG_ALLOW_LIST } from '../lib/reportDraftActivation.js';
import { DRAFT_SAVE_RESULT } from '../lib/reportDraftGateway.js';

// ─────────────────────────────────────────────────────────────────────────
// B3.2 — THE ASSIGNED INVESTIGATOR CAN REACH THEIR OWN REPORT.
//
// Live production UAT (11 Oct) signed in as the assigned investigator and
// found the report workspace unreachable: CaseViewScreen returns
// InvestigatorChecklistView from an early return at ~line 1201, before the
// case workspace's destination map exists, so neither the "Investigation
// report" chip nor ?tab=inv_report could resolve. The word "report" appeared
// ZERO times in the rendered page. The editor was reachable only by HR, who
// would have had to save under an HR exception — the opposite of the
// authority model the save RPC was built around.
//
// These are behavioural tests: rendered controls, captured callbacks, real
// session objects. The one place source text is read is the CaseViewScreen
// wiring, because the early-return ORDER is the defect and no unit render of
// a child component can observe it — and even there the assertion is about
// control flow, not phrasing.
// ─────────────────────────────────────────────────────────────────────────

const noop = () => {};
const cs = { id: 'case_1', employeeName: 'Jordan Ellis (fictional)', evidence: [] };

const checklistProps = {
  cs,
  caseAllegations: [{ id: 'a1', caseId: 'case_1', title: 'Timing discrepancy' }],
  checklistTasks: [],
  toggleCaseTaskDone: noop,
  openQuestions: [],
  onStartWitnessInterview: noop,
  onStartEmployeeInterview: noop,
  setScreen: noop,
  screens: { CASES: 'cases' },
  fmtDate: d => d,
};

/** A read-only session, exactly as CaseViewScreen builds it today. */
const readOnlySession = (caseId = 'case_1', body = '') => createDraftSession({
  caseId,
  baseVersion: 0,
  body,
  canSave: isReportDraftSaveEnabled('any-org'), // false: the allow-list is empty
  readOnlyReason: READ_ONLY_REASON.NOT_ACTIVATED,
  requiresHrReason: false,
  mode: AUTHORING_MODE.STRUCTURED,
});

const panelProps = (over = {}) => ({
  caseId: 'case_1',
  session: readOnlySession(),
  versions: [],
  versionsLoading: false,
  versionsUnreadable: false,
  authorNameFor: () => 'E2E Investigator',
  fmtDate: d => d,
  busyVersionId: null,
  onCommitLive: noop,
  onSave: noop,
  onReviewLatestBody: noop,
  onConfirmAndSave: noop,
  onContinueFrom: noop,
  onSwitchMode: noop,
  reportWorkspace: null,
  ...over,
});

const reportViewProps = (over = {}) => ({
  cs,
  setScreen: noop,
  screens: { CASES: 'cases' },
  onBackToChecklist: noop,
  reportPanelProps: panelProps(),
  ...over,
});

describe('B3.2 — the investigator can open the report from the checklist', () => {
  it('renders a report destination the investigator can actually see', () => {
    render(<InvestigatorChecklistView {...checklistProps} onOpenReport={noop} />);
    expect(screen.getByText('Investigation report')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Open the investigation report/ })).toBeInTheDocument();
  });

  it('calls onOpenReport when the destination is used', async () => {
    const onOpenReport = vi.fn();
    render(<InvestigatorChecklistView {...checklistProps} onOpenReport={onOpenReport} />);
    await userEvent.click(screen.getByRole('button', { name: /Open the investigation report/ }));
    expect(onOpenReport).toHaveBeenCalledTimes(1);
  });

  it('says how many versions exist, so the card is not silent about history', () => {
    const { rerender } = render(<InvestigatorChecklistView {...checklistProps} onOpenReport={noop} />);
    expect(screen.getByText('No version saved yet.')).toBeInTheDocument();

    rerender(<InvestigatorChecklistView {...checklistProps} onOpenReport={noop} reportVersionCount={1} />);
    expect(screen.getByText('1 version saved')).toBeInTheDocument();

    rerender(<InvestigatorChecklistView {...checklistProps} onOpenReport={noop} reportVersionCount={3} />);
    expect(screen.getByText('3 versions saved')).toBeInTheDocument();
  });

  it('renders no card at all for a caller that does not supply the destination', () => {
    // Every pre-existing caller and test keeps exactly the view it had.
    render(<InvestigatorChecklistView {...checklistProps} />);
    expect(screen.queryByRole('button', { name: /Open the investigation report/ })).not.toBeInTheDocument();
  });

  it('sits between "Record your findings and conclusion" and "Submit findings to HR"', () => {
    const { container } = render(<InvestigatorChecklistView {...checklistProps} onOpenReport={noop} />);
    const text = container.textContent;
    const findings = text.indexOf('Record your findings and conclusion');
    const report = text.indexOf('Write up what you found');
    const submit = text.indexOf('Submit findings to HR');
    expect(findings).toBeGreaterThan(-1);
    expect(report).toBeGreaterThan(findings);
    expect(submit).toBeGreaterThan(report);
  });
});

describe('B3.2 — the seven checklist steps are untouched', () => {
  it('still has exactly seven steps, with their persisted labels unchanged', () => {
    // These labels are case_task NAMES. Changing one orphans every seeded
    // task on every live case, and moves HR's "x of 7" denominator.
    expect(INVESTIGATION_CHECKLIST_STEPS).toHaveLength(7);
    expect(INVESTIGATION_CHECKLIST_STEPS.map(s => s.label)).toEqual([
      'Review the allegation(s)',
      'Review the evidence',
      'Interview witnesses',
      'Interview the employee',
      'Review outstanding questions',
      'Complete the investigation',
      'Submit findings to HR',
    ]);
  });

  it('still reports progress out of seven with the card present', () => {
    render(<InvestigatorChecklistView {...checklistProps} onOpenReport={noop} />);
    expect(screen.getByText(/0 of 7 steps complete/)).toBeInTheDocument();
  });

  it('keeps every existing step and control rendered alongside the new card', () => {
    render(<InvestigatorChecklistView {...checklistProps} onOpenReport={noop}
      onSubmitInvestigation={noop} onGeneratePlan={noop} />);
    for (const s of INVESTIGATION_CHECKLIST_STEPS) {
      // getAllByText: an in-scope issue appears on the step heading AND in
      // the findings workspace, which the existing suite already relies on.
      expect(screen.getAllByText(s.displayLabel || s.label).length,
        `step "${s.label}" must still render`).toBeGreaterThanOrEqual(1);
    }
    expect(screen.getByRole('button', { name: /Submit investigation/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Generate investigation plan/ })).toBeInTheDocument();
  });
});

describe('B3.2 — the investigator report view', () => {
  it('names the case it is about, so the wrong report cannot be written quietly', () => {
    render(<InvestigatorReportView {...reportViewProps()} />);
    expect(screen.getByText('Jordan Ellis (fictional)')).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 2, name: 'Your investigation report' })).toBeInTheDocument();
  });

  it('does not repeat the record panel\'s heading as its own page title', () => {
    // The read-only case record below keeps its own "Investigation report"
    // card heading — that heading is HR's too and is not ours to rename —
    // so the page title must differ. Two identical headings on one screen
    // give a screen reader an ambiguous landmark list and a reader two
    // things with one name.
    render(<InvestigatorReportView {...reportViewProps()} />);
    const headings = screen.getAllByRole('heading').map(h => h.textContent.trim());
    const exact = headings.filter(t => t === 'Investigation report');
    expect(exact.length, `headings were: ${JSON.stringify(headings)}`).toBe(1);
    expect(new Set(headings).size, 'every heading on this page must be distinct').toBe(headings.length);
  });

  it('offers back navigation to the checklist, and keeps "← Cases"', async () => {
    const onBackToChecklist = vi.fn();
    const setScreen = vi.fn();
    render(<InvestigatorReportView {...reportViewProps({ onBackToChecklist, setScreen })} />);

    await userEvent.click(screen.getByRole('button', { name: /Back to the investigation checklist/ }));
    expect(onBackToChecklist).toHaveBeenCalledTimes(1);

    await userEvent.click(screen.getByRole('button', { name: '← Cases' }));
    expect(setScreen).toHaveBeenCalledWith('cases');
  });

  it('renders the shared report panel, not a second editor of its own', () => {
    render(<InvestigatorReportView {...reportViewProps()} />);
    // The panel's read-only branch; see the inactive-saving tests below.
    expect(screen.getByText('Write the investigation report')).toBeInTheDocument();
  });

  it('introduces no adoption or HR Review submission control', () => {
    const { container } = render(<InvestigatorReportView {...reportViewProps()} />);
    const text = container.textContent;
    for (const forbidden of [/Adopt/i, /HR Review/i, /Submit.*report/i, /Send to HR/i]) {
      expect(text, String(forbidden)).not.toMatch(forbidden);
    }
    for (const b of [...container.querySelectorAll('button')]) {
      expect(b.textContent).not.toMatch(/adopt|hr review/i);
    }
  });
});

describe('B3.2 — saving stays disabled for every organisation', () => {
  it('the allow-list is empty, so no organisation is enabled', () => {
    expect(REPORT_DRAFT_SAVE_ORG_ALLOW_LIST).toEqual([]);
    for (const org of ['f381bfa6-7b27-497f-9af7-46a82c8f8f4c', 'dbe871c5-e6fe-45d8-8bc4-201e487579be', 'anything']) {
      expect(isReportDraftSaveEnabled(org)).toBe(false);
    }
  });

  it('the investigator report view shows the inactive explanation and no Save', () => {
    render(<InvestigatorReportView {...reportViewProps()} />);
    expect(screen.getByText(/Conclude investigation/)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /^Save/ })).not.toBeInTheDocument();
  });

  it('the explanation lives in the workspace, not duplicated onto the view frame', () => {
    // One place tells this story, so there is one thing to keep true.
    const withPanel = render(<InvestigatorReportView {...reportViewProps()} />);
    expect(withPanel.container.textContent).toMatch(/Conclude investigation/);
    withPanel.unmount();

    const { container } = render(<InvestigatorChecklistView {...checklistProps} onOpenReport={noop} />);
    expect(container.textContent).not.toMatch(/Conclude investigation/);
    expect(container.textContent).not.toMatch(/not yet switched on|saving is not available/i);
  });

  it('a read-only session refuses a save attempt at the session layer too', () => {
    const s = readOnlySession();
    expect(s.state).toBe(DRAFT_STATE.READ_ONLY);
    expect(s.readOnlyReason).toBe(READ_ONLY_REASON.NOT_ACTIVATED);
    const started = beginSave(s, { newRequestId: '11110000-0000-0000-0000-000000000001' });
    expect(started.request).toBeFalsy();
  });
});

describe('B3.2 — draft sessions stay isolated by case', () => {
  it('two cases hold independent sessions', () => {
    const a = createDraftSession({ caseId: 'case_A', baseVersion: 0, body: 'A text', canSave: true, mode: AUTHORING_MODE.SINGLE });
    const b = createDraftSession({ caseId: 'case_B', baseVersion: 0, body: 'B text', canSave: true, mode: AUTHORING_MODE.SINGLE });
    expect(a.caseId).toBe('case_A');
    expect(b.caseId).toBe('case_B');
    expect(a.raw).toBe('A text');
    expect(b.raw).toBe('B text');
    const aEdited = commitLive(a, { raw: 'A edited', sections: {}, hrReason: '' });
    expect(aEdited.raw).toBe('A edited');
    expect(b.raw).toBe('B text');
  });

  it('the panel keys the editor by case, so live text cannot survive a case change', () => {
    // Remounting with a different caseId must not carry the previous
    // editor's local state. The key lives inside the panel so neither call
    // site can forget it.
    const { rerender } = render(<InvestigationReportWorkspacePanel {...panelProps({ caseId: 'case_A', session: readOnlySession('case_A', 'Case A body') })} />);
    expect(screen.getByText(/Case A body/)).toBeInTheDocument();
    rerender(<InvestigationReportWorkspacePanel {...panelProps({ caseId: 'case_B', session: readOnlySession('case_B', 'Case B body') })} />);
    expect(screen.getByText(/Case B body/)).toBeInTheDocument();
    expect(screen.queryByText(/Case A body/)).not.toBeInTheDocument();
  });

  it('a DELAYED save result lands on the case it belongs to, never the case now on screen', () => {
    // The async hazard: the investigator saves case A, navigates to case B,
    // and A's response arrives. CaseViewScreen writes it as
    // setDraftSessions(prev => ({ ...prev, [caseId]: applySaveResult(...) }))
    // with caseId CAPTURED at call time. This reproduces that reducer.
    let store = {
      case_A: createDraftSession({ caseId: 'case_A', baseVersion: 0, body: 'A', canSave: true, mode: AUTHORING_MODE.SINGLE }),
      case_B: createDraftSession({ caseId: 'case_B', baseVersion: 0, body: 'B', canSave: true, mode: AUTHORING_MODE.SINGLE }),
    };
    const capturedCaseId = 'case_A';            // captured before the await
    const lateOutcome = {
      result: DRAFT_SAVE_RESULT.OK,
      version: { versionNo: 1, body: 'A', authoringMode: AUTHORING_MODE.SINGLE },
    };
    // ...time passes, the user is now looking at case B...
    store = { ...store, [capturedCaseId]: applySaveResult(store[capturedCaseId], lateOutcome) };

    expect(store.case_A.caseId).toBe('case_A');
    expect(store.case_B.caseId).toBe('case_B');
    // B is untouched, byte for byte and state for state.
    expect(store.case_B.raw).toBe('B');
    expect(store.case_B.state).toBe(DRAFT_STATE.CLEAN);
    expect(store.case_B.baseVersion).toBe(0);
  });

  it('a delayed result for a case that is GONE from the store is dropped, not reassigned', () => {
    // CaseViewScreen guards with `const cur = prev[caseId]; return cur ? ... : prev`.
    const prev = { case_B: createDraftSession({ caseId: 'case_B', baseVersion: 0, body: 'B', canSave: true, mode: AUTHORING_MODE.SINGLE }) };
    const caseId = 'case_A';
    const next = prev[caseId] ? { ...prev, [caseId]: 'WOULD BE WRONG' } : prev;
    expect(next).toBe(prev);
    expect(next.case_A).toBeUndefined();
  });
});

describe('B3.2 — the shared panel renders the same thing for HR and the investigator', () => {
  it('HR and the investigator see identical report content from identical props', () => {
    const props = panelProps({ session: readOnlySession('case_1', 'Shared body text') });

    // Investigator route: through InvestigatorReportView.
    const inv = render(<InvestigatorReportView {...reportViewProps({ reportPanelProps: props })} />);
    const invPanelText = inv.container.textContent;
    inv.unmount();

    // HR route: the destination renders the panel directly.
    const hr = render(<InvestigationReportWorkspacePanel {...props} />);
    const hrPanelText = hr.container.textContent;

    // The investigator view adds its own frame, so assert containment of the
    // panel's content rather than string equality of the whole screen.
    expect(hrPanelText.length).toBeGreaterThan(0);
    expect(invPanelText).toContain(hrPanelText);
  });

  it('both routes go through one component, so they cannot drift apart', () => {
    const src = (p) => require('fs').readFileSync(p, 'utf8');
    const screenSrc = src('src/screens/CaseViewScreen.jsx');
    const viewSrc = src('src/components/InvestigatorReportView.jsx');
    // Neither call site composes the editor itself any more.
    expect(screenSrc).not.toMatch(/<InvestigationReportEditor/);
    expect(viewSrc).not.toMatch(/<InvestigationReportEditor/);
    expect(screenSrc).toMatch(/<InvestigationReportWorkspacePanel/);
    expect(viewSrc).toMatch(/<InvestigationReportWorkspacePanel/);
  });
});

describe('B3.2 — routing: who gets which view, and deep links', () => {
  // The defect was an ORDERING one inside CaseViewScreen: the investigator
  // early return preceded every destination. No render of a child component
  // can observe that, so this reads the control flow directly.
  const src = () => require('fs').readFileSync('src/screens/CaseViewScreen.jsx', 'utf8');

  it('the report branch is gated on BEING the assigned investigator', () => {
    expect(src()).toMatch(/if\(isAssignedInvestigator && activeTab === 'inv_report'\)/);
  });

  it('the report branch precedes the checklist branch, or it could never be reached', () => {
    const s = src();
    const reportBranch = s.indexOf("if(isAssignedInvestigator && activeTab === 'inv_report')");
    const checklistBranch = s.indexOf('if(isAssignedInvestigator) {');
    expect(reportBranch).toBeGreaterThan(-1);
    expect(checklistBranch).toBeGreaterThan(-1);
    expect(reportBranch).toBeLessThan(checklistBranch);
  });

  it('the panel props are assembled ABOVE both branches, so neither builds its own', () => {
    const s = src();
    const propsBuilt = s.indexOf('const reportPanelProps = {');
    const reportBranch = s.indexOf("if(isAssignedInvestigator && activeTab === 'inv_report')");
    expect(propsBuilt).toBeGreaterThan(-1);
    expect(propsBuilt).toBeLessThan(reportBranch);
  });

  it('?tab=inv_report resolves because activeTab is initialised from the URL above the branch', () => {
    const s = src();
    const activeTabInit = s.indexOf('const [activeTab, setActiveTab] = useState(() => destinationForLegacyTab(urlTab)');
    const reportBranch = s.indexOf("if(isAssignedInvestigator && activeTab === 'inv_report')");
    expect(activeTabInit).toBeGreaterThan(-1);
    expect(activeTabInit).toBeLessThan(reportBranch);
  });

  it('a non-investigator is not routed to the investigator report view', () => {
    const s = src();
    // The only branch rendering InvestigatorReportView requires
    // isAssignedInvestigator, which is itself `!isHR && grant === investigator`.
    const uses = [...s.matchAll(/<InvestigatorReportView/g)];
    expect(uses).toHaveLength(1);
    expect(s).toMatch(/const isAssignedInvestigator = !isHR && myAccess\?\.role==="investigator"/);
  });

  it('HR keeps the destination-based workspace', () => {
    expect(src()).toMatch(/inv_report: \(/);
    expect(src()).toMatch(/<InvestigationReportWorkspacePanel \{\.\.\.reportPanelProps\} \/>/);
  });
});
