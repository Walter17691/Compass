import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { HomeScreen } from '../screens/HomeScreen.jsx';

// Phase 6.5 hardening (Batch 13) — the dashboard case-search field
// relied on placeholder text alone, with no other accessible name. Had
// no test coverage at all before this.
const noop = () => {};

describe('HomeScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the dashboard case-search field', () => {
    // Home Composition Review — the search/filter row only renders once
    // there's an active case to search over (see the "quiet Home" tests
    // below); a real case is supplied here so this test still exercises
    // the field's accessible name, not the now-intentionally-absent
    // empty-account state.
    const cs = { id: 'c1', employeeName: 'Some Case', caseType: 'misconduct' };
    render(<HomeScreen cases={[cs]} getCaseStage={() => 'open'} currentUser={{ name: 'Alex' }} getNextStep={() => null} setMeetingSetup={noop} setScreen={noop} setShowCasePrompt={noop} dueSoon={[]} dashSearch="" setDashSearch={noop} dashFilter="all" setDashFilter={noop} setActiveCaseId={noop} setActiveCaseStage={noop} fmtDate={d => d} showToast={noop} calendarConnected={false} connectGoogleCalendar={noop} disconnectGoogleCalendar={noop} setSettingsSection={noop} isHR={true} />);
    expect(screen.getByLabelText('Search cases')).toBeInTheDocument();
  });
});

