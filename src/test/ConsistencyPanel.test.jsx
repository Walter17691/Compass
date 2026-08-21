import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ConsistencyPanel } from '../components/ConsistencyPanel.jsx';

// Phase 6.5 hardening (Batch 9) — had no dedicated test coverage at all;
// only reachable indirectly through AllegationsPanel. The comparable-
// case accordion toggle was a plain <div onClick>, keyboard-unreachable
// with no accessible role — now a real <button aria-expanded>.
const cs = { id: 'c1', caseType: 'misconduct' };
const comparableCases = [{
  key: 'other1',
  outcome: 'Final written warning',
  findings: [{ status: 'substantiated', label: 'Substantiated', reasoningExcerpt: 'CCTV footage confirmed the conduct.' }],
}];
const notApplicable = { applicable: false, total: 0 };

describe('ConsistencyPanel', () => {
  it('renders nothing when there is no sanction distribution and no comparable cases', () => {
    const { container } = render(<ConsistencyPanel cs={cs} sanctionDistribution={notApplicable} comparableCases={[]} consistencyReview={null} consistencyReviewLoading={false} onGenerateReview={vi.fn()} onAskWhy={vi.fn()}/>);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders the comparable-case toggle as a real button, collapsed by default', () => {
    render(<ConsistencyPanel cs={cs} sanctionDistribution={notApplicable} comparableCases={comparableCases} consistencyReview={null} consistencyReviewLoading={false} onGenerateReview={vi.fn()} onAskWhy={vi.fn()}/>);
    const toggle = screen.getByRole('button', { name: /misconduct — Final written warning/ });
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('CCTV footage confirmed the conduct.')).not.toBeInTheDocument();
  });

  it('expands the comparable case on click, showing its findings, and collapses again on a second click', async () => {
    const user = userEvent.setup();
    render(<ConsistencyPanel cs={cs} sanctionDistribution={notApplicable} comparableCases={comparableCases} consistencyReview={null} consistencyReviewLoading={false} onGenerateReview={vi.fn()} onAskWhy={vi.fn()}/>);
    const toggle = screen.getByRole('button', { name: /misconduct — Final written warning/ });
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText(/CCTV footage confirmed the conduct/)).toBeInTheDocument();
    await user.click(toggle);
    expect(toggle).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('CCTV footage confirmed the conduct.')).not.toBeInTheDocument();
  });

  it('is keyboard-operable (Enter toggles it, same as a real button)', async () => {
    const user = userEvent.setup();
    render(<ConsistencyPanel cs={cs} sanctionDistribution={notApplicable} comparableCases={comparableCases} consistencyReview={null} consistencyReviewLoading={false} onGenerateReview={vi.fn()} onAskWhy={vi.fn()}/>);
    const toggle = screen.getByRole('button', { name: /misconduct — Final written warning/ });
    toggle.focus();
    await user.keyboard('{Enter}');
    expect(toggle).toHaveAttribute('aria-expanded', 'true');
  });
});
