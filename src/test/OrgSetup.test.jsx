import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import OrgSetup from '../OrgSetup.jsx';

vi.mock('../supabase', () => ({ supabase: { from: () => ({ insert: vi.fn(), select: vi.fn() }) } }));

// Phase 6.5 hardening (Batch 13) — the your-name and organisation-name
// fields had visual labels with no htmlFor/id association.
describe('OrgSetup — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels your name and organisation name', async () => {
    render(<OrgSetup user={{ id: 'u1' }} onComplete={() => {}} />);
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
    expect(screen.getByLabelText('Organisation name')).toBeInTheDocument();
  });
});

// Final security gate (Release 1.0 P1 invitation remediation) — "Join an
// existing team" (handleJoin, join_org_with_invite_code) is removed:
// that RPC's EXECUTE grant is revoked for authenticated callers entirely
// (see supabase/team_invites_and_hr_director_boundary_2026-09-11.sql's
// own Part 3) because it let any authenticated user who knew any org's
// shared, never-expiring invite_code grant themselves location_manager
// membership in that org directly, bypassing every safeguard team_invites
// provides. Only org creation remains here now.
describe('OrgSetup — legacy "join by code" path removed (final security gate)', () => {
  it('only offers organisation creation, not a join-by-code option', () => {
    render(<OrgSetup user={{ id: 'u1' }} onComplete={() => {}} />);
    expect(screen.queryByRole('button', { name: /Join an existing team/ })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('Invite code')).not.toBeInTheDocument();
    expect(screen.getByLabelText('Organisation name')).toBeInTheDocument();
  });
});
