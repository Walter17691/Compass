import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ConcernsScreen } from '../screens/ConcernsScreen.jsx';

const EMPTY_CONCERN_FORM = { employeeName: '', concernType: 'other', description: '', witnesses: '', discussedWithEmployee: false, involvesSafetyOrWelfare: false, immediateSafetyConcern: false, mayNeedFormalProcess: false, evidenceDescription: '', evidenceFiles: [] };

// Integrations & Workflow Automation (Phase 5, IP10, §2-3) — "Create New
// Concern" from a read email routes here with autoOpenForm=true. HR
// normally lands on the triage queue first and has to click "+ Raise a
// concern"; this proves the deep link actually skips that step.
describe('ConcernsScreen — autoOpenForm (Phase 5, IP10)', () => {
  it('HR sees the triage queue, not the form, when autoOpenForm is false', () => {
    render(<ConcernsScreen isHR concernReferrals={[]} concernForm={EMPTY_CONCERN_FORM} setConcernForm={()=>{}} submitConcernReferral={()=>{}} concernSubmitted={false} setConcernSubmitted={()=>{}} screens={{}} autoOpenForm={false} clearAutoOpenForm={()=>{}} />);
    expect(screen.queryByText("Employee's name")).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Raise a concern' })).toBeInTheDocument();
  });

  it('HR lands directly on the pre-filled form when autoOpenForm is true', () => {
    const concernForm = { ...EMPTY_CONCERN_FORM, employeeName: 'Sarah Jones', description: 'Extracted from email' };
    render(<ConcernsScreen isHR concernReferrals={[]} concernForm={concernForm} setConcernForm={()=>{}} submitConcernReferral={()=>{}} concernSubmitted={false} setConcernSubmitted={()=>{}} screens={{}} autoOpenForm clearAutoOpenForm={()=>{}} />);
    expect(screen.getByText("Employee's name")).toBeInTheDocument();
    expect(screen.getByDisplayValue('Sarah Jones')).toBeInTheDocument();
  });

  it('non-HR always sees the form regardless of autoOpenForm', () => {
    render(<ConcernsScreen isHR={false} concernReferrals={[]} concernForm={EMPTY_CONCERN_FORM} setConcernForm={()=>{}} submitConcernReferral={()=>{}} concernSubmitted={false} setConcernSubmitted={()=>{}} screens={{}} autoOpenForm={false} clearAutoOpenForm={()=>{}} />);
    expect(screen.getByText("Employee's name")).toBeInTheDocument();
  });
});
