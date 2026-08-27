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

  it('shows outcome breakdown, stage breakdown, and common grounds together once each clears the sample-size floor', () => {
    const allegations = [
      finding('a1', 'c1', { appealOutcome: 'upheld' }),
      finding('a2', 'c2', { appealOutcome: 'upheld' }),
      finding('a3', 'c3', { appealOutcome: 'upheld' }),
    ];
    const cases = [
      { id: 'c1', meetings: [{ type: 'Disciplinary Appeal', record: 'notes' }] },
      { id: 'c2', meetings: [{ type: 'Disciplinary Appeal', record: 'notes' }] },
      { id: 'c3', meetings: [{ type: 'Disciplinary Appeal', record: 'notes' }] },
    ];
    const caseSignals = [
      { caseId: 'c1', type: 'process_risk', status: 'open', title: 'Appeal ground: The sanction was disproportionate' },
      { caseId: 'c2', type: 'process_risk', status: 'open', title: 'Appeal ground: The sanction was disproportionate' },
      { caseId: 'c3', type: 'process_risk', status: 'open', title: 'Appeal ground: The sanction was disproportionate' },
    ];
    render(<AppealIntelligencePanel allegations={allegations} cases={cases} caseSignals={caseSignals}/>);
    expect(screen.getByText('Appeal upheld')).toBeInTheDocument();
    expect(screen.getByText('Disciplinary')).toBeInTheDocument();
    expect(screen.getByText(/The sanction was disproportionate/)).toBeInTheDocument();
  });

  // Phase 6.5 hardening (product-principles review) — outcome/stage/
  // ground breakdowns previously showed as soon as there was ANY data
  // (even a single appeal presented as "100% upheld"), with no
  // sample-size floor of their own — only the top-line appeal rate had
  // one. Each breakdown now gates independently behind the same
  // APPEAL_MIN_SAMPLE_SIZE floor.
  it('shows a data-quality caveat for each breakdown when built on just 1 or 2 data points, not a raw distribution', () => {
    const allegations = [finding('a1', 'c1', { appealOutcome: 'upheld' })];
    const cases = [{ id: 'c1', meetings: [{ type: 'Disciplinary Appeal', record: 'notes' }] }];
    const caseSignals = [{ caseId: 'c1', type: 'process_risk', status: 'open', title: 'Appeal ground: The sanction was disproportionate' }];
    render(<AppealIntelligencePanel allegations={allegations} cases={cases} caseSignals={caseSignals}/>);
    expect(screen.queryByText('Appeal upheld')).not.toBeInTheDocument();
    expect(screen.queryByText('Disciplinary')).not.toBeInTheDocument();
    expect(screen.queryByText(/The sanction was disproportionate/)).not.toBeInTheDocument();
    // 4, not 3: the top-line appeal-rate stat box also falls below its
    // own floor with only 1 finding recorded, alongside the three
    // breakdown sections.
    const caveats = screen.getAllByText('Limited data');
    expect(caveats.length).toBe(4);
  });

  it('shows empty states when there is no data at all', () => {
    render(<AppealIntelligencePanel allegations={[]} cases={[]} caseSignals={[]}/>);
    expect(screen.getByText('No appeal outcomes recorded yet.')).toBeInTheDocument();
    expect(screen.getByText('No successful appeals with a recorded appeal meeting yet.')).toBeInTheDocument();
    expect(screen.getByText('No appeal grounds recorded yet.')).toBeInTheDocument();
  });
});
