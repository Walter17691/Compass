import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PolicyEffectivenessPanel } from '../components/PolicyEffectivenessPanel.jsx';

// Organisational ER Intelligence (Phase 6, OP13, §10)
describe('PolicyEffectivenessPanel', () => {
  it('shows a data-quality caveat below the minimum sample size', () => {
    const caseSignals = [{ caseId: 'c1', sourceRefs: [{ kind: 'policy', label: 'Disciplinary Policy' }] }];
    render(<PolicyEffectivenessPanel caseSignals={caseSignals} hrReviewRequests={[]}/>);
    expect(screen.getByText('Limited data')).toBeInTheDocument();
  });

  it('shows policy reference counts by name once the sample size is met', () => {
    const caseSignals = [
      { caseId: 'c1', sourceRefs: [{ kind: 'policy', label: 'Flexible Working Policy' }] },
      { caseId: 'c2', sourceRefs: [{ kind: 'policy', label: 'Flexible Working Policy' }] },
      { caseId: 'c3', sourceRefs: [{ kind: 'policy', label: 'Flexible Working Policy' }] },
    ];
    render(<PolicyEffectivenessPanel caseSignals={caseSignals} hrReviewRequests={[]}/>);
    expect(screen.getByText('Flexible Working Policy')).toBeInTheDocument();
    expect(screen.getByText('3 cases')).toBeInTheDocument();
  });

  it('shows the clarification-request total as a separate, non-attributed figure', () => {
    const caseSignals = [
      { caseId: 'c1', sourceRefs: [{ kind: 'policy', label: 'X' }] },
      { caseId: 'c2', sourceRefs: [{ kind: 'policy', label: 'X' }] },
      { caseId: 'c3', sourceRefs: [{ kind: 'policy', label: 'X' }] },
    ];
    const hrReviewRequests = [{ status: 'clarification_requested' }, { status: 'clarification_requested' }];
    render(<PolicyEffectivenessPanel caseSignals={caseSignals} hrReviewRequests={hrReviewRequests}/>);
    expect(screen.getByText(/2 clarification requests raised on investigations this year/)).toBeInTheDocument();
    expect(screen.getByText(/not attributable to a specific policy/)).toBeInTheDocument();
  });

  it('does not show a clarification line when there are none', () => {
    const caseSignals = [
      { caseId: 'c1', sourceRefs: [{ kind: 'policy', label: 'X' }] },
      { caseId: 'c2', sourceRefs: [{ kind: 'policy', label: 'X' }] },
      { caseId: 'c3', sourceRefs: [{ kind: 'policy', label: 'X' }] },
    ];
    render(<PolicyEffectivenessPanel caseSignals={caseSignals} hrReviewRequests={[]}/>);
    expect(screen.queryByText(/clarification request/)).not.toBeInTheDocument();
  });
});
