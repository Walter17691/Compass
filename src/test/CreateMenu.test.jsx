import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
});
