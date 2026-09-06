import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const rpcMock = vi.fn();
vi.mock('../supabase', () => ({ supabase: { rpc: (...args) => rpcMock(...args) } }));

const { TrendsPanel } = await import('../components/TrendsPanel.jsx');

// Organisational ER Intelligence (Phase 6, OP7/OP8, §2/§4)
describe('TrendsPanel', () => {
  beforeEach(() => { rpcMock.mockReset(); });

  it('shows a loading state, then a significant trend', async () => {
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [{ caseType: 'grievance', currentCount: 13, previousCount: 10, byLocation: { Manchester: 6, Leeds: 4 } }], by_theme_trend: [] },
      error: null,
    });
    render(<TrendsPanel orgId="org1"/>);
    expect(screen.getByText(/Loading trends/)).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Compass has identified a pattern/)).toBeInTheDocument());
    expect(screen.getByText(/grievance cases increased 30%/)).toBeInTheDocument();
  });

  it('shows an empty state when no trend clears the significance threshold', async () => {
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [{ caseType: 'grievance', currentCount: 11, previousCount: 10, byLocation: {} }], by_theme_trend: [] },
      error: null,
    });
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText('No significant trends identified in the current period.')).toBeInTheDocument());
  });

  it('shows an error state when the RPC fails', async () => {
    rpcMock.mockResolvedValue({ data: null, error: new Error('boom') });
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText("Couldn't load trend data right now.")).toBeInTheDocument());
  });

  it('renders both type and theme trends', async () => {
    rpcMock.mockResolvedValue({
      data: {
        by_type_trend: [{ caseType: 'grievance', currentCount: 13, previousCount: 10, byLocation: {} }],
        by_theme_trend: [{ themeId: 't1', themeName: 'Rota changes', currentCount: 5, previousCount: 0, byLocation: {} }],
      },
      error: null,
    });
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText(/grievance cases increased/)).toBeInTheDocument());
    expect(screen.getByText(/Rota changes had no recorded cases/)).toBeInTheDocument();
  });

  it('shows an Explore button only on theme trend cards, and opens root-cause exploration', async () => {
    const user = userEvent.setup();
    rpcMock.mockImplementation((fn) => {
      if (fn === 'org_trend_detection') return Promise.resolve({
        data: {
          by_type_trend: [{ caseType: 'grievance', currentCount: 13, previousCount: 10, byLocation: {} }],
          by_theme_trend: [{ themeId: 't1', themeName: 'Rota changes', currentCount: 13, previousCount: 10, byLocation: {} }],
        },
        error: null,
      });
      if (fn === 'org_theme_root_cause') return Promise.resolve({
        data: { current_count: 13, by_location: {}, co_occurring_themes: [] },
        error: null,
      });
      return Promise.resolve({ data: null, error: null });
    });
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText(/grievance cases increased/)).toBeInTheDocument());
    expect(screen.getAllByRole('button', { name: 'Explore' })).toHaveLength(1);
    await user.click(screen.getByRole('button', { name: 'Explore' }));
    await waitFor(() => expect(screen.getByText('Related patterns — Rota changes')).toBeInTheDocument());
    expect(rpcMock).toHaveBeenCalledWith('org_theme_root_cause', { p_org_id: 'org1', p_theme_id: 't1', p_period_days: 90 });
  });

  it('shows a Show evidence button on every trend card and opens InsightEvidenceModal with real metrics', async () => {
    const user = userEvent.setup();
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [{ caseType: 'grievance', currentCount: 13, previousCount: 10, byLocation: {} }], by_theme_trend: [] },
      error: null,
    });
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText(/grievance cases increased/)).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'Show evidence' }));
    expect(screen.getByText('grievance')).toBeInTheDocument();
    expect(screen.getByText('Current period count')).toBeInTheDocument();
    expect(screen.getByText('13')).toBeInTheDocument();
    expect(screen.getByText(/^Period:/)).toBeInTheDocument();
  });

  // Organisational ER Intelligence (Phase 6, OP21, §17)
  it('shows a Create action control only when createCaseTask is passed in, and calls it with a real insightRef', async () => {
    const user = userEvent.setup();
    const createCaseTask = vi.fn();
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [{ caseType: 'grievance', currentCount: 13, previousCount: 10, byLocation: {} }], by_theme_trend: [] },
      error: null,
    });
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText(/grievance cases increased/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'Create action' })).not.toBeInTheDocument();

    render(<TrendsPanel orgId="org1" createCaseTask={createCaseTask}/>);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'Create action' }).length).toBeGreaterThan(0));
    await user.click(screen.getAllByRole('button', { name: 'Create action' })[0]);
    await user.type(screen.getByPlaceholderText('Action to take…'), 'Review shift patterns');
    await user.click(screen.getByRole('button', { name: 'Save action' }));
    expect(createCaseTask).toHaveBeenCalledWith(null, expect.objectContaining({ name: 'Review shift patterns', insightRef: expect.stringContaining('grievance') }));
  });
});

