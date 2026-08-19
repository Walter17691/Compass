import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DataQualityCaveat } from '../components/DataQualityCaveat.jsx';

// Organisational ER Intelligence (Phase 6, OP1, §21/§24) — generalises
// the applicable/total threshold shape already used by
// outcomeConsistency.js/orgIntelligence.js into one shared caveat surface.
describe('DataQualityCaveat', () => {
  it('shows a zero-data message when there is nothing for the period', () => {
    render(<DataQualityCaveat total={0} minRequired={3} label="cases"/>);
    expect(screen.getByText(/No cases available for this period yet/)).toBeInTheDocument();
  });

  it('shows the count and threshold when some data exists but not enough', () => {
    render(<DataQualityCaveat total={2} minRequired={3} label="cases"/>);
    expect(screen.getByText(/Only 2 cases available for this period \(at least 3 needed/)).toBeInTheDocument();
  });

  it('uses the provided label', () => {
    render(<DataQualityCaveat total={1} minRequired={2} label="appeals"/>);
    expect(screen.getByText(/1 appeals available/)).toBeInTheDocument();
  });
});
