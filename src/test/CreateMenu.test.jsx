import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CreateMenu } from '../components/CreateMenu.jsx';

// IA & User Journey pass, §7 — universal Create pattern. Each action here
// must call the exact prop handler passed in (App.jsx wires those to its
// own pre-existing setShowCasePrompt/setConcernFormAutoOpen/etc. handlers
// — this component owns none of that logic, only the menu presentation).
describe('CreateMenu', () => {
  it('opens on click and lists the global create actions', () => {
    const onNewCase = vi.fn();
    render(<CreateMenu onNewCase={onNewCase} />);
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    expect(screen.getByRole('menu', { name: 'Create' })).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'New case' }));
    expect(onNewCase).toHaveBeenCalledTimes(1);
  });

  it('closes the menu after an action runs', () => {
    render(<CreateMenu onNewCase={() => {}} />);
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    fireEvent.click(screen.getByRole('button', { name: 'New case' }));
    expect(screen.queryByRole('menu', { name: 'Create' })).not.toBeInTheDocument();
  });

  it('does not show case-scoped actions when not inside a case', () => {
    render(<CreateMenu onNewCase={() => {}} isInCase={false} />);
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    expect(screen.queryByRole('button', { name: 'Add evidence' })).not.toBeInTheDocument();
  });

  it('shows case-scoped actions ahead of the global ones when inside a case', () => {
    const onAddEvidence = vi.fn();
    const onAddCaseTask = vi.fn();
    const onStartCaseMeeting = vi.fn();
    render(<CreateMenu onNewCase={() => {}} isInCase={true} activeCaseName="Sam Employee"
      onAddEvidence={onAddEvidence} onAddCaseTask={onAddCaseTask} onStartCaseMeeting={onStartCaseMeeting} />);
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    expect(screen.getByText("In Sam Employee's case")).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Add evidence' }));
    expect(onAddEvidence).toHaveBeenCalledTimes(1);
  });

  it('calls onAfterAction (used to close a mobile nav sheet) alongside the action handler', () => {
    const onAfterAction = vi.fn();
    const onNewTask = vi.fn();
    render(<CreateMenu onNewTask={onNewTask} onAfterAction={onAfterAction} />);
    fireEvent.click(screen.getByRole('button', { name: /Create/ }));
    fireEvent.click(screen.getByRole('button', { name: 'New task' }));
    expect(onNewTask).toHaveBeenCalledTimes(1);
    expect(onAfterAction).toHaveBeenCalledTimes(1);
  });

  // Phase C keyboard defect fix — Escape used to only close the menu; if
  // focus had moved onto an item inside it first, closing removed that
  // element from the DOM with nothing to receive focus, so it silently
  // fell back to document.body (invisible in the old static sidebar, but
  // it made the expanding rail collapse out from under a keyboard user
  // mid-interaction, since the rail stays open via :focus-within).
  it('returns focus to the Create trigger when Escape closes the menu after focus has moved onto an item inside it', async () => {
    const user = userEvent.setup();
    render(<CreateMenu onNewCase={() => {}} />);
    const trigger = screen.getByRole('button', { name: /Create/ });
    await user.click(trigger);
    await user.tab();
    expect(screen.getByRole('button', { name: 'New case' })).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(screen.queryByRole('menu', { name: 'Create' })).not.toBeInTheDocument();
    expect(trigger).toHaveFocus();
  });

  // Escape closing the menu while focus was already on the trigger (never
  // moved into it) must keep working exactly as it already did.
  it('leaves focus on the trigger when Escape closes the menu without focus ever having moved into it', async () => {
    const user = userEvent.setup();
    render(<CreateMenu onNewCase={() => {}} />);
    const trigger = screen.getByRole('button', { name: /Create/ });
    await user.click(trigger);
    expect(trigger).toHaveFocus();
    await user.keyboard('{Escape}');
    expect(trigger).toHaveFocus();
  });

  // An outside click must not be affected by the Escape focus-restoration
  // fix — no forced focus jump for a mouse user closing the menu that way.
  it('does not force focus onto the trigger when the menu is closed by an outside click', async () => {
    const user = userEvent.setup();
    render(<div><button>Outside</button><CreateMenu onNewCase={() => {}} /></div>);
    await user.click(screen.getByRole('button', { name: /Create/ }));
    await user.click(screen.getByRole('button', { name: 'Outside' }));
    expect(screen.queryByRole('menu', { name: 'Create' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Outside' })).toHaveFocus();
  });

  // Phase C rendering defect fix — PlusIcon didn't forward `style`, so the
  // flexShrink:0 passed at the trigger's own call site was silently
  // dropped and the icon collapsed to width:0 inside the rail's 72px
  // resting width. Asserts the icon is present and explicitly protected
  // from shrinking, in both the default and compact (rail) trigger modes.
  it('renders the Create icon protected from flex-shrink, in both default and compact mode', () => {
    const { rerender } = render(<CreateMenu onNewCase={() => {}} />);
    let icon = screen.getByRole('button', { name: /Create/ }).querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon.style.flexShrink).toBe('0');

    rerender(<CreateMenu onNewCase={() => {}} compact />);
    icon = screen.getByRole('button', { name: /Create/ }).querySelector('svg');
    expect(icon).toBeInTheDocument();
    expect(icon.style.flexShrink).toBe('0');
  });
});
