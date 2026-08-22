import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AdjustmentForm } from '../components/AdjustmentForm.jsx';

// Phase 6.5 hardening (Batch 13) — the adjustment and review-date fields
// relied on placeholder text alone, with no other accessible name. Had
// no test coverage at all before this.
describe('AdjustmentForm — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the adjustment and review date fields', () => {
    render(<AdjustmentForm onAdd={() => {}} />);
    expect(screen.getByLabelText('Adjustment')).toBeInTheDocument();
    expect(screen.getByLabelText('Review date')).toBeInTheDocument();
  });
});
