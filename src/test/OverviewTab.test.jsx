import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OverviewTab } from '../components/caseTabs/OverviewTab.jsx';

// Phase 6.5 hardening (Batch 13) — the risk/exposure and key-dates fields
// each had a visual <label> with no htmlFor/id association. Had no test
// coverage at all before this.
const noop = () => {};
const cs = { id: 'c1', caseType: 'misconduct', employeeName: 'Sam Employee' };

const baseProps = {
  cs,
  cases: [cs],
  saveCases: noop,
  stage: 'investigation',
  currentRisk: null,
  empRecord: null,
  repeatCount: 0,
  confirmDialog: noop,
  setScreen: noop,
  screens: {},
  caseSignals: [],
  caseTasks: [],
  unansweredCovered: [],
  unansweredLoading: false,
  generateUnansweredQuestions: noop,
  createCaseTask: noop,
  changeSignalStatus: noop,
  onAskWhy: noop,
  allegations: [],
  generateInconsistencies: noop,
  inconsistencyLoading: false,
  linkSignalToAllegation: noop,
  requestOverrideReason: noop,
  requestPolicyDeviationReason: noop,
  caseAccess: [],
  orgMembers: [],
  assignCaseRole: noop,
  hrReviewRequests: [],
  respondToReview: noop,
  resolveInvestigationReview: noop,
  isApprover: false,
  auditLog: [],
  wellbeingNotes: [],
  dueSoon: [],
  processTemplates: [],
  ohReportFindings: [],
  ohReportAnalysisLoading: false,
  onAnalyseOhReport: noop,
  onAcceptOhFinding: noop,
  onDismissOhFinding: noop,
  onSendForSignature: noop,
  automationLevels: {},
  onResendReminder: noop,
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
    render(<OverviewTab {...baseProps} cs={csWithReferral} cases={[csWithReferral]} />);
    expect(screen.getByLabelText('OH report received')).toBeInTheDocument();
  });
});
