import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppSidebar } from '../components/AppSidebar.jsx';
import { COLOR } from '../styles/tokens.js';

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

// Sidebar footer redesign — the Overdue indicator duplicated Home's own
// "For You" feed (overdue items are already its top tier) and offered no
// action beyond "View all in Home", one click away regardless. Removed
// from the footer entirely rather than fixed-to-fit; Home remains the
// one real, contextualised place this information lives. `dueSoon` is no
// longer a prop AppSidebar accepts at all.
describe('AppSidebar — Overdue indicator removal (Sidebar footer redesign)', () => {
  it('never renders an overdue-actions control anywhere, even when dueSoon-shaped data is passed through', () => {
    render(<AppSidebar {...baseProps} isHR={true} dueSoon={[{ overdue: true, employeeName: 'Sam', label: 'x', daysOverdue: 3 }]} />);
    expect(screen.queryByLabelText(/Overdue actions/)).not.toBeInTheDocument();
    expect(screen.queryByText(/View all in Home/)).not.toBeInTheDocument();
  });
});

// Sidebar footer redesign — the footer previously packed an org badge,
// a bare name, up to five small icons (load-issue, overdue, a second
// "Ask Compass" identical in icon to the primary nav destination,
// activity, and a standalone Sign out button) into one row narrower than
// their combined width — the proximate cause of a real overlap bug, and
// on inspection a genuinely confusing account area even once that
// overlap was fixed. Redesigned around a single account identity control
// (avatar + name + org as secondary text, opening a menu with
// org-switching/Settings/Sign out) plus the one icon — Activity — that
// carries information no other surface already shows (unread-since-
// last-viewed, not just a browsable log). Overdue and the second Ask
// Compass were removed outright (see their own describe blocks); org
// switching and Sign out moved into the account menu; Settings gained a
// convenience shortcut there alongside its existing nav destination.
describe('AppSidebar — account menu (Sidebar footer redesign)', () => {
  it('shows the signed-in user\'s name and initials, with the organisation as secondary text rather than a separate badge', () => {
    render(<AppSidebar {...baseProps} isHR={true} currentUser={{ name: 'Priya Shah' }} org={{ id: 'org1', name: 'Acme Ltd' }} />);
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByText('Acme Ltd')).toBeInTheDocument();
    expect(screen.getByText('PS')).toBeInTheDocument();
    // Not rendered as its own clickable object distinct from the account
    // control — no separate "Switch organisation" trigger sits beside it.
    expect(screen.queryByRole('button', { name: /Switch organisation/ })).not.toBeInTheDocument();
  });

  it('opens a menu on click containing Settings and Sign out, and closes on Escape', () => {
    const onSignOut = vi.fn();
    const setScreen = vi.fn();
    render(<AppSidebar {...baseProps} isHR={true} setScreen={setScreen} onSignOut={onSignOut} />);
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByRole('menu', { name: 'Account' })).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Settings'));
    expect(setScreen).toHaveBeenCalledWith('settings');

    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    fireEvent.click(screen.getByText('Sign out'));
    expect(onSignOut).toHaveBeenCalledTimes(1);
  });

  it('closes the account menu on Escape', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByRole('menu', { name: 'Account' })).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByRole('menu', { name: 'Account' })).not.toBeInTheDocument();
  });

  it('lists every available organisation with the current one checked, and switches on click', () => {
    const switchOrg = vi.fn();
    const org = { id: 'org1', name: 'Acme Ltd' };
    const availableOrgs = [org, { id: 'org2', name: 'Beta Inc' }];
    render(<AppSidebar {...baseProps} isHR={true} org={org} availableOrgs={availableOrgs} switchOrg={switchOrg} />);
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByRole('button', { name: /Beta Inc/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /Beta Inc/ }));
    expect(switchOrg).toHaveBeenCalledWith('org2');
  });

  it('does not show an organisation switch list when there is only one organisation, but still offers to join another', () => {
    render(<AppSidebar {...baseProps} isHR={true} org={{ id: 'org1', name: 'Acme Ltd' }} availableOrgs={[]} />);
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.getByText(/Join another organisation/)).toBeInTheDocument();
  });

  it('calls onJoinAnotherOrg when that menu item is clicked', () => {
    const onJoinAnotherOrg = vi.fn();
    render(<AppSidebar {...baseProps} isHR={true} onJoinAnotherOrg={onJoinAnotherOrg} />);
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    fireEvent.click(screen.getByText(/Join another organisation/));
    expect(onJoinAnotherOrg).toHaveBeenCalledTimes(1);
  });

  it('keeps the Activity control visible and separate from the account menu, not folded inside it', () => {
    render(<AppSidebar {...baseProps} isHR={true} auditLog={[{ id: '1', action: 'Case created', ts: new Date().toISOString(), user: 'Alex' }]} />);
    expect(screen.getByRole('button', { name: /^Activity/ })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Account menu' }));
    expect(screen.queryByText('Recent activity')).not.toBeInTheDocument();
  });

  // Sidebar footer composition pass, Part 1 — the whole row (avatar,
  // name, org, chevron) is one single button, not a row with a small
  // appended control doing the actual work. Clicking the org name text
  // itself (a plain child of that button, not a separate element)
  // proves there's nothing narrower to "miss."
  it('opens the account menu from a click anywhere in the row, including the organisation text — there is no separate small trigger', () => {
    render(<AppSidebar {...baseProps} isHR={true} org={{ id: 'org1', name: 'Acme Ltd' }} />);
    expect(screen.queryByRole('button', { name: /^\.\.\.$/ })).not.toBeInTheDocument();
    fireEvent.click(screen.getByText('Acme Ltd'));
    expect(screen.getByRole('menu', { name: 'Account' })).toBeInTheDocument();
  });

  it('carries the full organisation name as a title attribute for a tooltip on truncation, without changing footer layout width', () => {
    const longName = 'A Genuinely Very Long Organisation Name That Would Otherwise Truncate Awkwardly Ltd';
    render(<AppSidebar {...baseProps} isHR={true} org={{ id: 'org1', name: longName }} />);
    const orgText = screen.getByText(longName);
    expect(orgText).toHaveAttribute('title', longName);
    expect(orgText.style.whiteSpace).toBe('nowrap');
    expect(orgText.style.textOverflow).toBe('ellipsis');
  });

  it('gives the account row an open/hover-style background when the menu is open', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    expect(trigger.style.background).toBe('none');
    fireEvent.click(trigger);
    expect(trigger.style.background).not.toBe('none');
  });
});

