import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TeamAccessSection } from '../screens/settings/TeamAccessSection.jsx';

// Phase 6.5 hardening (Batch 13) — the per-member role select had a
// non-<label> heading text with no association at all; the invite-form
// name/email fields had only a placeholder.
const noop = () => {};
// NEW-8 remediation — inviteForm now carries role/locationIds, applied
// atomically on acceptance (see TeamAccessSection.jsx/App.jsx).
const inviteForm = { name: '', email: '', role: '', locationIds: [] };
const locations = [{ id: 'l1', name: 'Manchester' }];
const teamMembers = [{ id: 'm1', name: 'Sam Employee', role: 'hr_manager', location_ids: [] }];

const baseProps = {
  isHR: true, currentUserRole: 'hr_director', org: {}, locations, teamMembers,
  editingMember: null, setEditingMember: noop, removeMember: noop, updateMemberRole: noop,
  assignLocations: noop, inviteForm, setInviteForm: noop, inviting: false, inviteMember: noop,
  pendingInvites: [], revokeInvite: noop, resendInvite: noop, resendingInviteId: null,
};

describe('TeamAccessSection — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the per-member role select once its access panel is open', () => {
    render(<TeamAccessSection {...baseProps} editingMember="m1" />);
    expect(screen.getByLabelText('Role for Sam Employee')).toBeInTheDocument();
  });

  it('labels the invite-form name and email fields', () => {
    render(<TeamAccessSection {...baseProps} teamMembers={[]} />);
    expect(screen.getByLabelText('Full name')).toBeInTheDocument();
    expect(screen.getByLabelText('Email address')).toBeInTheDocument();
  });
});

// NEW-8 remediation — the invite form now collects the intended access
// level (and, for a location-scoped role, at least one location),
// applied atomically when the invitation is accepted, instead of every
// invitee silently joining as Location Manager pending a manual
// follow-up correction.
describe('TeamAccessSection — invite form collects intended access level (NEW-8)', () => {
  it('renders an Access level select in the invite-new-member form', () => {
    render(<TeamAccessSection {...baseProps} teamMembers={[]} />);
    expect(screen.getByLabelText('Access level')).toBeInTheDocument();
  });

  it('never offers HR Director as an invite access level', () => {
    render(<TeamAccessSection {...baseProps} teamMembers={[]} />);
    const select = screen.getByLabelText('Access level');
    expect(within(select).queryByText('HR Director')).not.toBeInTheDocument();
  });

  it('offers every other role as an invite access level', () => {
    render(<TeamAccessSection {...baseProps} teamMembers={[]} />);
    const select = screen.getByLabelText('Access level');
    ['HR Manager', 'Location Manager', 'Line Manager', 'Investigator', 'Legal/Compliance Reviewer', 'Auditor (read-only)'].forEach(label => {
      expect(within(select).getByText(label)).toBeInTheDocument();
    });
  });

  it('shows a plain-English description once a role is selected', () => {
    render(<TeamAccessSection {...baseProps} teamMembers={[]} inviteForm={{ ...inviteForm, role: 'auditor' }} />);
    expect(screen.getByText(/Read-only access/)).toBeInTheDocument();
  });

  it('shows a Locations picker only for a location-scoped role', () => {
    const { rerender } = render(<TeamAccessSection {...baseProps} teamMembers={[]} inviteForm={{ ...inviteForm, role: 'investigator' }} />);
    expect(screen.queryByText('Locations')).not.toBeInTheDocument();
    rerender(<TeamAccessSection {...baseProps} teamMembers={[]} inviteForm={{ ...inviteForm, role: 'location_manager' }} />);
    expect(screen.getByText('Locations')).toBeInTheDocument();
    expect(screen.getByText('Manchester')).toBeInTheDocument();
  });

  it('disables Send invite until a role is chosen', () => {
    render(<TeamAccessSection {...baseProps} teamMembers={[]} inviteForm={{ name: 'Sam', email: 'sam@acme.com', role: '', locationIds: [] }} />);
    expect(screen.getByRole('button', { name: /send invite/i })).toBeDisabled();
  });

  it('disables Send invite for Location Manager with zero locations selected', () => {
    render(<TeamAccessSection {...baseProps} teamMembers={[]} inviteForm={{ name: 'Sam', email: 'sam@acme.com', role: 'location_manager', locationIds: [] }} />);
    expect(screen.getByRole('button', { name: /send invite/i })).toBeDisabled();
  });

  it('enables Send invite for Location Manager once a location is selected', () => {
    render(<TeamAccessSection {...baseProps} teamMembers={[]} inviteForm={{ name: 'Sam', email: 'sam@acme.com', role: 'location_manager', locationIds: ['l1'] }} />);
    expect(screen.getByRole('button', { name: /send invite/i })).not.toBeDisabled();
  });

  it('enables Send invite for a non-location-scoped role with no locations needed', () => {
    render(<TeamAccessSection {...baseProps} teamMembers={[]} inviteForm={{ name: 'Sam', email: 'sam@acme.com', role: 'auditor', locationIds: [] }} />);
    expect(screen.getByRole('button', { name: /send invite/i })).not.toBeDisabled();
  });

  it('still lets HR set role and locations for an already-joined member via Edit access, unaffected by the invite-form change', () => {
    render(<TeamAccessSection {...baseProps} editingMember="m1" />);
    expect(screen.getByLabelText('Role for Sam Employee')).toBeInTheDocument();
    expect(screen.getByText('Manchester')).toBeInTheDocument();
  });
});

