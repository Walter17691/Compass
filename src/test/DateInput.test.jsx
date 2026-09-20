import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { readFileSync } from 'node:fs';
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

// Date control consistency (Human UAT P2, 2026-09-20) — the appeal-hearing
// date must not accept a past date, which is why DateInput gained `min`.
describe('DateInput — min passthrough', () => {
  it('forwards min onto the underlying input', () => {
    render(<DateInput id="d" value="2026-10-01" min="2026-09-20" onChange={() => {}} />);
    expect(screen.getByDisplayValue('2026-10-01')).toHaveAttribute('min', '2026-09-20');
  });

  it('omits the attribute entirely when no min is given, leaving existing callers unchanged', () => {
    render(<DateInput id="d" value="2026-10-01" onChange={() => {}} />);
    expect(screen.getByDisplayValue('2026-10-01')).not.toHaveAttribute('min');
  });

  it('still renders the Compass calendar affordance inside the .date-wrap wrapper', () => {
    const { container } = render(<DateInput id="d" value="2026-10-01" min="2026-09-20" onChange={() => {}} />);
    const wrap = container.querySelector('.date-wrap');
    expect(wrap).not.toBeNull();
    expect(wrap.querySelector('svg')).not.toBeNull();
    expect(wrap.querySelector('input[type="date"]')).not.toBeNull();
  });
});

// Date control consistency (Human UAT P2, 2026-09-20) — regression guard for
// the app-wide stylesheet rule, which is the actual root cause of the
// reported defect. An UNSCOPED indicator-hiding rule hides the browser's own
// calendar icon on every date input while only DateInput draws a
// replacement, leaving every unmigrated field with no visible affordance.
// Asserts the scoping of that one rule rather than counting date inputs
// across the repo.
describe('calendar-picker-indicator stylesheet scoping', () => {
  // vitest root is the repo root, so this resolves without relying on
  // import.meta.url being a file: URL under the current transform.
  const appSource = readFileSync('src/App.jsx', 'utf8');
  const hidingRules = appSource
    .split('\n')
    .filter(line => line.includes('-webkit-calendar-picker-indicator') && /opacity\s*:\s*0\b/.test(line));

  it('hides the native indicator in exactly one place', () => {
    expect(hidingRules).toHaveLength(1);
  });

  it('scopes the hiding rule to the DateInput wrapper, so raw date inputs keep a visible native affordance', () => {
    expect(hidingRules[0]).toMatch(/\.date-wrap\s+input\[type="date"\]::-webkit-calendar-picker-indicator/);
  });
});
