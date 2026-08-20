import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AppealIntelligencePanel } from '../components/AppealIntelligencePanel.jsx';

function finding(id, caseId, extra = {}) {
  return { id, caseId, status: 'substantiated', ...extra };
}

// Organisational ER Intelligence (Phase 6, OP11, §8)
describe('AppealIntelligencePanel', () => {
  it('shows a data-quality caveat when there are too few findings', () => {
    render(<AppealIntelligencePanel allegations={[finding('a1', 'c1')]} cases={[]} caseSignals={[]}/>);
    expect(screen.getByText('Limited data')).toBeInTheDocument();
  });

  it('shows the appeal rate once the sample size is met', () => {
    const allegations = [finding('a1', 'c1'), finding('a2', 'c1'), finding('a3', 'c1', { appealOutcome: 'upheld' })];
    render(<AppealIntelligencePanel allegations={allegations} cases={[]} caseSignals={[]}/>);
    expect(screen.getByText('33%')).toBeInTheDocument();
    expect(screen.getByText(/1 of 3 findings appealed/)).toBeInTheDocument();
  });

  it('shows outcome breakdown, stage breakdown, and common grounds together', () => {
    const allegations = [finding('a1', 'c1', { appealOutcome: 'upheld' })];
    const cases = [{ id: 'c1', meetings: [{ type: 'Disciplinary Appeal', record: 'notes' }] }];
    const caseSignals = [{ caseId: 'c1', type: 'process_risk', title: 'Appeal ground: The sanction was disproportionate' }];
    render(<AppealIntelligencePanel allegations={allegations} cases={cases} caseSignals={caseSignals}/>);
    expect(screen.getByText('Appeal upheld')).toBeInTheDocument();
    expect(screen.getByText('Disciplinary')).toBeInTheDocument();
    expect(screen.getByText(/The sanction was disproportionate/)).toBeInTheDocument();
  });

  it('shows empty states when there is no data at all', () => {
    render(<AppealIntelligencePanel allegations={[]} cases={[]} caseSignals={[]}/>);
    expect(screen.getByText('No appeal outcomes recorded yet.')).toBeInTheDocument();
    expect(screen.getByText('No successful appeals with a recorded appeal meeting yet.')).toBeInTheDocument();
    expect(screen.getByText('No appeal grounds recorded yet.')).toBeInTheDocument();
  });
});
