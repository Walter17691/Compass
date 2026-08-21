import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImprovementInitiativesPanel } from '../components/ImprovementInitiativesPanel.jsx';

const baseInitiative = {
  id: 'init1', title: 'Reduce Manchester grievances', problemIdentified: 'Grievance volume rising at Manchester.',
  supportingInsights: ['Trend: grievance cases (last 90 days)'], owner: 'Priya Shah', targetCompletion: '2026-09-30',
  status: 'active', milestones: [], outcome: '', createdAt: '2026-08-01T00:00:00Z',
};

// Organisational ER Intelligence (Phase 6, OP22, §18)
describe('ImprovementInitiativesPanel', () => {
  it('shows an empty state when there are no initiatives', () => {
    render(<ImprovementInitiativesPanel improvementInitiatives={[]} isHR={true} onAdd={vi.fn()} onUpdate={vi.fn()} caseTasks={[]}/>);
    expect(screen.getByText('No improvement initiatives yet.')).toBeInTheDocument();
  });

  it('renders an initiative card with title, status, owner, and target completion', () => {
    render(<ImprovementInitiativesPanel improvementInitiatives={[baseInitiative]} isHR={true} onAdd={vi.fn()} onUpdate={vi.fn()} caseTasks={[]}/>);
    expect(screen.getByText('Reduce Manchester grievances')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText(/Priya Shah/)).toBeInTheDocument();
    expect(screen.getByText(/Target: 2026-09-30/)).toBeInTheDocument();
    expect(screen.getByText('Trend: grievance cases (last 90 days)')).toBeInTheDocument();
  });

  it('hides the New initiative control for non-HR', () => {
    render(<ImprovementInitiativesPanel improvementInitiatives={[]} isHR={false} onAdd={vi.fn()} onUpdate={vi.fn()} caseTasks={[]}/>);
    expect(screen.queryByRole('button', { name: '+ New initiative' })).not.toBeInTheDocument();
  });

  it('creates an initiative with comma-separated supporting insights split into an array', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<ImprovementInitiativesPanel improvementInitiatives={[]} isHR={true} onAdd={onAdd} onUpdate={vi.fn()} caseTasks={[]}/>);
    await user.click(screen.getByRole('button', { name: '+ New initiative' }));
    await user.type(screen.getByPlaceholderText('Title'), 'Reduce Manchester grievances');
    await user.type(screen.getByPlaceholderText('Problem identified'), 'Grievance volume rising.');
    await user.type(screen.getByPlaceholderText('Supporting insights (comma-separated, optional)'), 'Trend: grievance cases, Risk flag: Manchester');
    await user.type(screen.getByPlaceholderText('Owner'), 'Priya Shah');
    await user.click(screen.getByRole('button', { name: 'Create initiative' }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Reduce Manchester grievances',
      problemIdentified: 'Grievance volume rising.',
      supportingInsights: ['Trend: grievance cases', 'Risk flag: Manchester'],
      owner: 'Priya Shah',
    }));
  });

  it('expands to show milestones and linked actions, and lets HR add a milestone', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const caseTasks = [{ id: 't1', name: 'Review rota policy', owner: 'Sam', dueDate: '', status: 'open', improvementInitiativeId: 'init1' }];
    render(<ImprovementInitiativesPanel improvementInitiatives={[baseInitiative]} isHR={true} onAdd={vi.fn()} onUpdate={onUpdate} caseTasks={caseTasks}/>);
    await user.click(screen.getByRole('button', { name: 'View details' }));
    expect(screen.getByText('No milestones set yet.')).toBeInTheDocument();
    expect(screen.getByText(/Review rota policy/)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('New milestone'), 'Draft new rota policy');
    await user.click(screen.getByRole('button', { name: 'Add milestone' }));
    expect(onUpdate).toHaveBeenCalledWith('init1', { milestones: expect.arrayContaining([expect.objectContaining({ label: 'Draft new rota policy', done: false })]) });
  });

  it('toggles a milestone done and calls onUpdate with the toggled array', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const withMilestone = { ...baseInitiative, milestones: [{ id: 'm1', label: 'Draft policy', targetDate: '', done: false }] };
    render(<ImprovementInitiativesPanel improvementInitiatives={[withMilestone]} isHR={true} onAdd={vi.fn()} onUpdate={onUpdate} caseTasks={[]}/>);
    await user.click(screen.getByRole('button', { name: 'View details' }));
    await user.click(screen.getByRole('checkbox'));
    expect(onUpdate).toHaveBeenCalledWith('init1', { milestones: [expect.objectContaining({ id: 'm1', done: true })] });
  });

  it('disables milestone checkboxes and hides add/remove controls for non-HR', async () => {
    const user = userEvent.setup();
    const withMilestone = { ...baseInitiative, milestones: [{ id: 'm1', label: 'Draft policy', targetDate: '', done: false }] };
    render(<ImprovementInitiativesPanel improvementInitiatives={[withMilestone]} isHR={false} onAdd={vi.fn()} onUpdate={vi.fn()} caseTasks={[]}/>);
    await user.click(screen.getByRole('button', { name: 'View details' }));
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('New milestone')).not.toBeInTheDocument();
  });

  it('changes status and saves an outcome for HR', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<ImprovementInitiativesPanel improvementInitiatives={[baseInitiative]} isHR={true} onAdd={vi.fn()} onUpdate={onUpdate} caseTasks={[]}/>);
    await user.click(screen.getByRole('button', { name: 'View details' }));
    await user.selectOptions(screen.getByDisplayValue('Active'), 'completed');
    expect(onUpdate).toHaveBeenCalledWith('init1', { status: 'completed' });

    const saveOutcomeBtn = screen.getByRole('button', { name: 'Save outcome' });
    expect(saveOutcomeBtn).toBeDisabled();
    await user.type(screen.getByPlaceholderText('What happened once this was implemented…'), 'Grievance volume dropped after the rota change.');
    await user.click(saveOutcomeBtn);
    expect(onUpdate).toHaveBeenCalledWith('init1', { outcome: 'Grievance volume dropped after the rota change.' });
  });
});
