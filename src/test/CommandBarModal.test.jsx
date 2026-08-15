import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CommandBarModal } from '../screens/CommandBarModal.jsx';

describe('CommandBarModal', () => {
  it('renders nothing when show is false', () => {
    const { container } = render(<CommandBarModal show={false} input="" setInput={()=>{}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it('submits the trimmed instruction on Enter', async () => {
    const user = userEvent.setup();
    const onSubmit = vi.fn();
    render(<CommandBarModal show input="  chase Sarah Jones for evidence  " setInput={()=>{}} onSubmit={onSubmit} />);
    await user.type(screen.getByLabelText('Command Bar instruction'), '{Enter}');
    expect(onSubmit).toHaveBeenCalledWith('chase Sarah Jones for evidence');
  });

  it('shows a working indicator while processing', () => {
    render(<CommandBarModal show input="x" setInput={()=>{}} processing />);
    expect(screen.getByText('Working out what to do…')).toBeInTheDocument();
  });

  it('shows an error message', () => {
    render(<CommandBarModal show input="x" setInput={()=>{}} error="Something went wrong." />);
    expect(screen.getByText('Something went wrong.')).toBeInTheDocument();
  });

  it('renders resolved actions with a Confirm button that calls onConfirm', async () => {
    const user = userEvent.setup();
    const onConfirm = vi.fn();
    render(<CommandBarModal show input="x" setInput={()=>{}} onConfirm={onConfirm} plan={{
      actions: [{ resolved: true, summary: 'Create task "Chase evidence" on Sarah Jones\'s case.' }],
      clarification: null,
    }} />);
    expect(screen.getByText('Compass will')).toBeInTheDocument();
    expect(screen.getByText('Create task "Chase evidence" on Sarah Jones\'s case.')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Confirm' }));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('shows unresolved actions without a Confirm button when nothing resolved', () => {
    render(<CommandBarModal show input="x" setInput={()=>{}} plan={{
      actions: [{ resolved: false, summary: 'Couldn\'t find a case for "Someone Else".' }],
      clarification: null,
    }} />);
    expect(screen.getByText('Couldn\'t find a case for "Someone Else".')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Confirm' })).not.toBeInTheDocument();
  });

  it('shows the clarification message when there are no actions at all', () => {
    render(<CommandBarModal show input="x" setInput={()=>{}} plan={{
      actions: [],
      clarification: "I couldn't tell which employee you meant.",
    }} />);
    expect(screen.getByText("I couldn't tell which employee you meant.")).toBeInTheDocument();
  });

  it('calls onClose when the close button is clicked', async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CommandBarModal show input="" setInput={()=>{}} onClose={onClose} />);
    await user.click(screen.getByLabelText('Close'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });
});
