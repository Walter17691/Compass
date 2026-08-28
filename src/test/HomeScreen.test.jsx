import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeScreen } from '../screens/HomeScreen.jsx';

// Phase 6.5 hardening (Batch 13) — the dashboard case-search field
// relied on placeholder text alone, with no other accessible name. Had
// no test coverage at all before this.
const noop = () => {};

describe('HomeScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the dashboard case-search field', () => {
    render(<HomeScreen cases={[]} getCaseStage={() => 'open'} currentUser={{ name: 'Alex' }} getNextStep={() => null} setMeetingSetup={noop} setScreen={noop} setShowCasePrompt={noop} dueSoon={[]} dashSearch="" setDashSearch={noop} dashFilter="all" setDashFilter={noop} setActiveCaseId={noop} setActiveCaseStage={noop} fmtDate={d => d} showToast={noop} calendarConnected={false} connectGoogleCalendar={noop} disconnectGoogleCalendar={noop} setSettingsSection={noop} isHR={true} />);
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

// Phase 7.5B (P0 polish, item 7) — Compass Recommendations' own heading
// must render smaller than Active Cases' heading (20px), so it reads as
// secondary rather than co-equal with the user's actual workload.
// Content/ranking/click-through are untouched — only asserting the
// heading isn't full-size.
describe('HomeScreen — Compass Recommendations prominence (Phase 7.5B, item 7)', () => {
  it('renders the Compass Recommendations heading smaller than the Active cases heading', () => {
    const cs = { id: 'c3', employeeName: 'Some Case', caseType: 'misconduct' };
    const caseSignals = [{ id: 's2', caseId: 'c3', type: 'next_action', status: 'open', title: 'Do the thing' }];
    render(<HomeScreen {...baseHomeProps} cases={[cs]} caseSignals={caseSignals} />);
    // "Active cases" also appears as a stat-card label (11px caption) —
    // the section heading itself is the larger of the two matches.
    const activeCasesHeading = screen.getAllByText('Active cases').sort((a,b)=>Number(b.style.fontSize.replace('px',''))-Number(a.style.fontSize.replace('px','')))[0];
    const recommendationsHeading = screen.getByText('Compass Recommendations');
    expect(Number(recommendationsHeading.style.fontSize.replace('px',''))).toBeLessThan(Number(activeCasesHeading.style.fontSize.replace('px','')));
    // Functionality must survive the presentation change: the
    // recommendation itself still renders and is still findable.
    expect(screen.getByText('Do the thing')).toBeInTheDocument();
  });
});
