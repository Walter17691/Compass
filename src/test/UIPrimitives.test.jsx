import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Btn, Badge, Card } from '../App.jsx';

describe('Btn', () => {
  it('fires onClick when enabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Btn onClick={onClick}>Save</Btn>);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('does not fire onClick when disabled', async () => {
    const user = userEvent.setup();
    const onClick = vi.fn();
    render(<Btn onClick={onClick} disabled>Save</Btn>);
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(onClick).not.toHaveBeenCalled();
  });
});

describe('Badge', () => {
  it('renders its children', () => {
    render(<Badge>AI</Badge>);
    expect(screen.getByText('AI')).toBeInTheDocument();
  });
});

describe('Card', () => {
  it('renders its children', () => {
    render(<Card><p>Body content</p></Card>);
    expect(screen.getByText('Body content')).toBeInTheDocument();
  });
});