// daysAgoIso builds a real relative timestamp so computeOverallVolumeTrend's
// window (anchored on the real current time, same convention as
// OrganisationalIntelligenceOverview.test.jsx's own fixtures) lands
// deterministically inside or outside the 90-day window regardless of
// when this suite runs.
const daysAgoIso = (days) => new Date(Date.now() - days * 24 * 60 * 60 * 1000).toISOString();
const NO_TRENDS = { by_type_trend: [], by_theme_trend: [] };

// Insights Phase 4 (Trends & Themes) — the overall-volume headline reuses
// Phase 3's own computeOverallVolumeTrend/describeVolumeSignal, but is
// deliberately NOT gated by isSignificantTrend/isSignificantDecrease the
// way Phase 3's Overview "Emerging patterns" line is — the plain current-
// period count is always worth stating here; only individual trend CARDS
// below it are significance-gated.
describe('TrendsPanel — overall-volume headline (Insights Phase 4)', () => {
  beforeEach(() => { rpcMock.mockReset(); rpcMock.mockResolvedValue({ data: NO_TRENDS, error: null }); });

  it('shows the headline with a significant increase', async () => {
    const cases = Array.from({ length: 13 }, (_, i) => ({ id: `c${i}`, createdAt: daysAgoIso(10) }))
      .concat(Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, createdAt: daysAgoIso(100) })));
    render(<TrendsPanel orgId="org1" cases={cases}/>);
    await waitFor(() => expect(screen.getByText('13 cases were opened in the last 90 days, up 30% from 10 in the previous 90 days.')).toBeInTheDocument());
  });

  it('still shows the plain current-period count when the change is below the significance threshold', async () => {
    // +9% — real change, but below the 20% significance gate. Phase 3's
    // Overview would hide this entirely; Trends & Themes' headline must not.
    const cases = Array.from({ length: 11 }, (_, i) => ({ id: `c${i}`, createdAt: daysAgoIso(10) }))
      .concat(Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, createdAt: daysAgoIso(100) })));
    render(<TrendsPanel orgId="org1" cases={cases}/>);
    await waitFor(() => expect(screen.getByText('11 cases were opened in the last 90 days, up 10% from 10 in the previous 90 days.')).toBeInTheDocument());
  });

  it('handles a zero-denominator comparison without a fabricated percentage', async () => {
    const cases = Array.from({ length: 4 }, (_, i) => ({ id: `c${i}`, createdAt: daysAgoIso(10) }));
    render(<TrendsPanel orgId="org1" cases={cases}/>);
    await waitFor(() => expect(screen.getByText('4 cases were opened in the last 90 days, compared with none in the previous 90 days.')).toBeInTheDocument());
  });

  it('counts a case with a blank case_type ("+ New meeting" quick-start shape)', async () => {
    const cases = [{ id: 'c1', caseType: '', createdAt: daysAgoIso(2) }];
    render(<TrendsPanel orgId="org1" cases={cases}/>);
    await waitFor(() => expect(screen.getByText('1 case was opened in the last 90 days, compared with none in the previous 90 days.')).toBeInTheDocument());
  });

  it('still counts a case that has since closed, using createdAt not current stage', async () => {
    const cases = [{ id: 'c1', stage: 'closed', createdAt: daysAgoIso(5) }];
    render(<TrendsPanel orgId="org1" cases={cases}/>);
    await waitFor(() => expect(screen.getByText('1 case was opened in the last 90 days, compared with none in the previous 90 days.')).toBeInTheDocument());
  });

  it('defaults to zero cases gracefully when the cases prop is omitted entirely', async () => {
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText(/^0 cases were opened in the last 90 days/)).toBeInTheDocument());
  });

  it('never uses unsupported causal or evaluative language in the headline', async () => {
    const cases = Array.from({ length: 8 }, (_, i) => ({ id: `c${i}`, createdAt: daysAgoIso(10) }))
      .concat(Array.from({ length: 10 }, (_, i) => ({ id: `p${i}`, createdAt: daysAgoIso(100) })));
    render(<TrendsPanel orgId="org1" cases={cases}/>);
    await waitFor(() => expect(screen.getByText(/opened in the last 90 days/)).toBeInTheDocument());
    expect(screen.queryByText(/risk|worsened|deteriorated|improved|caused/i)).not.toBeInTheDocument();
  });
});

