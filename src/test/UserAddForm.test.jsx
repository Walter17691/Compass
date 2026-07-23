import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { UserAddForm } from '../App.jsx';

describe('UserAddForm', () => {
  it('is disabled until a name is entered', () => {
    render(<UserAddForm onAdd={() => {}} />);
    expect(screen.getByRole('button', { name: 'Add user' })).toBeDisabled();
  });

  it('calls onAdd with the trimmed name, role, and email', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<UserAddForm onAdd={onAdd} />);

    await user.type(screen.getByPlaceholderText('Full name'), '  Jane Smith  ');
    await user.selectOptions(screen.getByRole('combobox'), 'HR Director');
    await user.type(screen.getByPlaceholderText('Email (optional)'), 'jane@company.com');
    await user.click(screen.getByRole('button', { name: 'Add user' }));

    expect(onAdd).toHaveBeenCalledWith('Jane Smith', 'HR Director', 'jane@company.com');
  });

  // Regression test: the form used to leave the previous entry sitting in
  // its fields after adding, so adding a second team member could silently
  // reuse the first one's name/email if you didn't notice and clear it.
  it('clears all fields after adding, so the next entry starts blank', async () => {
    const user = userEvent.setup();
    render(<UserAddForm onAdd={() => {}} />);

    const nameInput = screen.getByPlaceholderText('Full name');
    const emailInput = screen.getByPlaceholderText('Email (optional)');
    await user.type(nameInput, 'Jane Smith');
    await user.selectOptions(screen.getByRole('combobox'), 'HR Director');
    await user.type(emailInput, 'jane@company.com');
    await user.click(screen.getByRole('button', { name: 'Add user' }));

    expect(nameInput).toHaveValue('');
    expect(emailInput).toHaveValue('');
    expect(screen.getByRole('combobox')).toHaveValue('HR Manager');
  });

  it('does not call onAdd for a blank name', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<UserAddForm onAdd={onAdd} />);
    await user.click(screen.getByRole('button', { name: 'Add user' }));
    expect(onAdd).not.toHaveBeenCalled();
  });
});
