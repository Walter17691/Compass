import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  // 'intake' — nothing investigated yet, matching the real seeded demo
  // case this whole pass was audited against (getCaseStage returns
  // "intake" for a misconduct case with zero meetings logged).
  caseCtx: { cases: [cs], saveCases: noop, stage: 'intake', currentRisk: null, empRecord: null, repeatCount: 0 },
  shell: { setScreen: noop, screens: {}, confirmDialog: noop },
  caseData: { caseSignals: [], caseTasks: [], allegations: [], auditLog: [], wellbeingNotes: [], dueSoon: [], processTemplates: [], caseAccess: [], orgMembers: [], hrReviewRequests: [] },
  caseActions: { changeSignalStatus: noop, createCaseTask: noop, onAskWhy: noop, linkSignalToAllegation: noop, requestOverrideReason: noop, requestPolicyDeviationReason: noop },
  caseIntel: { unansweredCovered: [], unansweredLoading: false, generateUnansweredQuestions: noop, generateInconsistencies: noop, inconsistencyLoading: false },
  oh: { ohReportFindings: [], ohReportAnalysisLoading: false, onAnalyseOhReport: noop, onAcceptOhFinding: noop, onDismissOhFinding: noop, onSendForSignature: noop },
  review: { isApprover: false, respondToReview: noop, resolveInvestigationReview: noop, assignCaseRole: noop },
  automation: { automationLevels: {}, onResendReminder: noop },
};

describe('OverviewTab — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the risk/exposure fields once genuinely relevant (redundancy, no stage gate)', () => {
    const redundancyCase = { ...cs, caseType: 'redundancy' };
    render(<OverviewTab {...baseProps} cs={redundancyCase} caseCtx={{ ...baseProps.caseCtx, cases: [redundancyCase] }} />);
    expect(screen.getByLabelText('Weekly pay (£, gross)')).toBeInTheDocument();
    expect(screen.getByLabelText('Age (optional)')).toBeInTheDocument();
  });

  it('labels the key-dates fields once genuinely relevant (long-term sickness, probation, suspension already entered)', () => {
    const sicknessCase = { ...cs, caseType: 'long_term_sickness', probationReviewDate: '2026-04-01', suspensionReviewDate: '2026-03-01' };
    render(<OverviewTab {...baseProps} cs={sicknessCase} caseCtx={{ ...baseProps.caseCtx, cases: [sicknessCase] }} />);
    expect(screen.getByLabelText('Fit note expires')).toBeInTheDocument();
    expect(screen.getByLabelText('OH referral date')).toBeInTheDocument();
    expect(screen.getByLabelText('Probation review')).toBeInTheDocument();
    expect(screen.getByLabelText('Suspension review')).toBeInTheDocument();
  });

  it('labels the OH report received date field once a referral date is set', () => {
    const csWithReferral = { ...cs, ohReferralDate: '2026-01-01' };
    render(<OverviewTab {...baseProps} cs={csWithReferral} caseCtx={{ ...baseProps.caseCtx, cases: [csWithReferral] }} />);
    expect(screen.getByLabelText('OH report received')).toBeInTheDocument();
  });
});

