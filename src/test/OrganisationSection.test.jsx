import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { OrganisationSection } from '../screens/settings/OrganisationSection.jsx';

vi.mock('../supabase', () => ({ supabase: { from: () => ({ update: () => ({ eq: vi.fn() }) }) } }));

// Phase 6.5 hardening (Batch 13) — the per-member access-level and
// job-title selects had no accessible name at all. Had no test coverage
// at all before this.
const noop = () => {};
const orgMembers = [{ id: 'm1', name: 'Sam Employee', access_level: 5, job_title: '', role: 'hr' }];

describe('OrganisationSection — field labelling (Phase 6.5, Batch 13)', () => {
  it('names the per-member access-level and job-title selects after the member', () => {
    render(<OrganisationSection org={{ id: 'org1' }} orgRoles={[]} loadOrgRoles={noop} orgMembers={orgMembers} loadOrgMembers={noop} showToast={noop} />);
    expect(screen.getByLabelText('Access level for Sam Employee')).toBeInTheDocument();
    expect(screen.getByLabelText('Job title for Sam Employee')).toBeInTheDocument();
  });
});
