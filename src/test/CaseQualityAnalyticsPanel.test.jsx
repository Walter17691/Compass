import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
