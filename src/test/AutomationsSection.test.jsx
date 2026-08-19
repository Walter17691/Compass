import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AutomationsSection } from '../screens/settings/AutomationsSection.jsx';

describe('AutomationsSection (Phase 5, IP28)', () => {
  it('renders the automatable rule with its explanation, defaulting to Suggest', () => {
    render(<AutomationsSection automationLevels={{}} saveAutomationLevel={()=>{}} />);
    expect(screen.getByText('Chase signature on stale meeting records')).toBeInTheDocument();
    expect(screen.getByText(/Compass flags it for HR to review/)).toBeInTheDocument();
  });

  it('shows the currently configured level as selected and describes it', () => {
    render(<AutomationsSection automationLevels={{ unsigned_meeting_record_stale: 'prepare' }} saveAutomationLevel={()=>{}} />);
    expect(screen.getByText(/Compass drafts the action/)).toBeInTheDocument();
  });

  it('clicking a level button calls saveAutomationLevel with the rule id and new level', async () => {
    const user = userEvent.setup();
    const saveAutomationLevel = vi.fn();
    render(<AutomationsSection automationLevels={{}} saveAutomationLevel={saveAutomationLevel} />);
    await user.click(screen.getByRole('button', { name: 'Automate' }));
    expect(saveAutomationLevel).toHaveBeenCalledWith('unsigned_meeting_record_stale', 'automate');
  });

  it('renders all three level options for the rule', () => {
    render(<AutomationsSection automationLevels={{}} saveAutomationLevel={()=>{}} />);
    expect(screen.getByRole('button', { name: 'Suggest' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Prepare' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Automate' })).toBeInTheDocument();
  });
});

// Integrations & Workflow Automation (Phase 5, IP29, §24) — the
// never-automate list is always visible here, regardless of any level
// picked above, since it's a fixed constraint the picker can't override.
describe('AutomationsSection — never-automate list (Phase 5, IP29)', () => {
  it('lists every hard-listed action, unconditionally', () => {
    render(<AutomationsSection automationLevels={{ unsigned_meeting_record_stale: 'automate' }} saveAutomationLevel={()=>{}} />);
    ['Suspension', 'Disciplinary sanction', 'Dismissal', 'Rejecting a grievance', 'Rejecting an appeal', 'A discrimination determination', 'Redundancy selection', 'A contractual term change', 'High-impact outcome correspondence sent without approval']
      .forEach(label => expect(screen.getByText(label)).toBeInTheDocument());
  });
});
