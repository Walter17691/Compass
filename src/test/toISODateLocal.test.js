import { describe, it, expect } from 'vitest';
import { toISODateLocal, addCalendarMonth } from '../lib/dates.js';

describe('toISODateLocal', () => {
  it('formats a local-midnight Date as YYYY-MM-DD without shifting a day', () => {
    // A Date built from local (year, month, day) components at midnight —
    // exactly what addCalendarMonth returns. toISOString() would convert
    // this to UTC first and can roll it back a day in positive-offset
    // timezones (e.g. UK during BST); toISODateLocal must not.
    const d = new Date(2026, 6, 26); // 26 July 2026, local midnight
    expect(toISODateLocal(d)).toBe('2026-07-26');
  });

  it('pads single-digit months and days', () => {
    const d = new Date(2026, 0, 5); // 5 January 2026
    expect(toISODateLocal(d)).toBe('2026-01-05');
  });

  it('round-trips through addCalendarMonth without an off-by-one', () => {
    const dueDate = addCalendarMonth('2026-06-26');
    expect(toISODateLocal(dueDate)).toBe('2026-07-26');
  });
});
