import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { InvestigatorChecklistView } from '../components/InvestigatorChecklistView.jsx';

// Manager Enablement (Phase 4, MP7, §7) — assignInvestigator now accepts a
// scope (specific allegations, a target completion date, a short note);
// this covers the one piece of new logic that isn't just plumbing:
// scopedAllegations' null-vs-array distinction in InvestigatorChecklistView
// itself. Same component-testing rationale as MP2/MP3's own restricted-view
// tests — this view only ever renders for a distinct non-HR identity the
// shared E2E account can't produce.
const noop = () => {};
const cs = { id: 'c1', employeeName: 'Sam Employee', evidence: [] };
const allegations = [
  { id: 'a1', caseId: 'c1', title: 'Unauthorised absence' },
  { id: 'a2', caseId: 'c1', title: 'Falsified expenses' },
];

const baseProps = {
  cs,
  caseAllegations: allegations,
  checklistTasks: [],
  toggleCaseTaskDone: noop,
  openQuestions: [],
  onStartWitnessInterview: noop,
  onStartEmployeeInterview: noop,
  setScreen: noop,
  screens: { CASES: 'cases' },
  fmtDate: d => d,
};

describe('InvestigatorChecklistView — assignment scope (MP7)', () => {
  it('shows every allegation when scopeAllegationIds is null (pre-MP7 assignment, or a scope-less caller)', () => {
    render(<InvestigatorChecklistView {...baseProps} />);
    expect(screen.getByText('Unauthorised absence')).toBeInTheDocument();
    expect(screen.getByText('Falsified expenses')).toBeInTheDocument();
  });

  it('narrows the allegations list to just the assigned subset when scopeAllegationIds is set', () => {
    render(<InvestigatorChecklistView {...baseProps} scopeAllegationIds={['a1']} />);
    expect(screen.getByText('Unauthorised absence')).toBeInTheDocument();
    expect(screen.queryByText('Falsified expenses')).not.toBeInTheDocument();
  });

  it('shows the target completion date and scope note when set', () => {
    render(<InvestigatorChecklistView {...baseProps} targetCompletionDate="2026-09-01" scopeNote="Focus on the expenses claim first." />);
    expect(screen.getByText(/Due 2026-09-01/)).toBeInTheDocument();
    expect(screen.getByText('Focus on the expenses claim first.')).toBeInTheDocument();
  });

  it('renders neither the due date nor a note when they are not set', () => {
    render(<InvestigatorChecklistView {...baseProps} />);
    expect(screen.queryByText(/Due /)).not.toBeInTheDocument();
  });
});