// Insights Phase 4 (Trends & Themes) — theme trends now surface material
// declines (isSignificantDecrease) alongside the existing increases
// (isSignificantTrend), ranked by magnitude. Case-type trends are
// deliberately untouched — declining case-type trends are out of this
// phase's approved scope.
describe('TrendsPanel — declining theme trends (Insights Phase 4)', () => {
  beforeEach(() => { rpcMock.mockReset(); });

  it('renders a theme decline with factual, non-evaluative wording', async () => {
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [], by_theme_trend: [{ themeId: 't1', themeName: 'Communication', currentCount: 6, previousCount: 9, byLocation: {} }] },
      error: null,
    });
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText(/Communication cases decreased 33%/)).toBeInTheDocument());
    expect(screen.queryByText(/improv/i)).not.toBeInTheDocument();
  });

  it('exactly -20% clears the gate; a smaller decline is suppressed', async () => {
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [], by_theme_trend: [{ themeId: 't1', themeName: 'Rota changes', currentCount: 8, previousCount: 10, byLocation: {} }] },
      error: null,
    });
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText(/Rota changes cases decreased 20%/)).toBeInTheDocument());
  });

  it('suppresses a decline when the previous-period count is below the minimum sample size', async () => {
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [], by_theme_trend: [{ themeId: 't1', themeName: 'Rare theme', currentCount: 0, previousCount: 2, byLocation: {} }] },
      error: null,
    });
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText('No significant trends identified in the current period.')).toBeInTheDocument());
  });

  it('a decline to zero current count is still surfaced once the previous period clears the sample floor', async () => {
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [], by_theme_trend: [{ themeId: 't1', themeName: 'Retired theme', currentCount: 0, previousCount: 5, byLocation: {} }] },
      error: null,
    });
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText(/Retired theme cases decreased 100%/)).toBeInTheDocument());
  });

  it('leaves increase behaviour on theme trends completely unchanged', async () => {
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [], by_theme_trend: [{ themeId: 't1', themeName: 'Rota changes', currentCount: 13, previousCount: 10, byLocation: {} }] },
      error: null,
    });
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText(/Rota changes cases increased 30%/)).toBeInTheDocument());
  });

  it('leaves case-type trend rendering increase-only (no decline support for types in this phase)', async () => {
    rpcMock.mockResolvedValue({
      data: { by_type_trend: [{ caseType: 'absence', currentCount: 6, previousCount: 10, byLocation: {} }], by_theme_trend: [] },
      error: null,
    });
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText('No significant trends identified in the current period.')).toBeInTheDocument());
    expect(screen.queryByText(/absence/)).not.toBeInTheDocument();
  });

  it('ranks a significant decline above a smaller significant increase', async () => {
    rpcMock.mockResolvedValue({
      data: {
        by_type_trend: [],
        by_theme_trend: [
          { themeId: 't1', themeName: 'Rota changes', currentCount: 13, previousCount: 10, byLocation: {} }, // +30%
          { themeId: 't2', themeName: 'Communication', currentCount: 6, previousCount: 10, byLocation: {} }, // -40%
        ],
      },
      error: null,
    });
    render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getAllByText(/Trend identified/).length).toBe(2));
    const headings = screen.getAllByText(/cases (increased|decreased)/).map(el => el.textContent);
    expect(headings[0]).toMatch(/Communication cases decreased/); // -40% ranks above +30%
    expect(headings[1]).toMatch(/Rota changes cases increased/);
  });
});

