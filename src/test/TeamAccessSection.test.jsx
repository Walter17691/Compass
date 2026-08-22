import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeamAccessSection } from '../screens/settings/TeamAccessSection.jsx';

// Phase 6.5 hardening (Batch 13) — the per-member role select had a
// non-<label> heading text with no association at all; the invite-form
// name/email fields had only a placeholder; the invite-form role select
// had no label at all. Had no test coverage at all before this.
const noop = () => {};
const inviteForm = { name: '', email: '', role: 'hr', locationIds: [] };
const locations = [{ id: 'l1', name: 'Manchester' }];
const teamMembers = [{ id: 'm1', name: 'Sam Employee', role: 'hr', location_ids: [] }];

describe('TeamAccessSection — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the per-member role select once its access panel is open', () => {
    render(<TeamAccessSection isHR org={{}} locations={locations} teamMembers={teamMembers} editingMember="m1" setEditingMember={noop} removeMember={noop} updateMemberRole={noop} assignLocations={noop} inviteForm={inviteForm} setInviteForm={noop} inviting={false} inviteMember={noop} />);
    expect(screen.getByLabelText('Role for Sam Employee')).toBeInTheDocument();
  });

  it('labels the invite-form name, email, and role fields', () => {
    render(<TeamAccessSection isHR org={{}} locations={locations} teamMembers={[]} editingMember={null} setEditingMember={noop} removeMember={noop} updateMemberRole={noop} assignLocations={noop} inviteForm={inviteForm} setInviteForm={noop} inviting={false} inviteMember={noop} />);
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
    expect(screen.getByLabelText('Role')).toBeInTheDocument();
  });
});