// Manager Enablement (Phase 4, MP8, §9) — the case-specific Investigation
// plan section, distinct from the fixed 7-step checklist above it.
describe('InvestigatorChecklistView — investigation plan (MP8)', () => {
  it('offers to generate a plan when none exists yet', () => {
    render(<InvestigatorChecklistView {...baseProps} planTasks={[]} onGeneratePlan={noop} />);
    expect(screen.getByRole('button', { name: 'Generate investigation plan' })).toBeInTheDocument();
  });

  it('lists plan items and offers to regenerate once a plan exists', () => {
    const planTasks = [
      { id: 'p1', caseId: 'c1', name: 'Interview Priya Shah as a named witness', status: 'open', source: 'investigation_plan' },
      { id: 'p2', caseId: 'c1', name: 'Obtain CCTV footage from the loading bay', status: 'done', source: 'investigation_plan' },
    ];
    render(<InvestigatorChecklistView {...baseProps} planTasks={planTasks} onGeneratePlan={noop} />);
    // The still-open item ("Interview Priya Shah...") is also MP9's own
    // "Compass recommends next" pick, so it legitimately appears twice.
    expect(screen.getAllByText('Interview Priya Shah as a named witness').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('Obtain CCTV footage from the loading bay')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Regenerate plan' })).toBeInTheDocument();
  });

  it('shows a loading state and disables the button while generating', () => {
    render(<InvestigatorChecklistView {...baseProps} planTasks={[]} onGeneratePlan={noop} planLoading={true} />);
    expect(screen.getByRole('button', { name: 'Compass is drafting a plan…' })).toBeDisabled();
  });

  it('toggling a plan item calls toggleCaseTaskDone with its id', async () => {
    const user = userEvent.setup();
    const toggleCaseTaskDone = vi.fn();
    const planTasks = [{ id: 'p1', caseId: 'c1', name: 'Interview Priya Shah', status: 'open', source: 'investigation_plan' }];
    render(<InvestigatorChecklistView {...baseProps} toggleCaseTaskDone={toggleCaseTaskDone} planTasks={planTasks} onGeneratePlan={noop} />);
    // The 7 fixed StepCards above also render "Mark done" toggles (no
    // task assigned to any of them in these base props, so they're all
    // no-op buttons with the same accessible name) — the plan item's own
    // toggle is the last one in document order.
    const toggles = screen.getAllByRole('button', { name: 'Mark done' });
    await user.click(toggles[toggles.length - 1]);
    expect(toggleCaseTaskDone).toHaveBeenCalledWith('p1');
  });

  it('clicking generate/regenerate calls onGeneratePlan', async () => {
    const user = userEvent.setup();
    const onGeneratePlan = vi.fn();
    render(<InvestigatorChecklistView {...baseProps} planTasks={[]} onGeneratePlan={onGeneratePlan} />);
    await user.click(screen.getByRole('button', { name: 'Generate investigation plan' }));
    expect(onGeneratePlan).toHaveBeenCalledTimes(1);
  });
});

// Manager Enablement (Phase 4, MP9, §8) — the deterministic "Compass
// recommends next" banner, computeInvestigatorRecommendation's own
// priority order (guardrail > plan > checklist) surfaced in the view
// that actually reads it.
describe('InvestigatorChecklistView — Compass recommends next (MP9)', () => {
  it('surfaces an unresolved guardrail ahead of an open plan item', () => {
    const caseSignals = [{ id: 's1', caseId: 'c1', type: 'process_risk', status: 'open', title: 'Appeal Manager made the original decision' }];
    const planTasks = [{ id: 'p1', caseId: 'c1', name: 'Interview Priya Shah', status: 'open', source: 'investigation_plan' }];
    render(<InvestigatorChecklistView {...baseProps} caseSignals={caseSignals} planTasks={planTasks} onGeneratePlan={noop} />);
    expect(screen.getByText('Compass recommends next')).toBeInTheDocument();
    expect(screen.getByText('Resolve a flagged procedural guardrail: "Appeal Manager made the original decision"')).toBeInTheDocument();
  });

  it('recommends the next open plan item when there are no guardrails', () => {
    const planTasks = [{ id: 'p1', caseId: 'c1', name: 'Obtain CCTV footage from the loading bay', status: 'open', source: 'investigation_plan' }];
    render(<InvestigatorChecklistView {...baseProps} planTasks={planTasks} onGeneratePlan={noop} />);
    // "Obtain CCTV footage..." also appears once as the plan item's own
    // list entry below — the recommendation banner is a second match.
    expect(screen.getAllByText('Obtain CCTV footage from the loading bay').length).toBeGreaterThanOrEqual(2);
  });

  it('falls back to the fixed checklist when there is no plan or guardrail yet', () => {
    render(<InvestigatorChecklistView {...baseProps} planTasks={[]} onGeneratePlan={noop} />);
    expect(screen.getByText('Compass recommends next')).toBeInTheDocument();
    // "Review the allegation(s)" also appears once as StepCard 0's own
    // label — the recommendation banner is a second, legitimate match.
    expect(screen.getAllByText('Review the allegation(s)').length).toBeGreaterThanOrEqual(2);
  });

  it('renders no banner once everything is resolved', () => {
    const checklistTasks = [
      { name: 'Review the allegation(s)', status: 'done' }, { name: 'Review the evidence', status: 'done' },
      { name: 'Interview witnesses', status: 'done' }, { name: 'Interview the employee', status: 'done' },
      { name: 'Review outstanding questions', status: 'done' }, { name: 'Complete the investigation', status: 'done' },
      { name: 'Submit findings to HR', status: 'done' },
    ];
    render(<InvestigatorChecklistView {...baseProps} checklistTasks={checklistTasks} planTasks={[]} onGeneratePlan={noop} />);
    expect(screen.queryByText('Compass recommends next')).not.toBeInTheDocument();
  });
});

// Manager Enablement (Phase 4, MP10, §16) — "Submit findings to HR" used
// to be an inert checkbox; it now runs the same attemptSubmitInvestigation
// gate (App.jsx) both of HR's own trigger points use.
describe('InvestigatorChecklistView — submit investigation (MP10)', () => {
  it('offers a real submit button on the final step when not yet submitted', async () => {
    const user = userEvent.setup();
    const onSubmitInvestigation = vi.fn();
    render(<InvestigatorChecklistView {...baseProps} planTasks={[]} onGeneratePlan={noop} onSubmitInvestigation={onSubmitInvestigation} />);
    await user.click(screen.getByRole('button', { name: 'Submit investigation' }));
    expect(onSubmitInvestigation).toHaveBeenCalledWith('c1');
  });

  it('shows a submitted confirmation instead of the button once the step is marked done', () => {
    const checklistTasks = [{ id: 't1', name: 'Submit findings to HR', status: 'done' }];
    render(<InvestigatorChecklistView {...baseProps} checklistTasks={checklistTasks} planTasks={[]} onGeneratePlan={noop} onSubmitInvestigation={noop} />);
    expect(screen.getByText('Submitted to HR.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Submit investigation' })).not.toBeInTheDocument();
  });

  it('disables the button and shows a submitting state while in flight', () => {
    render(<InvestigatorChecklistView {...baseProps} planTasks={[]} onGeneratePlan={noop} onSubmitInvestigation={noop} submittingInvestigation={true} />);
    expect(screen.getByRole('button', { name: 'Submitting…' })).toBeDisabled();
  });

  it('renders no submit affordance at all when onSubmitInvestigation is not provided', () => {
    render(<InvestigatorChecklistView {...baseProps} planTasks={[]} onGeneratePlan={noop} />);
    expect(screen.queryByRole('button', { name: 'Submit investigation' })).not.toBeInTheDocument();
  });
});

// Manager Enablement (Phase 4, MP12, §13) — "Ask HR", available here too
// since the investigator's restricted view never reaches CaseViewScreen's
// own header, where the same persistent affordance also lives.
describe('InvestigatorChecklistView — Ask HR (MP12)', () => {
  it('shows an Ask HR button when onEscalate is provided, and calls it on click', async () => {
    const user = userEvent.setup();
    const onEscalate = vi.fn();
    render(<InvestigatorChecklistView {...baseProps} planTasks={[]} onGeneratePlan={noop} onEscalate={onEscalate} />);
    await user.click(screen.getByRole('button', { name: 'Ask HR' }));
    expect(onEscalate).toHaveBeenCalledTimes(1);
  });

  it('renders no Ask HR affordance when onEscalate is not provided', () => {
    render(<InvestigatorChecklistView {...baseProps} planTasks={[]} onGeneratePlan={noop} />);
    expect(screen.queryByRole('button', { name: 'Ask HR' })).not.toBeInTheDocument();
  });
});
