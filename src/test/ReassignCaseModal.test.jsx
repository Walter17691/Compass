import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ReassignCaseModal } from '../screens/ReassignCaseModal.jsx';

vi.mock('../supabase', () => ({ supabase: { from: () => ({ update: () => ({ eq: vi.fn() }) }) } }));
vi.mock('../lib/authedFetch', () => ({ authedFetch: vi.fn() }));

// Phase 6.5 hardening (Batch 13) — the new-case-owner select had a
// visual label with no htmlFor/id association. Had no test coverage
// at all before this.
const cs = { id: 'c1', employeeName: 'Sam Employee' };
const orgMembers = [{ id: 'm1', name: 'Alex Manager', job_title: 'Ops Lead' }];

describe('ReassignCaseModal — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the new case owner select', () => {
    render(<ReassignCaseModal cases={[cs]} activeCaseId="c1" currentUser={{ name: 'Jo Smith' }} orgMembers={orgMembers} selectedMemberId="" setSelectedMemberId={() => {}} setShowReassignModal={() => {}} saveCases={() => {}} org={{}} user={{}} showToast={() => {}} audit={() => {}} />);
    expect(screen.getByLabelText('New case owner')).toBeInTheDocument();
  });
});
