import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProcessChecklistPanel } from '../components/ProcessChecklistPanel.jsx';

// Phase 6.5 hardening (Batch 9) — target_days>0 && <span> used to be a
// plain truthy check (target_days && <span>). {0 && <jsx>} evaluates to
// the number 0, and React renders that as a literal "0" text node
// instead of hiding the line — had no test coverage at all before this.
describe('ProcessChecklistPanel', () => {
  it('renders nothing when the template has no content at all', () => {
    const { container } = render(<ProcessChecklistPanel template={{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing for a null template', () => {
    const { container } = render(<ProcessChecklistPanel template={null} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('shows the target-days line for a real target', () => {
    render(<ProcessChecklistPanel template={{ target_days: 5 }} />);
    expect(screen.getByText('Target:')).toBeInTheDocument();
    expect(screen.getByText('5 days per stage')).toBeInTheDocument();
  });

  it('does not render a stray "0" and hides the whole section when target_days is 0 and nothing else is set', () => {
    const { container } = render(<ProcessChecklistPanel template={{ target_days: 0 }} />);
    expect(container).toBeEmptyDOMElement();
    expect(container.textContent).not.toContain('0');
  });

  it('does not render a stray "0" for the target line when target_days is 0 but a policy is linked', () => {
    render(<ProcessChecklistPanel template={{ target_days: 0, policy_category: 'disciplinary' }} />);
    expect(screen.getByText(/Linked policy/)).toBeInTheDocument();
    expect(screen.queryByText('Target:')).not.toBeInTheDocument();
    expect(screen.queryByText(/^0$/)).not.toBeInTheDocument();
  });

  it('does not render the separator dot when target_days is 0, even with a policy linked', () => {
    render(<ProcessChecklistPanel template={{ target_days: 0, policy_category: 'disciplinary' }} />);
    const line = screen.getByText(/Linked policy/).closest('div');
    expect(line.textContent).not.toContain('·');
  });

  it('renders both the policy and target lines with the separator when both are real', () => {
    render(<ProcessChecklistPanel template={{ target_days: 10, policy_category: 'disciplinary' }} />);
    const line = screen.getByText(/Linked policy/).closest('div');
    expect(line.textContent).toContain('·');
    expect(screen.getByText('10 days per stage')).toBeInTheDocument();
  });
});
