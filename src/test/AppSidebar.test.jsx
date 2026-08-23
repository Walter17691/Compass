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

// Phase 6.5 hardening (production regression suite, privacy) — the
// positive case for the same gate: HR genuinely does see the entry
// point to confidential, RLS-restricted wellbeing data (this nav item's
// hiding is client-side defense-in-depth on top of the real boundary,
// wellbeing_notes_2026-08-09.sql's HR-only RLS policy — not itself the
// enforcement).
describe('AppSidebar — Wellbeing nav gating', () => {
  it('shows the Wellbeing nav item for HR', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    expect(screen.getByRole('button', { name: 'Wellbeing' })).toBeInTheDocument();
  });
});
