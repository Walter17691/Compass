import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { IntakeScreen } from '../screens/IntakeScreen.jsx';

// Phase 6.5 hardening (Batch 13) — every text field here had a visual
// <label> with no htmlFor/id association, so a screen reader couldn't
// connect the label to its field. Had no test coverage at all before
// this.
describe('IntakeScreen — field labelling (Phase 6.5, Batch 13)', () => {
  const intake = { employee: '', manager: '', issue: '', type: '', dateReceived: '2026-08-01', description: '', referredBy: '', urgent: false };

  it('associates every text field with its real, visible label', () => {
    render(<IntakeScreen setScreen={()=>{}} intake={intake} setIntake={()=>{}} cases={[]} saveCases={()=>{}} />);
    // Phase E0.5A — the free-text "Employee name" field was replaced by the shared
    // EmployeeSelect, whose label is "Employee" because the user now picks a
    // person rather than typing a name. The guarantee this test protects — every
    // field has a real, associated, visible label — is unchanged.
    expect(screen.getByLabelText('Employee')).toBeInTheDocument();
    expect(screen.getByLabelText('HR manager (you)')).toBeInTheDocument();
    expect(screen.getByLabelText('Date received')).toBeInTheDocument();
    expect(screen.getByLabelText('Referred by')).toBeInTheDocument();
    expect(screen.getByLabelText('Brief summary of the issue')).toBeInTheDocument();
  });
});