// UAT Product Hierarchy pass, Part 2, re-audited on human review — a
// capability existing in Compass is not sufficient reason to display it.
// An ordinary misconduct case at intake (nothing investigated yet) shows
// none of Risk & tribunal exposure or Key dates by default. There is no
// generic "reveal everything" escape hatch any more — every field has its
// own genuine contextual trigger, except suspensionReviewDate, which has
// no authoritative signal anywhere in the data model and keeps one small,
// narrowly-scoped reveal of its own (never bundled with unrelated fields).
describe('OverviewTab — contextual visibility of risk & key dates (UAT Product Hierarchy pass, Part 2)', () => {
  it('hides Risk & tribunal exposure and Key dates by default for an ordinary case at intake', () => {
    render(<OverviewTab {...baseProps} />);
    expect(screen.queryByText('Risk & tribunal exposure')).not.toBeInTheDocument();
    expect(screen.queryByText('Key dates')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Weekly pay (£, gross)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fit note expires')).not.toBeInTheDocument();
    expect(screen.queryByText('+ Add risk & key date tracking for this case')).not.toBeInTheDocument();
  });

  it('offers only the one narrow suspension reveal when nothing else is relevant, not a generic catch-all', () => {
    render(<OverviewTab {...baseProps} />);
    const link = screen.getByText('+ Record a suspension');
    fireEvent.click(link);
    expect(screen.getByLabelText('Suspension review')).toBeInTheDocument();
    // Nothing else gets revealed alongside it — this is not the old
    // bundled "add everything" escape hatch.
    expect(screen.queryByText('Risk & tribunal exposure')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Fit note expires')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Probation review')).not.toBeInTheDocument();
  });

  it('shows Risk & tribunal exposure without being asked once a figure is already entered', () => {
    const csWithPay = { ...cs, estimatedWeeklyPay: 500 };
    render(<OverviewTab {...baseProps} cs={csWithPay} caseCtx={{ ...baseProps.caseCtx, cases: [csWithPay] }} />);
    expect(screen.getByText('Risk & tribunal exposure')).toBeInTheDocument();
    expect(screen.getByLabelText('Weekly pay (£, gross)')).toHaveValue(500);
  });

  it('shows Risk & tribunal exposure once real investigative work has started, well before any disciplinary hearing', () => {
    render(<OverviewTab {...baseProps} caseCtx={{ ...baseProps.caseCtx, stage: 'investigation' }} />);
    expect(screen.getByText('Risk & tribunal exposure')).toBeInTheDocument();
  });

  it('shows Risk & tribunal exposure for a redundancy case from day one — no disciplinary hearing concept applies', () => {
    const redundancyCase = { ...cs, caseType: 'redundancy' };
    render(<OverviewTab {...baseProps} cs={redundancyCase} caseCtx={{ ...baseProps.caseCtx, cases: [redundancyCase], stage: 'intake' }} />);
    expect(screen.getByText('Risk & tribunal exposure')).toBeInTheDocument();
  });

  it('shows Risk & tribunal exposure for an appeal case regardless of stage — the exposure is already crystallised', () => {
    const appealCase = { ...cs, caseType: 'appeal' };
    render(<OverviewTab {...baseProps} cs={appealCase} caseCtx={{ ...baseProps.caseCtx, cases: [appealCase], stage: 'intake' }} />);
    expect(screen.getByText('Risk & tribunal exposure')).toBeInTheDocument();
  });

  it('shows Risk & tribunal exposure for a discrimination grievance, which carries standalone exposure independent of any hearing', () => {
    const discriminationCase = { ...cs, caseType: 'discrimination' };
    render(<OverviewTab {...baseProps} cs={discriminationCase} caseCtx={{ ...baseProps.caseCtx, cases: [discriminationCase], stage: 'intake' }} />);
    expect(screen.getByText('Risk & tribunal exposure')).toBeInTheDocument();
  });

  it('shows Risk & tribunal exposure for a whistleblowing grievance for the same reason', () => {
    const whistleblowCase = { ...cs, caseType: 'whistleblowing' };
    render(<OverviewTab {...baseProps} cs={whistleblowCase} caseCtx={{ ...baseProps.caseCtx, cases: [whistleblowCase], stage: 'intake' }} />);
    expect(screen.getByText('Risk & tribunal exposure')).toBeInTheDocument();
  });

  it('does not show Risk & tribunal exposure for an ordinary grievance with no discrimination/whistleblowing marker', () => {
    const grievanceCase = { ...cs, caseType: 'grievance' };
    render(<OverviewTab {...baseProps} cs={grievanceCase} caseCtx={{ ...baseProps.caseCtx, cases: [grievanceCase] }} />);
    expect(screen.queryByText('Risk & tribunal exposure')).not.toBeInTheDocument();
  });

  it('shows the fit note field for a long-term sickness case without any value entered yet', () => {
    const sicknessCase = { ...cs, caseType: 'long_term_sickness' };
    render(<OverviewTab {...baseProps} cs={sicknessCase} caseCtx={{ ...baseProps.caseCtx, cases: [sicknessCase] }} />);
    expect(screen.getByLabelText('Fit note expires')).toBeInTheDocument();
    expect(screen.getByLabelText('OH referral date')).toBeInTheDocument();
    // Suspension isn't relevant to a sickness case unless a value already
    // exists — never inferred from case type.
    expect(screen.queryByLabelText('Suspension review')).not.toBeInTheDocument();
  });

  it('shows fit note/OH fields for a misconduct case when real wellbeing notes exist for this employee', () => {
    const wellbeingNotes = [{ employeeName: cs.employeeName, type: 'general', content: 'Employee mentioned a health concern.' }];
    render(<OverviewTab {...baseProps} caseData={{ ...baseProps.caseData, wellbeingNotes }} />);
    expect(screen.getByLabelText('Fit note expires')).toBeInTheDocument();
    expect(screen.getByLabelText('OH referral date')).toBeInTheDocument();
  });

  it('shows a value someone already entered even if the case type would not otherwise surface it', () => {
    const csWithSuspension = { ...cs, suspensionReviewDate: '2026-03-01' };
    render(<OverviewTab {...baseProps} cs={csWithSuspension} caseCtx={{ ...baseProps.caseCtx, cases: [csWithSuspension] }} />);
    expect(screen.getByLabelText('Suspension review')).toBeInTheDocument();
  });

  it('does not show the Occupational Health Process disclosure for an ordinary case at intake', () => {
    render(<OverviewTab {...baseProps} />);
    expect(screen.queryByText('Occupational health process')).not.toBeInTheDocument();
  });

  it('shows the Occupational Health Process disclosure once real OH progress exists', () => {
    const csWithOh = { ...cs, ohProcess: { currentStep: 'referral_sent' } };
    render(<OverviewTab {...baseProps} cs={csWithOh} caseCtx={{ ...baseProps.caseCtx, cases: [csWithOh] }} />);
    expect(screen.getByText('Occupational health process')).toBeInTheDocument();
  });
});

