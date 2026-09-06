import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaseQualityAnalyticsPanel } from '../components/CaseQualityAnalyticsPanel.jsx';

// Organisational ER Intelligence (Phase 6, OP12, §9)
describe('CaseQualityAnalyticsPanel', () => {
  it('shows a data-quality caveat below the minimum sample size', () => {
    const cases = [{ id: 'c1' }, { id: 'c2' }];
    render(<CaseQualityAnalyticsPanel cases={cases} allegations={[]} caseSignals={[]} caseTasks={[]} policies={[]} caseAccess={[]} orgMembers={[]}/>);
    expect(screen.getByText('Limited data')).toBeInTheDocument();
  });

  it('shows recurring issues once the sample size is met', () => {
    const cases = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
    const allegations = [
      { id: 'a1', caseId: 'c1', title: 'X', description: 'd' },
      { id: 'a2', caseId: 'c2', title: 'X', description: 'd' },
      { id: 'a3', caseId: 'c3', title: 'X', description: 'd' },
    ];
    render(<CaseQualityAnalyticsPanel cases={cases} allegations={allegations} caseSignals={[]} caseTasks={[]} policies={[]} caseAccess={[]} orgMembers={[]}/>);
    expect(screen.getByText('Evidence linked to each allegation')).toBeInTheDocument();
    expect(screen.getAllByText(/3 cases \(100%\)/).length).toBeGreaterThan(0);
  });

  it('shows an empty state when no issues recur across enough cases', () => {
    const cases = [{ id: 'c1' }, { id: 'c2' }, { id: 'c3' }];
    render(<CaseQualityAnalyticsPanel cases={cases} allegations={[]} caseSignals={[]} caseTasks={[]} policies={[]} caseAccess={[]} orgMembers={[]}/>);
    expect(screen.getByText(/No recurring case-quality issues identified across 3 cases/)).toBeInTheDocument();
  });
});

// Insights Phase 5 (Process Quality drill-down)
describe('CaseQualityAnalyticsPanel — drill-down (Insights Phase 5)', () => {
  // Every case below has an allegation with no employeeResponse, so each
  // fixture's own case count IS the "employee_responded" issue's count —
  // the exact number this section's own privacy floor (>=3) gates on.
  const casesOf = n => Array.from({ length: n }, (_, i) => ({ id: `c${i}` }));
  const allegationsOf = n => Array.from({ length: n }, (_, i) => ({ id: `a${i}`, caseId: `c${i}`, title: 'X', description: 'd' }));
  // Panel-level CASE_QUALITY_MIN_SAMPLE_SIZE is 3, so every fixture here
  // also pads totalCases to at least 3 with cases that carry no
  // allegations at all (readiness inapplicable to them, so they never
  // contribute to the issue's own count) — isolating the drill-down
  // floor test from the whole-panel sample-size gate.
  const pad = extra => Array.from({ length: extra }, (_, i) => ({ id: `pad${i}` }));

  it('count 1: no "View cases" drill-down', () => {
    render(<CaseQualityAnalyticsPanel cases={[...casesOf(1), ...pad(2)]} allegations={allegationsOf(1)} caseSignals={[]} caseTasks={[]} policies={[]} caseAccess={[]} orgMembers={[]} onViewCases={vi.fn()}/>);
    expect(screen.getByText('Evidence linked to each allegation')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'View cases →' })).not.toBeInTheDocument();
  });

  it('count 2: no "View cases" drill-down', () => {
    render(<CaseQualityAnalyticsPanel cases={[...casesOf(2), ...pad(1)]} allegations={allegationsOf(2)} caseSignals={[]} caseTasks={[]} policies={[]} caseAccess={[]} orgMembers={[]} onViewCases={vi.fn()}/>);
    expect(screen.queryByRole('button', { name: 'View cases →' })).not.toBeInTheDocument();
  });

  it('count 3: "View cases" drill-down is available', () => {
    render(<CaseQualityAnalyticsPanel cases={casesOf(3)} allegations={allegationsOf(3)} caseSignals={[]} caseTasks={[]} policies={[]} caseAccess={[]} orgMembers={[]} onViewCases={vi.fn()}/>);
    expect(screen.getAllByRole('button', { name: 'View cases →' }).length).toBeGreaterThan(0);
  });

  it('count >3: "View cases" drill-down is available', () => {
    render(<CaseQualityAnalyticsPanel cases={casesOf(5)} allegations={allegationsOf(5)} caseSignals={[]} caseTasks={[]} policies={[]} caseAccess={[]} orgMembers={[]} onViewCases={vi.fn()}/>);
    expect(screen.getAllByRole('button', { name: 'View cases →' }).length).toBeGreaterThan(0);
  });

  it('never shows the drill-down when onViewCases is not provided, regardless of count', () => {
    render(<CaseQualityAnalyticsPanel cases={casesOf(5)} allegations={allegationsOf(5)} caseSignals={[]} caseTasks={[]} policies={[]} caseAccess={[]} orgMembers={[]}/>);
    expect(screen.queryByRole('button', { name: 'View cases →' })).not.toBeInTheDocument();
  });

  it('calls onViewCases with exactly the caseIds behind that issue', async () => {
    const user = userEvent.setup();
    const onViewCases = vi.fn();
    render(<CaseQualityAnalyticsPanel cases={casesOf(3)} allegations={allegationsOf(3)} caseSignals={[]} caseTasks={[]} policies={[]} caseAccess={[]} orgMembers={[]} onViewCases={onViewCases}/>);
    await user.click(screen.getAllByRole('button', { name: 'View cases →' })[0]);
    expect(onViewCases).toHaveBeenCalledTimes(1);
    const arg = onViewCases.mock.calls[0][0];
    expect(new Set(arg.caseIds)).toEqual(new Set(['c0', 'c1', 'c2']));
  });

  it('does not change existing rendered counts/percentages when onViewCases is added', () => {
    render(<CaseQualityAnalyticsPanel cases={casesOf(3)} allegations={allegationsOf(3)} caseSignals={[]} caseTasks={[]} policies={[]} caseAccess={[]} orgMembers={[]} onViewCases={vi.fn()}/>);
    expect(screen.getAllByText(/3 cases \(100%\)/).length).toBeGreaterThan(0);
  });
});
