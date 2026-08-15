import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AutomationSuggestionsPanel } from '../components/AutomationSuggestionsPanel.jsx';

describe('AutomationSuggestionsPanel', () => {
  it('renders nothing when there are no suggestions', () => {
    const { container } = render(<AutomationSuggestionsPanel suggestions={[]} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders nothing when suggestions is undefined', () => {
    const { container } = render(<AutomationSuggestionsPanel />);
    expect(container).toBeEmptyDOMElement();
  });

  it('renders a label, reason and category for each suggestion', () => {
    render(<AutomationSuggestionsPanel suggestions={[
      { ruleId: 'overdue_task', category: 'task', label: 'Review overdue task', reason: '"Chase witness statement" was due 2026-08-10.' },
      { ruleId: 'process_risk_open', category: 'risk', label: 'Review procedural guardrail flag', reason: 'Notice period too short' },
    ]} />);
    expect(screen.getByText('Suggested for this case')).toBeInTheDocument();
    expect(screen.getByText('Review overdue task')).toBeInTheDocument();
    expect(screen.getByText('"Chase witness statement" was due 2026-08-10.')).toBeInTheDocument();
    expect(screen.getByText('TASK')).toBeInTheDocument();
    expect(screen.getByText('Review procedural guardrail flag')).toBeInTheDocument();
    expect(screen.getByText('RISK')).toBeInTheDocument();
  });
});
