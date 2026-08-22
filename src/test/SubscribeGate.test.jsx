import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import SubscribeGate from '../SubscribeGate.jsx';

// Phase 6.5 hardening (Batch 13) — the phone/preferred-time/notes fields
// relied on placeholder text alone, with no other accessible name. Had
// no test coverage at all before this.
describe('SubscribeGate — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the phone, preferred time, and notes fields', () => {
    render(<SubscribeGate org={{ name: 'Acme Ltd' }} syncing={false} onCancel={() => {}} onSignOut={() => {}} />);
    expect(screen.getByLabelText('Phone number')).toBeInTheDocument();
    expect(screen.getByLabelText('Best time to call')).toBeInTheDocument();
    expect(screen.getByLabelText('Anything we should know before the call?')).toBeInTheDocument();
  });
});
