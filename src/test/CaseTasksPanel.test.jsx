import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CaseTasksPanel } from '../components/CaseTasksPanel.jsx';

// Phase 6.5 hardening (Batch 13) — the new-task name/owner/due-date/
// priority fields had only a placeholder or no text at all; the
// per-task done checkbox had no accessible name either. Had no test
// coverage at all before this.
const noop = () => {};
const cs = { id: 'c1' };
const tasks = [{ id: 't1', name: 'Chase up witness statement', status: 'open', owner: 'HR', dueDate: '', source: 'manual' }];

describe('CaseTasksPanel — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the new-task form fields', async () => {
    const user = userEvent.setup();
    render(<CaseTasksPanel cs={cs} tasks={[]} createCaseTask={noop} toggleCaseTaskDone={noop} deleteCaseTask={noop} fmtDate={d=>d} isHR />);
    await user.click(screen.getByRole('button', { name: '+ Add task' }));
    expect(screen.getByLabelText('Task')).toBeInTheDocument();
    expect(screen.getByLabelText('Owner')).toBeInTheDocument();
    expect(screen.getByLabelText('Due date')).toBeInTheDocument();
    expect(screen.getByLabelText('Priority')).toBeInTheDocument();
  });

  it('names the per-task done checkbox after the task', () => {
    render(<CaseTasksPanel cs={cs} tasks={tasks} createCaseTask={noop} toggleCaseTaskDone={noop} deleteCaseTask={noop} fmtDate={d=>d} isHR />);
    expect(screen.getByLabelText('Mark "Chase up witness statement" done')).toBeInTheDocument();
  });
});
