import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AddRoleForm } from '../components/AddRoleForm.jsx';

// AddRoleForm was referenced in the Org Settings modal but never defined
// anywhere in the codebase, which crashed the whole app with a
// ReferenceError the moment a user opened Org Settings. These tests cover
// the component that now actually exists.
describe('AddRoleForm', () => {
  it('renders a title input, a level select, and a disabled Add button', () => {
    render(<AddRoleForm onAdd={() => {}} />);
    expect(screen.getByPlaceholderText('e.g. Sales Manager')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
  });

  it('enables Add once a title is typed, and calls onAdd with the trimmed title and level', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddRoleForm onAdd={onAdd} />);

    await user.type(screen.getByPlaceholderText('e.g. Sales Manager'), '  Sales Manager  ');
    await user.selectOptions(screen.getByRole('combobox'), '7');
    const addButton = screen.getByRole('button', { name: 'Add' });
    expect(addButton).toBeEnabled();

    await user.click(addButton);
    expect(onAdd).toHaveBeenCalledWith('Sales Manager', '7');
  });

  it('clears the form after adding, so the next role does not inherit stale values', async () => {
    const user = userEvent.setup();
    render(<AddRoleForm onAdd={() => {}} />);

    const input = screen.getByPlaceholderText('e.g. Sales Manager');
    await user.type(input, 'Waiter');
    await user.selectOptions(screen.getByRole('combobox'), '9');
    await user.click(screen.getByRole('button', { name: 'Add' }));

    expect(input).toHaveValue('');
    expect(screen.getByRole('combobox')).toHaveValue('5');
  });

  it('does not call onAdd for a blank or whitespace-only title', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<AddRoleForm onAdd={onAdd} />);

    await user.type(screen.getByPlaceholderText('e.g. Sales Manager'), '   ');
    expect(screen.getByRole('button', { name: 'Add' })).toBeDisabled();
    expect(onAdd).not.toHaveBeenCalled();
  });
});
