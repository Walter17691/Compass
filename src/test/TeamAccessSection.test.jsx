import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { TeamAccessSection } from '../screens/settings/TeamAccessSection.jsx';

// Phase 6.5 hardening (Batch 13) — the per-member role select had a
// non-<label> heading text with no association at all; the invite-form
// name/email fields had only a placeholder. Had no test coverage at all
// before this.
const noop = () => {};
// Team Invitations P0 remediation — inviteForm no longer carries
// role/locationIds at all (see TeamAccessSection.jsx/App.jsx); the fixture
// reflects the real shape now passed in production.
const inviteForm = { name: '', email: '' };
const locations = [{ id: 'l1', name: 'Manchester' }];
const teamMembers = [{ id: 'm1', name: 'Sam Employee', role: 'hr', location_ids: [] }];

describe('TeamAccessSection — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the per-member role select once its access panel is open', () => {
    render(<TeamAccessSection isHR org={{}} locations={locations} teamMembers={teamMembers} editingMember="m1" setEditingMember={noop} removeMember={noop} updateMemberRole={noop} assignLocations={noop} inviteForm={inviteForm} setInviteForm={noop} inviting={false} inviteMember={noop} />);
    expect(screen.getByLabelText('Role for Sam Employee')).toBeInTheDocument();
  });

  it('labels the invite-form name and email fields', () => {
    render(<TeamAccessSection isHR org={{}} locations={locations} teamMembers={[]} editingMember={null} setEditingMember={noop} removeMember={noop} updateMemberRole={noop} assignLocations={noop} inviteForm={inviteForm} setInviteForm={noop} inviting={false} inviteMember={noop} />);
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });
});

// Team Invitations P0 remediation (2026-09) — the invite form used to
// offer a role select and per-location checkboxes that the backend never
// honoured at all (join_org_with_invite_code always assigns
// location_manager with no locations). Removed rather than kept as
// decorative controls; the "Edit access" panel (still present, still
// tested above/below) remains the only real way to set role/locations,
// after someone has actually joined.
describe('TeamAccessSection — invite form no longer offers non-functional role/location controls (Team Invitations P0)', () => {
  it('does not render a Role select in the invite-new-member form', () => {
    render(<TeamAccessSection isHR org={{}} locations={locations} teamMembers={[]} editingMember={null} setEditingMember={noop} removeMember={noop} updateMemberRole={noop} assignLocations={noop} inviteForm={inviteForm} setInviteForm={noop} inviting={false} inviteMember={noop} />);
    expect(screen.queryByLabelText('Role')).not.toBeInTheDocument();
  });

  it('does not render location checkboxes in the invite-new-member form even when locations exist', () => {
    render(<TeamAccessSection isHR org={{}} locations={locations} teamMembers={[]} editingMember={null} setEditingMember={noop} removeMember={noop} updateMemberRole={noop} assignLocations={noop} inviteForm={inviteForm} setInviteForm={noop} inviting={false} inviteMember={noop} />);
    expect(screen.queryByText('Locations')).not.toBeInTheDocument();
    expect(screen.queryByText('Manchester')).not.toBeInTheDocument();
  });

  it('tells HR the true default-access behaviour instead', () => {
    render(<TeamAccessSection isHR org={{}} locations={locations} teamMembers={[]} editingMember={null} setEditingMember={noop} removeMember={noop} updateMemberRole={noop} assignLocations={noop} inviteForm={inviteForm} setInviteForm={noop} inviting={false} inviteMember={noop} />);
    expect(screen.getByText(/Location Manager access initially/)).toBeInTheDocument();
  });

  it('still lets HR set role and locations for an already-joined member via Edit access, unaffected by the invite-form change', () => {
    render(<TeamAccessSection isHR org={{}} locations={locations} teamMembers={teamMembers} editingMember="m1" setEditingMember={noop} removeMember={noop} updateMemberRole={noop} assignLocations={noop} inviteForm={inviteForm} setInviteForm={noop} inviting={false} inviteMember={noop} />);
    expect(screen.getByLabelText('Role for Sam Employee')).toBeInTheDocument();
    expect(screen.getByText('Manchester')).toBeInTheDocument();
  });
});

// Phase 6.5 hardening (closes independent audit finding 6.1) — the role
// selector used to be nested inside the same `locations.length>0` gate
// as the location-access checkboxes, so "Edit access" rendered nothing
// at all in any org with no locations configured — the default state of
// every brand-new org, and (before this fix) the only way to change a
// member's role anywhere in the app.
describe('TeamAccessSection — role editing without any locations configured (Prompt 14, finding 6.1)', () => {
  it('still renders the role selector when the org has zero locations', () => {
    render(<TeamAccessSection isHR org={{}} locations={[]} teamMembers={teamMembers} editingMember="m1" setEditingMember={noop} removeMember={noop} updateMemberRole={noop} assignLocations={noop} inviteForm={inviteForm} setInviteForm={noop} inviting={false} inviteMember={noop} />);
    expect(screen.getByLabelText('Role for Sam Employee')).toBeInTheDocument();
  });

  it('does not render a location-access section when the org has zero locations', () => {
    render(<TeamAccessSection isHR org={{}} locations={[]} teamMembers={teamMembers} editingMember="m1" setEditingMember={noop} removeMember={noop} updateMemberRole={noop} assignLocations={noop} inviteForm={inviteForm} setInviteForm={noop} inviting={false} inviteMember={noop} />);
    expect(screen.queryByText('Location access')).not.toBeInTheDocument();
  });
});
