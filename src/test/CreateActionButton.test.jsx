import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateActionButton } from '../components/CreateActionButton.jsx';

// Organisational ER Intelligence (Phase 6, OP21, §17)
describe('CreateActionButton', () => {
  it('opens a form on click, and calls createCaseTask(null, fields) with the insightRef on save', async () => {
    const user = userEvent.setup();
    const createCaseTask = vi.fn();
    render(<CreateActionButton insightRef="Trend: grievance cases (last 90 days)" createCaseTask={createCaseTask}/>);

    await user.click(screen.getByRole('button', { name: 'Create action' }));
    await user.type(screen.getByPlaceholderText('Action to take…'), 'Review rota policy with site manager');
    await user.type(screen.getByPlaceholderText('Owner'), 'Priya Shah');
    await user.click(screen.getByRole('button', { name: 'Save action' }));

    expect(createCaseTask).toHaveBeenCalledWith(null, expect.objectContaining({
      name: 'Review rota policy with site manager',
      owner: 'Priya Shah',
      insightRef: 'Trend: grievance cases (last 90 days)',
    }));
    expect(screen.getByText(/Action created/)).toBeInTheDocument();
  });

  it('disables Save action until a name is entered', async () => {
    const user = userEvent.setup();
    render(<CreateActionButton insightRef="x" createCaseTask={vi.fn()}/>);
    await user.click(screen.getByRole('button', { name: 'Create action' }));
    expect(screen.getByRole('button', { name: 'Save action' })).toBeDisabled();
  });

  it('cancels back to the initial button without creating anything', async () => {
    const user = userEvent.setup();
    const createCaseTask = vi.fn();
    render(<CreateActionButton insightRef="x" createCaseTask={createCaseTask}/>);
    await user.click(screen.getByRole('button', { name: 'Create action' }));
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.getByRole('button', { name: 'Create action' })).toBeInTheDocument();
    expect(createCaseTask).not.toHaveBeenCalled();
  });
});
