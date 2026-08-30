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

// Design System Convergence pass, Phase 1 — replaces the old full-width
// "Overdue actions" banner (previously rendered directly in App.jsx,
// outside AppSidebar) with a small persistent icon here. New coverage.
// Home + Sidebar Product Experience pass, Part 1 — primary navigation
// stays cut down to the five genuinely-frequent destinations (Home/Cases/
// Ask Compass/Tasks/People), but "More" is gone entirely now — the
// destinations that used to live behind it (Calendar/Delegated Work or
// My People Actions/Concerns/Insights/HR Processes/Settings) are inline
// collapsible sections in the sidebar itself, covered separately below.
describe('AppSidebar — primary navigation (Home + Sidebar Product Experience pass)', () => {
  it('shows exactly the five primary destinations plus Ask Compass, and no Command Bar row', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    for (const name of ['Home', 'Ask Compass', 'Tasks', 'People']) {
      expect(screen.getByRole('button', { name: new RegExp(`^${name}`) })).toBeInTheDocument();
    }
    expect(screen.getByRole('button', { name: /^Cases/ })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Command Bar/ })).not.toBeInTheDocument();
  });

  it('has no "More" control anywhere in the sidebar', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    expect(screen.queryByRole('button', { name: /^More$/ })).not.toBeInTheDocument();
  });

  it('keeps Calendar, Insights and Settings out of the primary list, reachable instead via their own collapsible section headings', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    expect(screen.queryByRole('button', { name: 'Calendar' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Insights' })).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Settings' })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    expect(screen.getByRole('button', { name: 'Calendar' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Intelligence' }));
    expect(screen.getByRole('button', { name: 'Insights' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Organisation' }));
    expect(screen.getByRole('button', { name: 'Settings' })).toBeInTheDocument();
  });

  it('shows the Create menu trigger and the Search entry point', () => {
    render(<AppSidebar {...baseProps} isHR={true} createMenuProps={{}} />);
    expect(screen.getByRole('button', { name: /Create/ })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Search/ })).toBeInTheDocument();
  });

  it('does not show plain "Cases" with a raw total record count — that is database information, not navigation information', () => {
    render(<AppSidebar {...baseProps} isHR={true} cases={[{ id: 'c1' }, { id: 'c2' }]} getCaseStage={() => 'open'} />);
    expect(screen.getByRole('button', { name: 'Cases' })).toBeInTheDocument();
  });

  // Home Experience Redesign, §10 — only the current destination may
  // carry selected-state background treatment. Ask Compass previously
  // kept a permanent purpleTint background regardless of which screen
  // was active, so it looked "selected" even while genuinely on Home.
  it('does not give Ask Compass selected-state background treatment while a different screen (Home) is active', () => {
    render(<AppSidebar {...baseProps} screen="home" isHR={true} />);
    const home = screen.getByRole('button', { name: 'Home' });
    const askCompass = screen.getByRole('button', { name: /Ask Compass/ });
    expect(home.style.background).not.toBe('none');
    expect(askCompass.style.background).toBe('none');
  });

  it('does give Ask Compass the same selected-state background treatment as any other item once it is the active screen', () => {
    render(<AppSidebar {...baseProps} screen="ask_compass" isHR={true} />);
    const askCompass = screen.getByRole('button', { name: /Ask Compass/ });
    expect(askCompass.style.background).not.toBe('none');
  });
});

describe('AppSidebar — Overdue indicator (Design System Convergence, Phase 1)', () => {
  it('renders nothing when nothing is overdue', () => {
    render(<AppSidebar {...baseProps} dueSoon={[{ overdue: false, employeeName: 'A', label: 'x', daysOverdue: 0 }]} />);
    expect(screen.queryByLabelText(/Overdue actions/)).not.toBeInTheDocument();
  });

  it('shows a count and expands to list overdue items, linking to Home', () => {
    const setScreen = vi.fn();
    const dueSoon = [
      { overdue: true, employeeName: 'Sam Employee', label: 'Chase witness statement', daysOverdue: 3 },
      { overdue: true, employeeName: 'Jo Manager', label: 'Investigation report', daysOverdue: 1 },
    ];
    render(<AppSidebar {...baseProps} setScreen={setScreen} dueSoon={dueSoon} />);
    const trigger = screen.getByLabelText(/Overdue actions — 2/);
    expect(trigger).toBeInTheDocument();
    fireEvent.click(trigger);
    expect(screen.getByText(/Sam Employee — Chase witness statement/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /View all in Home/ }));
    expect(setScreen).toHaveBeenCalledWith('home');
  });
});

// Home + Sidebar Product Experience pass, Part 1 — Redundancy/Wellbeing/
// DSAR live in an inline "HR Processes" collapsible section now, not
// behind "More". Same gating, same underlying screens — the whole group
// simply never gets built for a non-HR user ("groups with zero
// accessible destinations should not appear").
describe('AppSidebar — DSAR nav gating (Phase 6.5)', () => {
  it('shows the DSAR nav item for HR once HR Processes is expanded', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'HR Processes' }));
    expect(screen.getByRole('button', { name: 'DSAR' })).toBeInTheDocument();
  });

  // Home + Sidebar Product Experience pass, Part 14 — the disclosure
  // control must expose its expanded/collapsed state to assistive tech,
  // not just move a chevron visually, and must not be styled as if it
  // were itself a selectable destination (Part 1's explicit requirement).
  it('exposes HR Processes as an accessible disclosure control that never looks like an active destination itself', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    const toggle = screen.getByRole('button', { name: 'HR Processes' });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(toggle).toHaveAttribute('aria-controls');
    expect(toggle.style.background).toBe('none');
    fireEvent.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    // Still no selected-state background even now that it's expanded and
    // one of its children (DSAR) is about to be shown — a category
    // heading is never itself a destination, expanded or not.
    expect(toggle.style.background).toBe('none');
    expect(screen.getByRole('button', { name: 'DSAR' })).toBeInTheDocument();
  });

  it('does not render an HR Processes section at all for a non-HR user (not just its items hidden)', () => {
    render(<AppSidebar {...baseProps} isHR={false} />);
    expect(screen.queryByRole('button', { name: 'HR Processes' })).not.toBeInTheDocument();
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
    fireEvent.click(screen.getByRole('button', { name: 'HR Processes' }));
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
    fireEvent.click(screen.getByRole('button', { name: 'HR Processes' }));
    expect(screen.getByRole('button', { name: 'Redundancy' })).toBeInTheDocument();
  });

  it('hides the Redundancy nav item for non-HR', () => {
    render(<AppSidebar {...baseProps} isHR={false} />);
    expect(screen.queryByRole('button', { name: 'Redundancy' })).not.toBeInTheDocument();
  });
});