// Insights Phase 4 (Trends & Themes drill-down) — a theme signal is no
// longer a dead end: "View cases →" resolves themeId back into real case
// ids (via themeCaseIdsInPeriod) and hands them, plus the matching
// creation-date range, to the same onViewCases the Overview tab already
// uses (Phase 2's caseIds deep-link mechanism) — no second case browser,
// no new query.
describe('TrendsPanel — theme drill-down (Insights Phase 4)', () => {
  beforeEach(() => { rpcMock.mockReset(); });

  const themeData = {
    by_type_trend: [{ caseType: 'grievance', currentCount: 13, previousCount: 10, byLocation: {} }],
    by_theme_trend: [{ themeId: 't1', themeName: 'Rota changes', currentCount: 13, previousCount: 10, byLocation: {} }],
  };

  it('shows "View cases" only on theme cards, only when onViewCases is provided', async () => {
    rpcMock.mockResolvedValue({ data: themeData, error: null });
    const { rerender } = render(<TrendsPanel orgId="org1"/>);
    await waitFor(() => expect(screen.getByText(/Rota changes cases increased/)).toBeInTheDocument());
    expect(screen.queryByRole('button', { name: 'View cases →' })).not.toBeInTheDocument();

    rerender(<TrendsPanel orgId="org1" onViewCases={vi.fn()}/>);
    await waitFor(() => expect(screen.getAllByRole('button', { name: 'View cases →' })).toHaveLength(1));
  });

  it('resolves the theme to the exact case ids created in-period, deduplicated, and hands over a matching date range', async () => {
    rpcMock.mockResolvedValue({ data: themeData, error: null });
    const onViewCases = vi.fn();
    const cases = [
      { id: 'c1', createdAt: daysAgoIso(10) }, // tagged, in period
      { id: 'c2', createdAt: daysAgoIso(10) }, // tagged twice, in period — must appear once
      { id: 'c3', createdAt: daysAgoIso(200) }, // tagged, out of period
      { id: 'c4', createdAt: daysAgoIso(10) }, // not tagged with this theme
    ];
    const caseThemes = [
      { id: 'ct1', caseId: 'c1', themeId: 't1' },
      { id: 'ct2', caseId: 'c2', themeId: 't1' },
      { id: 'ct3', caseId: 'c2', themeId: 't1' }, // duplicate link
      { id: 'ct4', caseId: 'c3', themeId: 't1' },
      { id: 'ct5', caseId: 'c4', themeId: 'other-theme' },
    ];
    const user = userEvent.setup();
    render(<TrendsPanel orgId="org1" cases={cases} caseThemes={caseThemes} onViewCases={onViewCases}/>);
    await waitFor(() => expect(screen.getByRole('button', { name: 'View cases →' })).toBeInTheDocument());
    await user.click(screen.getByRole('button', { name: 'View cases →' }));

    expect(onViewCases).toHaveBeenCalledTimes(1);
    const arg = onViewCases.mock.calls[0][0];
    expect(new Set(arg.caseIds)).toEqual(new Set(['c1', 'c2']));
    expect(arg.createdFrom).toBeTruthy();
    expect(arg.createdTo).toBeTruthy();
    expect(new Date(arg.createdFrom).getTime()).toBeLessThan(new Date(arg.createdTo).getTime());
  });
});