// Phase 7.5B (P0 polish, item 4) — "what is this case about" (the
// Description card) must render before Risk & Tribunal Exposure and Key
// Dates, not after them, so a reader hits the narrative before the
// financial/administrative inputs. Same card, same content, same empty
// state — asserted here as DOM order, the one thing a plain
// presence-only test wouldn't catch.
describe('OverviewTab — card order (Phase 7.5B, item 4)', () => {
  // Risk & tribunal exposure is hidden by default for an ordinary case
  // (UAT Product Hierarchy pass, Part 2), so these order checks use a case
  // with a weekly pay figure already entered, which makes the card
  // genuinely relevant and visible without changing what's under test.
  const csWithPay = { ...cs, estimatedWeeklyPay: 500 };
  const propsWithPay = { ...baseProps, cs: csWithPay, caseCtx: { ...baseProps.caseCtx, cases: [csWithPay] } };

  it('renders the Description card before Risk & tribunal exposure', () => {
    const { container } = render(<OverviewTab {...propsWithPay} />);
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
    const csWithDescriptionAndPay = { ...csWithPay, description: 'Employee raised a concern about a colleague.' };
    const { container } = render(<OverviewTab {...propsWithPay} cs={csWithDescriptionAndPay} caseCtx={{ ...baseProps.caseCtx, cases: [csWithDescriptionAndPay] }} />);
    const text = container.textContent;
    expect(screen.getByText('Employee raised a concern about a colleague.')).toBeInTheDocument();
    expect(text.indexOf('Employee raised a concern about a colleague.')).toBeLessThan(text.indexOf('Risk & tribunal exposure'));
  });
});
