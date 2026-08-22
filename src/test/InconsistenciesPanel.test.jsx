import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InconsistenciesPanel } from '../components/InconsistenciesPanel.jsx';

// Phase 6.5 hardening (Batch 13) — the "link to allegation" select had
// no accessible name at all. Had no test coverage at all before this.
const noop = () => {};
const cs = { id: 'c1', meetings: [{ record: {} }] };
const signals = [{ id: 'sig1', title: 'Conflicting accounts of the incident date', status: 'open', sourceRefs: [] }];
const allegations = [{ id: 'a1', caseId: 'c1', title: 'Unauthorised absence' }];

describe('InconsistenciesPanel — field labelling (Phase 6.5, Batch 13)', () => {
  it('names the "link to allegation" select after the signal', () => {
    render(<InconsistenciesPanel cs={cs} signals={signals} loading={false} onCheck={noop} changeSignalStatus={noop} createCaseTask={noop} allegations={allegations} onLinkAllegation={noop} onAskWhy={noop} />);
    expect(screen.getByLabelText('Link "Conflicting accounts of the incident date" to allegation')).toBeInTheDocument();
  });
});
