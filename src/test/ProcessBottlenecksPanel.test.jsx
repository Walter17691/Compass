import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ProcessBottlenecksPanel } from '../components/ProcessBottlenecksPanel.jsx';

// Organisational ER Intelligence (Phase 6, OP10, §7)
describe('ProcessBottlenecksPanel', () => {
  it('shows an empty state when no stage is over target', () => {
    const cases = [{ id: 'c1', employeeName: 'Sam', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: new Date().toISOString() } } }];
    render(<ProcessBottlenecksPanel cases={cases} employeeRecords={[]} processTemplates={[]} onOpenCase={()=>{}}/>);
    expect(screen.getByText('No process stages are currently running longer than target.')).toBeInTheDocument();
  });

  it('shows a bottlenecked stage broken down by location, with clickable case chips', async () => {
    const user = userEvent.setup();
    const onOpenCase = vi.fn();
    const oldDate = new Date(Date.now() - 20 * 24 * 60 * 60 * 1000).toISOString();
    const cases = [
      { id: 'c1', employeeName: 'Sam Employee', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: oldDate } } },
      { id: 'c2', employeeName: 'Sam Employee', caseType: 'misconduct', stage: 'investigation', timelineOverrides: { stageEnteredAt: { investigation: oldDate } } },
    ];
    const employeeRecords = [{ name: 'Sam Employee', location: 'Manchester' }];
    render(<ProcessBottlenecksPanel cases={cases} employeeRecords={employeeRecords} processTemplates={[]} onOpenCase={onOpenCase}/>);
    expect(screen.getByText(/Misconduct — Investigation/)).toBeInTheDocument();
    expect(screen.getByText(/Manchester — /)).toBeInTheDocument();
    const chip = screen.getAllByRole('button', { name: /Sam Employee/ })[0];
    await user.click(chip);
    expect(onOpenCase).toHaveBeenCalledWith('c1', 'investigation');
  });
});
