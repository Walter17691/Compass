import { describe, it, expect } from 'vitest';
import { addCalendarMonth } from '../lib/dates.js';

describe('addCalendarMonth', () => {
  it('returns null for an invalid date', () => {
    expect(addCalendarMonth('not-a-date')).toBeNull();
  });

  it('adds one calendar month to a mid-month date', () => {
    const result = addCalendarMonth('2026-03-15');
    expect(result.getMonth()).toBe(3); // April (0-indexed)
    expect(result.getDate()).toBe(15);
  });

  it('clamps 31 January to the last day of February in a non-leap year', () => {
    const result = addCalendarMonth('2026-01-31');
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(28); // 2026 is not a leap year
  });

  it('clamps 31 January to 29 February in a leap year', () => {
    const result = addCalendarMonth('2028-01-31');
    expect(result.getMonth()).toBe(1);
    expect(result.getDate()).toBe(29);
  });

  it('rolls over the year when adding a month to December', () => {
    const result = addCalendarMonth('2026-12-10');
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(10);
  });
});