// NEW-9 remediation — an hr_manager (or any non-director) must not be
// able to promote a member to HR Director, or edit an existing HR
// Director's access at all, from this UI — the database enforces this
// (protect_org_member_privilege_columns); the UI reflects it rather than
// offering a control that would silently fail server-side.
describe('TeamAccessSection — HR Director privilege boundary (NEW-9)', () => {
  const directorMember = [{ id: 'd1', name: 'Dana Director', role: 'hr_director', location_ids: [] }];

  it('an hr_manager does not see HR Director as an option when editing a non-director member', () => {
    render(<TeamAccessSection {...baseProps} currentUserRole="hr_manager" editingMember="m1" />);
    const select = screen.getByLabelText('Role for Sam Employee');
    expect(within(select).queryByText('HR Director')).not.toBeInTheDocument();
  });

  it('an hr_director does see HR Director as an option when editing a member', () => {
    render(<TeamAccessSection {...baseProps} currentUserRole="hr_director" editingMember="m1" />);
    const select = screen.getByLabelText('Role for Sam Employee');
    expect(within(select).getByText('HR Director')).toBeInTheDocument();
  });

  it('an hr_manager cannot open Edit access at all for an existing HR Director', () => {
    render(<TeamAccessSection {...baseProps} currentUserRole="hr_manager" teamMembers={directorMember} />);
    expect(screen.queryByRole('button', { name: 'Edit access' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Remove' })).toBeInTheDocument();
  });

  it('an hr_director can open Edit access for an existing HR Director', () => {
    render(<TeamAccessSection {...baseProps} currentUserRole="hr_director" teamMembers={directorMember} />);
    expect(screen.getByRole('button', { name: 'Edit access' })).toBeInTheDocument();
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
    render(<TeamAccessSection {...baseProps} locations={[]} editingMember="m1" />);
    expect(screen.getByLabelText('Role for Sam Employee')).toBeInTheDocument();
  });

  it('does not render a location-access section when the org has zero locations', () => {
    render(<TeamAccessSection {...baseProps} locations={[]} editingMember="m1" />);
    expect(screen.queryByText('Location access')).not.toBeInTheDocument();
  });
});

// NEW-8 remediation — Team & access now distinguishes pending
// invitations from active members, which the old shared-invite_code
// model had no way to represent at all.
describe('TeamAccessSection — pending invitations', () => {
  const pendingInvites = [{ id: 'inv-1', name: 'Alex Newperson', email: 'alex@acme.com', roleLabel: 'Auditor (read-only)', locationIds: [], createdAt: '2026-09-01T00:00:00.000Z', expired: false }];

  it('does not render a pending-invitations card when there are none', () => {
    render(<TeamAccessSection {...baseProps} pendingInvites={[]} />);
    expect(screen.queryByText('Pending invitations')).not.toBeInTheDocument();
  });

  it('lists a pending invitation with its name, email and role', () => {
    render(<TeamAccessSection {...baseProps} pendingInvites={pendingInvites} />);
    expect(screen.getByText('Pending invitations')).toBeInTheDocument();
    const pendingCard = screen.getByText('Pending invitations').parentElement;
    expect(within(pendingCard).getByText(/Alex Newperson/)).toBeInTheDocument();
    expect(within(pendingCard).getByText(/alex@acme.com/)).toBeInTheDocument();
    expect(within(pendingCard).getByText(/Auditor/)).toBeInTheDocument();
  });

  it('flags an expired invitation', () => {
    render(<TeamAccessSection {...baseProps} pendingInvites={[{ ...pendingInvites[0], expired: true }]} />);
    expect(screen.getByText(/Expired/)).toBeInTheDocument();
  });

  it('calls resendInvite when Resend is clicked', async () => {
    const user = userEvent.setup();
    const resendInvite = vi.fn();
    render(<TeamAccessSection {...baseProps} pendingInvites={pendingInvites} resendInvite={resendInvite} />);
    await user.click(screen.getByRole('button', { name: 'Resend' }));
    expect(resendInvite).toHaveBeenCalledWith('inv-1');
  });

  it('calls revokeInvite when Revoke is clicked', async () => {
    const user = userEvent.setup();
    const revokeInvite = vi.fn();
    render(<TeamAccessSection {...baseProps} pendingInvites={pendingInvites} revokeInvite={revokeInvite} />);
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(revokeInvite).toHaveBeenCalledWith('inv-1');
  });
});