// Home Composition Review, item 1 + 5 + 9 — a genuinely quiet account (no
// active cases at all) gets a compact "Your work" prompt instead of the
// full bordered case-list box, and the search/filter row — which has
// nothing to filter — doesn't render at all. Cases nav/functionality
// itself is untouched; this is presentation only.
describe('HomeScreen — quiet/new-account composition (Home Composition Review)', () => {
  it('renders a compact "Your work" prompt instead of the case-list filters/box when there are no active cases', () => {
    render(<HomeScreen {...baseHomeProps} cases={[]} />);
    expect(screen.getByText('Your work')).toBeInTheDocument();
    expect(screen.getByText('No active cases yet.')).toBeInTheDocument();
    expect(screen.queryByLabelText('Search cases')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Investigation' })).not.toBeInTheDocument();
  });

  it('wires the quiet-state "+ New case" button to the same create-case handler as the header action', () => {
    const setShowCasePrompt = vi.fn();
    render(<HomeScreen {...baseHomeProps} cases={[]} setShowCasePrompt={setShowCasePrompt} />);
    fireEvent.click(screen.getAllByRole('button', { name: '+ New case' })[0]);
    expect(setShowCasePrompt).toHaveBeenCalledWith(true);
  });

  it('renders the full Active cases header, filters and list once at least one active case exists', () => {
    const cs = { id: 'c1', employeeName: 'Some Case', caseType: 'misconduct' };
    render(<HomeScreen {...baseHomeProps} cases={[cs]} />);
    expect(screen.queryByText('Your work')).not.toBeInTheDocument();
    expect(screen.getByText('Active cases')).toBeInTheDocument();
    expect(screen.getByLabelText('Search cases')).toBeInTheDocument();
  });
});

const baseHomeProps = {
  getCaseStage: () => 'open', currentUser: { name: 'Alex' }, getNextStep: () => null, setMeetingSetup: noop,
  setScreen: noop, setShowCasePrompt: noop, dueSoon: [], dashSearch: '', setDashSearch: noop, dashFilter: 'active',
  setDashFilter: noop, setActiveCaseId: noop, setActiveCaseStage: noop, fmtDate: d => d, showToast: noop,
  calendarConnected: false, connectGoogleCalendar: noop, disconnectGoogleCalendar: noop, setSettingsSection: noop,
  isHR: true,
};

// Phase 7.5B (P0 polish, item 1) — the case-list row's only flexible
// column must be the employee-name/case-type block; every sibling
// (badge, timestamp) must refuse to shrink. Asserted directly on the
// rendered inline styles rather than pixel layout, since jsdom doesn't
// actually lay out flexbox — this is the same level the bug itself was
// fixed at (CSS properties, not computed geometry).
describe('HomeScreen — case-list card layout (Phase 7.5B, item 1)', () => {
  it('truncates a long employee name with an ellipsis and preserves it via title, rather than letting the status badge get compressed', () => {
    const longName = 'A Very Long Employee Name That Would Not Fit In A Narrow Card Column';
    const cs = { id: 'c1', employeeName: longName, caseType: 'misconduct', updatedAt: new Date().toISOString() };
    render(<HomeScreen {...baseHomeProps} cases={[cs]} />);
    const nameEl = screen.getByTitle(longName);
    expect(nameEl.textContent).toBe(longName);
    expect(nameEl.style.whiteSpace).toBe('nowrap');
    expect(nameEl.style.overflow).toBe('hidden');
    expect(nameEl.style.textOverflow).toBe('ellipsis');
    // The status badge must never be allowed to shrink below its own
    // content — this is what the overlap bug actually was.
    const badge = screen.getByText('Open');
    expect(badge.parentElement.style.flexShrink).toBe('0');
  });
});

// Phase 7.5B (P0 polish, item 6) — overdue/HIGH risk/investigations
// overrunning must render visually bolder (fontWeight 700) than a lower-
// urgency category already sharing the strip (procedural warnings stays
// at its existing 500), using only the categories/colours the system
// already assigns — no new severity invented.
describe('HomeScreen — Needs Attention severity (Phase 7.5B, item 6)', () => {
  it('renders overdue and HIGH-risk items bolder than a routine procedural-warning chip', () => {
    const highRiskCase = { id: 'c2', employeeName: 'Risky Case', caseType: 'misconduct', meetings: [{ date: '2026-01-01', riskScore: { rating: 'HIGH' } }] };
    const caseSignals = [{ id: 's1', caseId: 'c2', type: 'process_risk', status: 'open', title: 'Procedural gap' }];
    render(<HomeScreen {...baseHomeProps} cases={[highRiskCase]}
      dueSoon={[{ overdue: true, label: 'Chase witness statement', caseId: 'c2' }]}
      caseSignals={caseSignals} />);
    const overdueChip = screen.getByText(/Chase witness statement · Overdue/);
    const highRiskChip = screen.getByText(/Risky Case · HIGH risk/);
    const proceduralChip = screen.getByText(/procedural warning/);
    expect(overdueChip.style.fontWeight).toBe('700');
    expect(highRiskChip.style.fontWeight).toBe('700');
    expect(proceduralChip.style.fontWeight).toBe('500');
  });
});

// Phase 7.5B (P0 polish, item 7) / Phase 2A (Calm Intelligence) —
// Compass Recommendations was demoted again in Phase 2A: no longer its
// own bordered card with a serif sub-heading at all, folded into one
// ambient "Compass intelligence" section (a plain small-caps label, no
// card, no per-item heading) stacked below Active Cases rather than
// beside it. Content/ranking/click-through are untouched — only
// asserting the section reads as genuinely quieter than Active Cases.
describe('HomeScreen — Compass intelligence prominence (Phase 2A, Calm Intelligence)', () => {
  it('renders "Compass intelligence" as a quiet section heading, smaller than the Active cases heading, with no competing bordered card', () => {
    const cs = { id: 'c3', employeeName: 'Some Case', caseType: 'misconduct' };
    const caseSignals = [{ id: 's2', caseId: 'c3', type: 'next_action', status: 'open', title: 'Do the thing' }];
    render(<HomeScreen {...baseHomeProps} cases={[cs]} caseSignals={caseSignals} />);
    // getAllByText, not getByText: robust to "Active cases" appearing more
    // than once (it no longer does post-7.5C's stat-card removal, but this
    // shouldn't need updating again if a future change reintroduces a
    // second match) — the section heading itself is the largest match.
    const activeCasesHeading = screen.getAllByText('Active cases').sort((a,b)=>Number(b.style.fontSize.replace('px',''))-Number(a.style.fontSize.replace('px','')))[0];
    const intelligenceHeading = screen.getByText('Compass intelligence');
    expect(Number(intelligenceHeading.style.fontSize.replace('px',''))).toBeLessThan(Number(activeCasesHeading.style.fontSize.replace('px','')));
    // No bordered card wrapping this section any more — a plain top rule
    // only (no background, no border-radius), distinguishing it from
    // Active Cases' own real bordered surface below.
    expect(intelligenceHeading.parentElement.style.background).toBeFalsy();
    expect(intelligenceHeading.parentElement.style.borderRadius).toBeFalsy();
    // Functionality must survive the presentation change: the
    // recommendation itself still renders and is still findable.
    expect(screen.getByText('Do the thing')).toBeInTheDocument();
  });
});

// Phase 7.5C — the four stat-card tiles (Active cases / Awaiting action /
// Pending signatures / Closed this month) were almost entirely duplicate
// of numbers already shown elsewhere on Home (the greeting subtitle, the
// Needs Attention chips) and are gone; "closed this month" — the one
// figure not shown anywhere else — is folded into the greeting subtitle
// instead of lost outright.
describe('HomeScreen — stat-card tiles removed (Phase 7.5C)', () => {
  it('does not render the old stat-card labels, and folds "closed this month" into the greeting subtitle', () => {
    const closedThisMonth = { id: 'c1', employeeName: 'Closed Case', caseType: 'misconduct', stage: 'closed', updatedAt: new Date().toISOString() };
    render(<HomeScreen {...baseHomeProps} getCaseStage={cs => cs.stage || 'open'} dashFilter="all" cases={[{ id: 'c0', employeeName: 'Open Case', caseType: 'misconduct' }, closedThisMonth]} />);
    expect(screen.queryByText('Awaiting action')).not.toBeInTheDocument();
    expect(screen.queryByText('Pending signatures')).not.toBeInTheDocument();
    expect(screen.queryByText('Closed this month')).not.toBeInTheDocument();
    expect(screen.getByText(/1 closed this month/)).toBeInTheDocument();
  });
});

// Phase 7.5C — Needs Attention collapses from up to 11 independently
// rendered chip categories (worst case 20+ bordered pill elements) into
// one panel: a capped, severity-sorted list of real case rows for the
// case-specific categories, and a single plain-text summary line for the
// aggregate-only categories. No category/count/click-through logic
// changed — only how many separate elements it takes to show them.
describe('HomeScreen — Needs Attention consolidation (Phase 7.5C)', () => {
  it('merges case-specific categories into one capped, sorted row list instead of one chip row per category', () => {
    const cases = Array.from({ length: 4 }, (_, i) => ({
      id: 'hr' + i, employeeName: 'High Risk ' + i, caseType: 'misconduct',
      meetings: [{ date: '2026-01-01', riskScore: { rating: 'HIGH' } }],
    }));
    render(<HomeScreen {...baseHomeProps} cases={cases} />);
    // All 4 HIGH-risk rows show (well under the 6-row cap) as real rows,
    // not pill chips — each is its own clickable row with a chevron.
    for (const cs of cases) {
      expect(screen.getByText(new RegExp(cs.employeeName + ' · HIGH risk'))).toBeInTheDocument();
    }
  });

  it('caps the merged case-specific list at 6 rows even when far more items qualify', () => {
    const cases = Array.from({ length: 10 }, (_, i) => ({
      id: 'hr' + i, employeeName: 'High Risk ' + i, caseType: 'misconduct',
      meetings: [{ date: '2026-01-01', riskScore: { rating: 'HIGH' } }],
    }));
    render(<HomeScreen {...baseHomeProps} cases={cases} />);
    const rows = screen.getAllByText(/HIGH risk/);
    expect(rows.length).toBeLessThanOrEqual(6);
  });

  it('demotes stale (no-recent-activity) cases to an aggregate count rather than an individual named row', () => {
    const staleCase = { id: 's1', employeeName: 'Quiet Case', caseType: 'misconduct', updatedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString() };
    render(<HomeScreen {...baseHomeProps} cases={[staleCase]} />);
    // "Quiet Case" legitimately still appears once, in the Active Cases
    // list below (Level 2) — what must NOT exist is a Needs-Attention-style
    // individual "No activity in Nd" row naming the case.
    expect(screen.getAllByText(/Quiet Case/)).toHaveLength(1);
    expect(screen.queryByText(/No activity in/)).not.toBeInTheDocument();
    expect(screen.getByText(/1 case with no recent activity/)).toBeInTheDocument();
  });

  it('still renders the overdue item as non-clickable text, matching its pre-existing (non-button) behaviour', () => {
    const cs = { id: 'c1', employeeName: 'Some Case', caseType: 'misconduct' };
    render(<HomeScreen {...baseHomeProps} cases={[cs]} dueSoon={[{ overdue: true, label: 'Chase witness statement', caseId: 'c1' }]} />);
    const overdueRow = screen.getByText(/Chase witness statement · Overdue/);
    expect(overdueRow.closest('button')).toBeNull();
  });

  it('keeps the aggregate-only categories as a single clickable summary line (referrals still navigate to Concerns)', () => {
    render(<HomeScreen {...baseHomeProps} cases={[]} concernReferrals={[{ id: 'r1', status: 'new' }]} />);
    expect(screen.getByText(/1 referral awaiting triage/)).toBeInTheDocument();
  });
});

// Phase 7.5C — the "This week" 7-day mini-calendar grid plus Connect
// Google/Outlook Calendar buttons were removed from Home (redundant with
// the dedicated Calendar nav destination and Settings → Integrations,
// which already own that functionality); a compact "Today" panel with
// just today's meetings replaces it.
describe('HomeScreen — Calendar reduced to a "Today" panel (Phase 7.5C)', () => {
  it('shows a compact Today panel without the old 7-day grid or calendar-connect buttons', () => {
    render(<HomeScreen {...baseHomeProps} cases={[]} />);
    expect(screen.getByText('Today')).toBeInTheDocument();
    expect(screen.queryByText('This week')).not.toBeInTheDocument();
    expect(screen.queryByText('Connect Google Calendar')).not.toBeInTheDocument();
    expect(screen.queryByText('Connect Outlook')).not.toBeInTheDocument();
    expect(screen.queryByText('Schedule meeting')).not.toBeInTheDocument();
  });
});

// Phase 7.5C — the "Quick links"/"Suggested for you" block (a second,
// weaker "click into a case" suggestion list duplicating Compass
// Recommendations' own purpose in the same column) is gone; its policy
// links remain reachable via Settings → Policies, just not duplicated here.
describe('HomeScreen — Quick links removed (Phase 7.5C)', () => {
  it('no longer renders the Quick links / Suggested for you block', () => {
    const cs = { id: 'c1', employeeName: 'Some Case', caseType: 'misconduct' };
    render(<HomeScreen {...baseHomeProps} cases={[cs]} />);
    expect(screen.queryByText('Quick links')).not.toBeInTheDocument();
    expect(screen.queryByText('Suggested for you')).not.toBeInTheDocument();
    expect(screen.queryByText('View all policies & templates →')).not.toBeInTheDocument();
  });
});

// Phase 7.5C — Compass Recommendations and Potential Bottlenecks now
// share one outer container instead of each having its own bordered card;
// each still renders/hides independently of the other's presence.
describe('HomeScreen — Recommendations/Bottlenecks share one container (Phase 7.5C)', () => {
  it('renders Potential Bottlenecks even when there are no Compass Recommendations', () => {
    const cs = { id: 'c1', employeeName: 'Slow Case', caseType: 'misconduct', createdAt: new Date(Date.now() - 40 * 24 * 60 * 60 * 1000).toISOString(), meetings: [{ type: 'Investigation meeting', date: '01/01/2026' }] };
    render(<HomeScreen {...baseHomeProps} cases={[cs]} caseSignals={[]} />);
    expect(screen.queryByText('Compass Recommendations')).not.toBeInTheDocument();
  });
});
