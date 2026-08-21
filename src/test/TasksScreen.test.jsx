import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TasksScreen } from '../screens/TasksScreen.jsx';

// Phase 6.5 hardening (Batch 13) — the "New task" form's fields had a
// visual <label> with no htmlFor/id association; the three filter
// selects and the per-row "mark done" checkbox had no accessible name
// at all (only placeholder-style option text like "All cases"). Had no
// test coverage at all before this.
const noop = () => {};
const cases = [{ id: 'c1', employeeName: 'Sam Employee', caseType: 'misconduct' }];
const caseTasks = [{ id: 't1', caseId: 'c1', name: 'Chase witness statement', status: 'open', owner: 'Alex', priority: 'normal' }];

describe('TasksScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('associates every "New task" field with its real, visible label', async () => {
    const user = userEvent.setup();
    render(<TasksScreen caseTasks={[]} cases={cases} createCaseTask={noop} toggleCaseTaskDone={noop} deleteCaseTask={noop} setScreen={noop} setActiveCaseId={noop} setActiveCaseStage={noop} fmtDate={d=>d} />);
    await user.click(screen.getByRole('button', { name: '+ New task' }));
    expect(screen.getByLabelText('Case')).toBeInTheDocument();
    expect(screen.getByLabelText('Task')).toBeInTheDocument();
    expect(screen.getByLabelText('Owner')).toBeInTheDocument();
    expect(screen.getByLabelText('Due date')).toBeInTheDocument();
    expect(screen.getByLabelText('Priority')).toBeInTheDocument();
  });

  it('labels the three filter selects', () => {
    render(<TasksScreen caseTasks={caseTasks} cases={cases} createCaseTask={noop} toggleCaseTaskDone={noop} deleteCaseTask={noop} setScreen={noop} setActiveCaseId={noop} setActiveCaseStage={noop} fmtDate={d=>d} />);
    expect(screen.getByLabelText('Filter by case')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by owner')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by priority')).toBeInTheDocument();
  });

  it('labels the per-task "mark done" checkbox with the task\'s own name', () => {
    render(<TasksScreen caseTasks={caseTasks} cases={cases} createCaseTask={noop} toggleCaseTaskDone={noop} deleteCaseTask={noop} setScreen={noop} setActiveCaseId={noop} setActiveCaseStage={noop} fmtDate={d=>d} />);
    expect(screen.getByLabelText('Mark "Chase witness statement" done')).toBeInTheDocument();
  });
});