// Home + Sidebar Product Experience pass, Part 1 — collapse/expand
// semantics: default collapsed, but the section owning the current
// destination auto-expands; navigating to a screen in a still-collapsed
// section (e.g. a deep link) reveals it too; toggling one section never
// affects another's state.
describe('AppSidebar — collapsible section behaviour (Home + Sidebar Product Experience pass, Part 1)', () => {
  it('starts every non-owning section collapsed', () => {
    render(<AppSidebar {...baseProps} screen="home" isHR={true} />);
    for (const name of ['Work', 'Intelligence', 'HR Processes', 'Organisation']) {
      expect(screen.getByRole('button', { name })).toHaveAttribute('aria-expanded', 'false');
    }
  });

  it('auto-expands the section owning the current destination on mount', () => {
    render(<AppSidebar {...baseProps} screen="insights" isHR={true} />);
    expect(screen.getByRole('button', { name: 'Intelligence' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Work' })).toHaveAttribute('aria-expanded', 'false');
  });

  it('auto-expands the owning section when the active screen changes, even without clicking that section\'s own toggle', () => {
    const { rerender } = render(<AppSidebar {...baseProps} screen="home" isHR={true} />);
    expect(screen.getByRole('button', { name: 'Organisation' })).toHaveAttribute('aria-expanded', 'false');
    rerender(<AppSidebar {...baseProps} screen="settings" isHR={true} />);
    expect(screen.getByRole('button', { name: 'Organisation' })).toHaveAttribute('aria-expanded', 'true');
  });

  it('keeps multiple sections independently expanded at once', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    fireEvent.click(screen.getByRole('button', { name: 'Intelligence' }));
    expect(screen.getByRole('button', { name: 'Work' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Intelligence' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Calendar' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Insights' })).toBeInTheDocument();
  });

  it('collapses a section again on a second click of its own heading, without affecting others', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    fireEvent.click(screen.getByRole('button', { name: 'Intelligence' }));
    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    expect(screen.getByRole('button', { name: 'Work' })).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByRole('button', { name: 'Calendar' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Intelligence' })).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('button', { name: 'Insights' })).toBeInTheDocument();
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
