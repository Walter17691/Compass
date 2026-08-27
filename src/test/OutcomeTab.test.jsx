import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OutcomeTab } from '../components/caseTabs/OutcomeTab.jsx';

const fmtDate = d => d;
const reachedCase = { id: 'c1', employeeName: 'Sarah Jones', caseType: 'Misconduct', outcome: '' };

// Phase 6.5 hardening (Prompt 16 audit, closes finding C1) — the "Issue
// outcome" button used to render unconditionally to anyone who reached
// this tab; canDecide (isHR || case_access.role==="disciplinary_officer",
// the same boundary CaseViewScreen's AllegationsPanel already enforces)
// wasn't wired in at all. The real enforcement is now a DB trigger
// (protect_case_hr_only_columns), so this button gate is UX, not the
// security boundary — but it should still match what the server will
// actually allow, not offer an action guaranteed to fail.
describe('OutcomeTab — canDecide gates the "Issue outcome" action (closes C1)', () => {
  it('shows the Issue outcome button when the caller can decide', () => {
    render(<OutcomeTab cs={reachedCase} stage="disciplinary" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} canDecide={true} />);
    expect(screen.getByRole('button', { name: 'Issue outcome →' })).toBeInTheDocument();
  });

  it('hides the Issue outcome button and explains why when the caller cannot decide', () => {
    render(<OutcomeTab cs={reachedCase} stage="disciplinary" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} canDecide={false} />);
    expect(screen.queryByRole('button', { name: 'Issue outcome →' })).not.toBeInTheDocument();
    expect(screen.getByText(/Only HR or this case's Hearing Manager can issue the outcome/)).toBeInTheDocument();
  });

  it('does not gate the already-issued outcome view — anyone who reaches the tab can see a recorded outcome', () => {
    const decided = { ...reachedCase, outcome: 'Final written warning', outcomeDate: '2026-01-01' };
    render(<OutcomeTab cs={decided} stage="closed" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} canDecide={false} />);
    expect(screen.getByText('Outcome issued')).toBeInTheDocument();
    expect(screen.getByText('Final written warning')).toBeInTheDocument();
  });
});

// Phase 6.5 hardening (closes Prompt 16 audit finding H12, HIGH) — this
// tab's own "reached" check used to hardcode disciplinary/grievance stage
// ids only ("disciplinary"/"hearing"/"outcome"/"appeal"/"closed"), so a
// long-term-sickness or flexible-working case's own late stages could
// never satisfy it — and since cs.outcome can only be set by clicking the
// button this check gates, those cases could never record an outcome at
// all, permanently. Derived generically from the case's own process type
// instead, so this needs no per-type hardcoding.
describe('OutcomeTab — reaches the outcome stage for every process type, not just disciplinary/grievance (Prompt 16 audit, H12)', () => {
  it('shows Issue outcome for a long-term-sickness case at "capability_consideration" (the stage before "decision")', () => {
    const cs = { id: 'c2', employeeName: 'Sam Lee', caseType: 'long-term sickness', outcome: '' };
    render(<OutcomeTab cs={cs} stage="capability_consideration" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} canDecide={true} />);
    expect(screen.getByRole('button', { name: 'Issue outcome →' })).toBeInTheDocument();
  });

  it('does not show Issue outcome for a long-term-sickness case still at "occupational_health" (not yet at the threshold)', () => {
    const cs = { id: 'c3', employeeName: 'Sam Lee', caseType: 'long-term sickness', outcome: '' };
    render(<OutcomeTab cs={cs} stage="occupational_health" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} canDecide={true} />);
    expect(screen.queryByRole('button', { name: 'Issue outcome →' })).not.toBeInTheDocument();
  });

  it('shows Issue outcome for a flexible-working case at "decision_meeting" (the stage before "decision")', () => {
    const cs = { id: 'c4', employeeName: 'Priya Shah', caseType: 'flexible working', outcome: '' };
    render(<OutcomeTab cs={cs} stage="decision_meeting" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} canDecide={true} />);
    expect(screen.getByRole('button', { name: 'Issue outcome →' })).toBeInTheDocument();
  });

  it('still shows the "hasn\'t reached" message for a long-term-sickness case at "absence_identified"', () => {
    const cs = { id: 'c5', employeeName: 'Sam Lee', caseType: 'long-term sickness', outcome: '' };
    render(<OutcomeTab cs={cs} stage="absence_identified" fmtDate={fmtDate} setShowOutcomeModal={()=>{}} canDecide={true} />);
    expect(screen.getByText(/hasn't reached/)).toBeInTheDocument();
  });
});
