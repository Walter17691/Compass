import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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

// Phase 6.5 hardening (production regression suite) — the data-load-issue
// banner used to be its own position:fixed overlay in App.jsx, and went
// through three real, E2E-discovered collisions with real screen content
// (Home's own primary buttons, the Ask Compass chat panel, RecordScreen's
// "End meeting" button) before moving here — rendered as part of the
// sidebar's own in-flow layout (position:sticky, never position:fixed),
// which is identical across every screen, so a collision with a specific
// screen's own content is structurally impossible rather than just
// currently-unobserved.
describe('AppSidebar — data-load-issue banner', () => {
  it('shows nothing when there are no load issues', () => {
    render(<AppSidebar {...baseProps} isHR={true} dataLoadIssues={[]} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows the banner with Retry/Dismiss when there are load issues, and wires both handlers', () => {
    const onRetryLoad = vi.fn();
    const onDismissLoadBanner = vi.fn();
    render(<AppSidebar {...baseProps} isHR={true} dataLoadIssues={['cases']} loadBannerDismissed={false} onRetryLoad={onRetryLoad} onDismissLoadBanner={onDismissLoadBanner} />);
    const banner = screen.getByRole('status');
    expect(banner).toHaveTextContent("Couldn't load cases");
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryLoad).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismissLoadBanner).toHaveBeenCalledTimes(1);
  });

  it('summarises multiple load issues by count rather than listing every one', () => {
    render(<AppSidebar {...baseProps} isHR={true} dataLoadIssues={['cases', 'audit log', 'roles']} loadBannerDismissed={false} />);
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't load 3 kinds of data");
  });

  it('hides the banner once dismissed, even with load issues still present', () => {
    render(<AppSidebar {...baseProps} isHR={true} dataLoadIssues={['cases']} loadBannerDismissed={true} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders the banner within the mobile header layout too', () => {
    render(<AppSidebar {...baseProps} isHR={true} isMobile={true} dataLoadIssues={['cases']} loadBannerDismissed={false} />);
    expect(screen.getByRole('status')).toHaveTextContent("Couldn't load cases");
  });
});
