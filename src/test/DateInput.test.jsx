import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DateInput } from '../components/DateInput.jsx';

// The native calendar-picker-indicator icon was hidden via CSS and its
// hit-zone stretched with a hack that no longer reliably opens the picker
// in current Chrome. The fix calls showPicker() directly on click; these
// tests confirm that wiring rather than the (untestable) native popup.
describe('DateInput', () => {
  it('calls showPicker() on the underlying input when clicked', async () => {
    const user = userEvent.setup();
    render(<DateInput value="2026-07-23" onChange={() => {}} />);
    const input = screen.getByDisplayValue('2026-07-23');
    input.showPicker = vi.fn();

    await user.click(input);
    expect(input.showPicker).toHaveBeenCalledTimes(1);
  });

  it('does not throw in environments without showPicker support', async () => {
    const user = userEvent.setup();
    render(<DateInput value="2026-07-23" onChange={() => {}} />);
    const input = screen.getByDisplayValue('2026-07-23');
    // Simulate a browser that hasn't implemented showPicker() yet.
    input.showPicker = undefined;

    await expect(user.click(input)).resolves.not.toThrow();
  });

  it('forwards onChange with the new value when the date changes', () => {
    // Capture target.value inside the handler itself: DateInput is a
    // controlled component, so once the handler returns, React re-renders
    // the input back to its (unchanged in this test) `value` prop and the
    // DOM node's value reverts — reading it after the fact would see the
    // reverted value, not what the user actually typed.
    let seenValue = null;
    const onChange = vi.fn(e => { seenValue = e.target.value; });
    render(<DateInput value="2026-07-23" onChange={onChange} />);
    const input = screen.getByDisplayValue('2026-07-23');

    fireEvent.change(input, { target: { value: '2026-08-01' } });
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(seenValue).toBe('2026-08-01');
  });

  // Phase 6.5 hardening (Batch 13) — callers need to pair this component
  // with a real <label htmlFor>; without forwarding id, that association
  // was impossible for any screen using DateInput instead of a raw
  // <input type="date">.
  it('forwards id onto the underlying input so a <label htmlFor> can target it', () => {
    render(<DateInput id="meeting-date" value="2026-07-23" onChange={() => {}} />);
    expect(screen.getByDisplayValue('2026-07-23')).toHaveAttribute('id', 'meeting-date');
  });
});