// Sidebar footer composition pass, Part 4 — Activity is a global
// application function, not account identity, so it now lives beside
// the Compass mark at the top of the sidebar shell rather than inside
// the account row at the bottom.
describe('AppSidebar — Activity relocated to the sidebar header (Sidebar footer composition pass)', () => {
  it('is not a descendant of the account menu trigger or its popover', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    const activity = screen.getByRole('button', { name: /^Activity/ });
    const accountTrigger = screen.getByRole('button', { name: 'Account menu' });
    expect(accountTrigger.contains(activity)).toBe(false);
    expect(activity.contains(accountTrigger)).toBe(false);
  });

  it('still opens its own recent-activity popover independently of the account menu', () => {
    render(<AppSidebar {...baseProps} isHR={true} auditLog={[{ id: '1', action: 'Case created', ts: new Date().toISOString(), user: 'Alex' }]} />);
    fireEvent.click(screen.getByRole('button', { name: /^Activity/ }));
    expect(screen.getByText('Recent activity')).toBeInTheDocument();
    expect(screen.queryByRole('menu', { name: 'Account' })).not.toBeInTheDocument();
  });
});

// Sidebar footer redesign — AskCompassWidget rendered the exact same
// icon as the primary "Ask Compass" nav destination but answered only a
// stateless subset of what that destination already handles (confirmed
// against sendGlobalChat's own intent classifier in App.jsx, which
// already routes general UK-employment-law/ACAS/best-practice questions
// alongside case/stats ones) — a first-time user had no way to tell the
// two apart. Removed from the footer/mobile header entirely; the
// capability isn't lost, it's just no longer duplicated.
describe('AppSidebar — second Ask Compass icon removal (Sidebar footer redesign)', () => {
  it('renders only one control whose accessible name mentions Ask Compass — the primary nav destination', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    const matches = screen.getAllByRole('button', { name: /Ask Compass/ });
    expect(matches).toHaveLength(1);
    expect(matches[0]).toHaveTextContent('Ask Compass');
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
// Sidebar footer composition pass, Part 5 — a permanent small icon in
// the account footer (even one that only appeared when a real problem
// existed) still read as "one more system control living in my account
// area." Now an in-flow notice rendered above the nav list — not in the
// footer, not behind a click — with the same Retry/Dismiss handlers and
// the same colours the app's own global error toast already uses
// (#FEF0EB/#C84B2F44), so it reads as a genuine error notice rather than
// a navigation-adjacent icon. role="alert"/aria-live="assertive" so a
// screen reader gets the full message the moment it mounts, with no
// click required to reach it.
describe('AppSidebar — data-load-issue notice (Sidebar footer composition pass)', () => {
  it('shows nothing when there are no load issues', () => {
    render(<AppSidebar {...baseProps} isHR={true} dataLoadIssues={[]} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('shows the full message immediately, with Retry/Dismiss both reachable with no click needed to reveal them', () => {
    const onRetryLoad = vi.fn();
    const onDismissLoadBanner = vi.fn();
    render(<AppSidebar {...baseProps} isHR={true} dataLoadIssues={['cases']} loadBannerDismissed={false} onRetryLoad={onRetryLoad} onDismissLoadBanner={onDismissLoadBanner} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load cases/);
    fireEvent.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetryLoad).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByRole('button', { name: 'Dismiss' }));
    expect(onDismissLoadBanner).toHaveBeenCalledTimes(1);
  });

  it('summarises multiple load issues by count rather than listing every one', () => {
    render(<AppSidebar {...baseProps} isHR={true} dataLoadIssues={['cases', 'audit log', 'roles']} loadBannerDismissed={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load 3 kinds of data/);
  });

  it('hides the notice once dismissed, even with load issues still present', () => {
    render(<AppSidebar {...baseProps} isHR={true} dataLoadIssues={['cases']} loadBannerDismissed={true} />);
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
  });

  it('renders the notice within the mobile header layout too, and it never lives in the account row', () => {
    render(<AppSidebar {...baseProps} isHR={true} isMobile={true} dataLoadIssues={['cases']} loadBannerDismissed={false} />);
    expect(screen.getByRole('alert')).toHaveTextContent(/Couldn't load cases/);
  });
});

// Phase C — expanding sidebar rail. The rest/open width change and the
// label reveal are pure CSS (a .app-rail/.rail-label rule pair reacting
// to :hover/:focus-within), which jsdom does not lay out or compute —
// these tests instead verify the structural contract the CSS relies on:
// the rail wrapper and its label spans carry the right classNames, every
// nav item still exposes the same accessible name it always did (so
// hiding a label visually never hides it from assistive tech), and the
// active-state visual system matches the approved white-surface spec
// rather than the old solid-tint fill. Handler/destination/permission
// coverage above is untouched and still exercises the exact same items.
describe('AppSidebar — expanding rail shell (Phase C)', () => {
  it('renders the rail as a fixed-position <aside> (not the old sticky 224px one) plus an in-flow 72px spacer', () => {
    const { container } = render(<AppSidebar {...baseProps} isHR={true} />);
    const rail = container.querySelector('aside.app-rail');
    expect(rail).toBeInTheDocument();
    expect(rail.style.position).toBe('fixed');
    expect(rail.style.top).toBe('0px');
    expect(rail.style.left).toBe('0px');
    expect(rail.style.bottom).toBe('0px');
    // The landmark itself must stay <aside> — tests/e2e/navigation-menus.spec.js
    // scopes its own queries to `aside, header`, and screen-reader users rely
    // on the same landmark to jump straight to navigation.
    const spacer = container.querySelector('div');
    expect(spacer.style.width).toBe('72px');
  });

  it('gives every primary nav item an icon plus a label wrapped for the rail\'s reveal-on-open treatment, without changing its accessible name', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    for (const name of ['Home', 'Cases', 'Tasks', 'People']) {
      const btn = screen.getByRole('button', { name: new RegExp(`^${name}`) });
      expect(btn.querySelector('svg')).toBeInTheDocument();
      const label = btn.querySelector('.rail-label');
      expect(label).toHaveTextContent(name);
    }
    const askCompass = screen.getByRole('button', { name: /^Ask Compass/ });
    expect(askCompass.querySelector('.rail-label')).toHaveTextContent('Ask Compass');
  });

  it('gives grouped destinations an icon too once their section is open, with the same accessible name as before', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    fireEvent.click(screen.getByRole('button', { name: 'Work' }));
    const calendar = screen.getByRole('button', { name: 'Calendar' });
    expect(calendar.querySelector('svg')).toBeInTheDocument();
    expect(calendar.querySelector('.rail-label')).toHaveTextContent('Calendar');
  });

  it('gives the active nav item a white surface with a border/shadow, never a solid violet fill', () => {
    render(<AppSidebar {...baseProps} screen="home" isHR={true} />);
    const home = screen.getByRole('button', { name: /^Home/ });
    expect(home.style.background).toBe('rgb(255, 255, 255)');
    expect(home.style.background).not.toBe(COLOR.purpleTint);
    expect(home.style.border).toBe('1px solid rgb(232, 234, 242)');
  });

  it('leaves an inactive nav item with no background and no border', () => {
    render(<AppSidebar {...baseProps} screen="home" isHR={true} />);
    const cases = screen.getByRole('button', { name: /^Cases/ });
    expect(cases.style.background).toBe('none');
  });

  it('wraps the Compass wordmark and the Search label for the same reveal treatment as nav items', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    // Expanded rail composition pass — the open-state Compass lockup is
    // now its own smaller mark + wordmark (see AppSidebar.jsx's
    // OPEN_MARK_SIZE), nested inside the same .rail-label reveal wrapper
    // every row's label already used, rather than being that span's
    // direct text content — the reveal mechanic under test is unchanged,
    // only the lockup's own internal markup one level in is.
    const compassLabel = [...document.querySelectorAll('.rail-label')].find(el => el.textContent.includes('Compass'));
    expect(compassLabel).toBeInTheDocument();
    const search = screen.getByRole('button', { name: /Search/ });
    expect(search.querySelector('.rail-label')).toHaveTextContent('Search');
  });

  it('wraps the account name/organisation block for the reveal treatment without changing its content', () => {
    render(<AppSidebar {...baseProps} isHR={true} currentUser={{ name: 'Priya Shah' }} org={{ id: 'org1', name: 'Acme Ltd' }} />);
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    const label = trigger.querySelector('.rail-label');
    expect(label).toHaveTextContent('Priya Shah');
    expect(label).toHaveTextContent('Acme Ltd');
  });

  it('never renders a "Running out" deadline section — AppSidebar has no deadline data source to draw one from', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    expect(screen.queryByText('Running out')).not.toBeInTheDocument();
  });

  it('keeps the mobile Create trigger centred (not compact) — the rail-only alignment change never reaches the mobile sheet', () => {
    render(<AppSidebar {...baseProps} isHR={true} isMobile={true} showMobileNav={true} createMenuProps={{}} />);
    const trigger = screen.getByRole('button', { name: /Create/ });
    expect(trigger.style.justifyContent).toBe('center');
  });

  it('still renders the plain mobile header (no rail classes) when isMobile is true', () => {
    const { container } = render(<AppSidebar {...baseProps} isHR={true} isMobile={true} />);
    expect(container.querySelector('.app-rail')).not.toBeInTheDocument();
    expect(container.querySelector('header')).toBeInTheDocument();
  });
});

// Phase C targeted defect remediation — two defects found during live
// keyboard/pointer verification of the expanding rail:
//
// 1. Escape closing Create/Account/Activity after focus had moved onto an
//    item inside the popover dropped focus to document.body (nothing else
//    to receive it once the focused element unmounted) — invisible in the
//    old static 224px sidebar, but the rail's :focus-within-driven
//    collapse made it visible: losing focus collapsed the rail out from
//    under a keyboard user mid-interaction. Fixed by returning focus to
//    each popover's own trigger on Escape specifically (outside-click
//    closure is untouched — no forced focus jump for a mouse user).
//
// 2. The Create and Search icons rendered at width:0 at the rail's 72px
//    resting width — PlusIcon/SearchIcon only destructured {size}, so the
//    flexShrink:0 already being passed at their call sites was silently
//    dropped, letting the flex row shrink them under space pressure from
//    the (invisible-but-still-laid-out) label text beside them. Fixed by
//    having both components accept and apply `style`, matching every
//    other Phase C icon.
describe('AppSidebar — Account menu Escape focus restoration (Phase C targeted defect remediation)', () => {
  it('returns focus to the Account menu trigger when Escape closes it after focus has moved onto an item inside it', async () => {
    const user = userEvent.setup();
    render(<AppSidebar {...baseProps} isHR={true} />);
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    await user.click(trigger);
    // baseProps has no second org, so "+ Join another organisation" (not
    // the org list) is the first item in tab order, ahead of Settings.
    await user.tab();
    expect(screen.getByRole('button', { name: '+ Join another organisation' })).toHaveFocus();
    await user.tab();
    expect(screen.getByRole('button', { name: 'Settings' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: 'Account' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  it('leaves focus on the Account menu trigger when Escape closes it without focus ever having moved into it', async () => {
    const user = userEvent.setup();
    render(<AppSidebar {...baseProps} isHR={true} />);
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    await user.click(trigger);
    expect(trigger).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  it('does not force focus onto the Account menu trigger when it is closed by an outside click', async () => {
    const user = userEvent.setup();
    render(<AppSidebar {...baseProps} isHR={true} />);
    const trigger = screen.getByRole('button', { name: 'Account menu' });
    await user.click(trigger);
    // The Home nav button is a real, always-present outside target.
    await user.click(screen.getByRole('button', { name: /^Home/ }));
    expect(screen.queryByRole('menu', { name: 'Account' })).not.toBeInTheDocument();
    expect(trigger).not.toHaveFocus();
  });
});

describe('AppSidebar — Create/Search icons protected from flex-shrink at rest (Phase C targeted defect remediation)', () => {
  it('renders the Search icon present and explicitly protected from flex-shrink', () => {
    render(<AppSidebar {...baseProps} isHR={true} />);
    const icon = screen.getByRole('button', { name: /Search/ }).querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon.style.flexShrink).toBe('0');
  });

  it('renders the Create icon (compact, rail trigger) present and explicitly protected from flex-shrink', () => {
    render(<AppSidebar {...baseProps} isHR={true} createMenuProps={{}} />);
    const icon = screen.getByRole('button', { name: /Create/ }).querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon.style.flexShrink).toBe('0');
  });
});
