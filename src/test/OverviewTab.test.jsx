import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverviewTab } from '../components/caseTabs/OverviewTab.jsx';

// Phase 6.5 hardening (Batch 13) — the risk/exposure and key-dates fields
// each had a visual <label> with no htmlFor/id association. Had no test
// coverage at all before this.
//
// Phase 6.5 hardening (Batch 10b, task #205) — OverviewTab's 43 flat
// props are now 9 grouped objects (cs stays flat). Each group defaults
// to {} in the component itself.
const noop = () => {};
const cs = { id: 'c1', caseType: 'misconduct', employeeName: 'Sam Employee' };

const baseProps = {
  cs,
  caseCtx: { cases: [cs], saveCases: noop, stage: 'investigation', currentRisk: null, empRecord: null, repeatCount: 0 },
  shell: { setScreen: noop, screens: {}, confirmDialog: noop },
  caseData: { caseSignals: [], caseTasks: [], allegations: [], auditLog: [], wellbeingNotes: [], dueSoon: [], processTemplates: [], caseAccess: [], orgMembers: [], hrReviewRequests: [] },
  caseActions: { changeSignalStatus: noop, createCaseTask: noop, onAskWhy: noop, linkSignalToAllegation: noop, requestOverrideReason: noop, requestPolicyDeviationReason: noop },
  caseIntel: { unansweredCovered: [], unansweredLoading: false, generateUnansweredQuestions: noop, generateInconsistencies: noop, inconsistencyLoading: false },
  oh: { ohReportFindings: [], ohReportAnalysisLoading: false, onAnalyseOhReport: noop, onAcceptOhFinding: noop, onDismissOhFinding: noop, onSendForSignature: noop },
  review: { isApprover: false, respondToReview: noop, resolveInvestigationReview: noop, assignCaseRole: noop },
  automation: { automationLevels: {}, onResendReminder: noop },
};

describe('OverviewTab — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the risk/exposure and key-dates fields', () => {
    render(<OverviewTab {...baseProps} />);
    expect(screen.getByLabelText('Weekly pay (£, gross)')).toBeInTheDocument();
    expect(screen.getByLabelText('Age (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Fit note expires')).toBeInTheDocument();
    expect(screen.getByLabelText('Probation review')).toBeInTheDocument();
    expect(screen.getByLabelText('OH referral date')).toBeInTheDocument();
    expect(screen.getByLabelText('Suspension review')).toBeInTheDocument();
  });

  it('labels the OH report received date field once a referral date is set', () => {
    const csWithReferral = { ...cs, ohReferralDate: '2026-01-01' };
    render(<OverviewTab {...baseProps} cs={csWithReferral} caseCtx={{ ...baseProps.caseCtx, cases: [csWithReferral] }} />);
    expect(screen.getByLabelText('OH report received')).toBeInTheDocument();
  });
});

// Phase 7.5B (P0 polish, item 4) — "what is this case about" (the
// Description card) must render before Risk & Tribunal Exposure and Key
// Dates, not after them, so a reader hits the narrative before the
// financial/administrative inputs. Same card, same content, same empty
// state — asserted here as DOM order, the one thing a plain
// presence-only test wouldn't catch.
describe('OverviewTab — card order (Phase 7.5B, item 4)', () => {
  it('renders the Description card before Risk & tribunal exposure', () => {
    const { container } = render(<OverviewTab {...baseProps} />);
    const text = container.textContent;
    expect(text.indexOf('Description')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('Risk & tribunal exposure')).toBeGreaterThanOrEqual(0);
    expect(text.indexOf('Description')).toBeLessThan(text.indexOf('Risk & tribunal exposure'));
  });

  it('still shows the honest empty state when no description is recorded', () => {
    render(<OverviewTab {...baseProps} />);
    expect(screen.getByText('No description recorded.')).toBeInTheDocument();
  });

  it('renders a real description above Risk & tribunal exposure when one exists', () => {
    const csWithDescription = { ...cs, description: 'Employee raised a concern about a colleague.' };
    const { container } = render(<OverviewTab {...baseProps} cs={csWithDescription} caseCtx={{ ...baseProps.caseCtx, cases: [csWithDescription] }} />);
    const text = container.textContent;
    expect(screen.getByText('Employee raised a concern about a colleague.')).toBeInTheDocument();
    expect(text.indexOf('Employee raised a concern about a colleague.')).toBeLessThan(text.indexOf('Risk & tribunal exposure'));
  });
});
