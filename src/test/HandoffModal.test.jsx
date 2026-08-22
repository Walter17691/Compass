import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HandoffModal } from '../screens/HandoffModal.jsx';

vi.mock('../supabase', () => ({ supabase: { from: () => ({ update: () => ({ eq: vi.fn() }) }) } }));

// Phase 6.5 hardening (Batch 13) — the disciplinary officer select had
// a visual label with no htmlFor/id association. Had no test coverage
// at all before this.
const cs = { id: 'c1', employeeName: 'Sam Employee' };
const orgMembers = [{ id: 'm1', name: 'Alex Manager', job_title: 'Ops Lead' }];

describe('HandoffModal — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the disciplinary officer select', () => {
    render(<HandoffModal cases={[cs]} activeCaseId="c1" currentUser={{ name: 'Jo Smith' }} orgMembers={orgMembers} selectedMemberId="" setSelectedMemberId={() => {}} setShowHandoffModal={() => {}} saveCases={() => {}} org={{}} user={{}} setActiveCaseStage={() => {}} showToast={() => {}} />);
    expect(screen.getByLabelText('Select disciplinary officer')).toBeInTheDocument();
  });
});
