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
  it('shows the DSAR nav item for HR once HR Processes is expanded', () => {
    // Home Composition Review, final refinement (item 3) — HR Processes
    // now starts collapsed; expand it first, same as a real user would.
    render(<AppSidebar {...baseProps} isHR={true} />);
    fireEvent.click(screen.getByRole('button', { name: /HR Processes/ }));
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
  it('shows the Wellbeing nav item for HR once HR Processes is expanded', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    fireEvent.click(screen.getByRole('button', { name: /HR Processes/ }));
    expect(screen.getByRole('button', { name: 'Wellbeing' })).toBeInTheDocument();
  });
});

// Phase 6.5 hardening (closes Prompt 16 audit finding H1, HIGH) — same gap
// as DSAR above, found again: the "Redundancy" nav item had no gate at
// all, unlike Onboarding/Offboarding/Wellbeing/DSAR right next to it in
// the same nav group. RLS (redundancy_cases_2026-08-27.sql) is the real
// boundary; this is the same client-side defense-in-depth as Wellbeing's.
describe('AppSidebar — Redundancy nav gating (Prompt 16 audit, H1)', () => {
  it('shows the Redundancy nav item for HR once HR Processes is expanded', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    fireEvent.click(screen.getByRole('button', { name: /HR Processes/ }));
    expect(screen.getByRole('button', { name: 'Redundancy' })).toBeInTheDocument();
  });

  it('hides the Redundancy nav item for non-HR', () => {
    render(<AppSidebar {...baseProps} isHR={false} />);
    expect(screen.queryByRole('button', { name: 'Redundancy' })).not.toBeInTheDocument();
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
//
// Home Composition Review, final refinement (item 4) — that fixed version
// was still a permanently-expanded card, which was itself visually
// dominant in the sidebar. It's now a restrained status icon (role="status"
// lives on its own non-interactive wrapper, not the button, per
// jsx-a11y/no-interactive-element-to-noninteractive-role) that expands
// into the full message + Retry/Dismiss on click — same signal, same
// actions, one click to inspect instead of always-on-screen.
describe('AppSidebar — data-load-issue indicator', () => {
  it('shows nothing when there are no load issues', () => {
    render(<AppSidebar {...baseProps} isHR={true} dataLoadIssues={[]} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('shows a restrained indicator carrying the full message as its accessible name, and expands into Retry/Dismiss on click', () => {
    const onRetryLoad = vi.fn();
    const onDismissLoadBanner = vi.fn();
    render(<AppSidebar {...baseProps} isHR={true} dataLoadIssues={['cases']} loadBannerDismissed={false} onRetryLoad={onRetryLoad} onDismissLoadBanner={onDismissLoadBanner} />);
    // Discoverable without a click — the status region's own accessible
    // name already carries the real message, satisfying "not hidden or
    // swallowed" for a screen-reader user even before it's opened.
    expect(screen.getByRole('status', { name: /Couldn't load cases/ })).toBeInTheDocument();
    // The full message isn't sitting in the DOM as its own always-visible
    // block, though — reaching Retry/Dismiss takes exactly one click.
    expect(screen.queryByRole('button', { name: 'Retry' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Data load issue/ }));
    expect(screen.getByText(/Couldn't load cases/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryLoad).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismissLoadBanner).toHaveBeenCalledTimes(1);
  });

  it('summarises multiple load issues by count rather than listing every one', () => {
    render(<AppSidebar {...baseProps} isHR={true} dataLoadIssues={['cases', 'audit log', 'roles']} loadBannerDismissed={false} />);
    expect(screen.getByRole('status', { name: /Couldn't load 3 kinds of data/ })).toBeInTheDocument();
  });

  it('hides the indicator once dismissed, even with load issues still present', () => {
    render(<AppSidebar {...baseProps} isHR={true} dataLoadIssues={['cases']} loadBannerDismissed={true} />);
    expect(screen.queryByRole('status')).not.toBeInTheDocument();
  });

  it('renders the indicator within the mobile header layout too', () => {
    render(<AppSidebar {...baseProps} isHR={true} isMobile={true} dataLoadIssues={['cases']} loadBannerDismissed={false} />);
    expect(screen.getByRole('status', { name: /Couldn't load cases/ })).toBeInTheDocument();
  });
});
