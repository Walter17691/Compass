import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
