import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppSidebar } from '../components/AppSidebar.jsx';

// Phase 6.5 hardening — dsar_requests' RLS was org-wide with no role
// check (supabase/dsar_hr_only_access_2026-08-22.sql fixes this) while
// every org member could still see the "DSAR" nav item regardless of
// role, same gap Wellbeing already had fixed. Had no test coverage at
// all before this.
const noop = () => {};
const baseProps = {
  screen: 'home', setScreen: noop, cases: [], getCaseStage: () => 'open', isMobile: false,
  showMobileNav: false, setShowMobileNav: noop, meetingType: null, caseInfo: {}, org: {},
  availableOrgs: [], switchOrg: noop, onJoinAnotherOrg: noop, currentUser: { name: 'Alex' },
  auditLog: [], onSignOut: noop, onOpenCommandBar: noop,
};

describe('AppSidebar — DSAR nav gating (Phase 6.5)', () => {
  it('shows the DSAR nav item for HR', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    expect(screen.getByRole('button', { name: 'DSAR' })).toBeInTheDocument();
  });

  it('hides the DSAR nav item for non-HR, matching Wellbeing', () => {
    render(<AppSidebar {...baseProps} isHR={false} />);
    expect(screen.queryByRole('button', { name: 'DSAR' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Wellbeing' })).not.toBeInTheDocument();
  });
});
