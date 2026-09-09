import { describe, it, expect } from 'vitest';
import { addCalendarMonth, addCalendarMonths, toISODateLocal } from '../lib/dates.js';

describe('addCalendarMonth (existing, unmodified behaviour after refactor onto addCalendarMonths)', () => {
  it('31 January + 1 month clamps to the last day of February in a non-leap year', () => {
    const result = addCalendarMonth('2026-01-31');
    expect(toISODateLocal(result)).toBe('2026-02-28');
  });

  it('31 January + 1 month clamps to 29 February in a leap year', () => {
    const result = addCalendarMonth('2028-01-31');
    expect(toISODateLocal(result)).toBe('2028-02-29');
  });

  it('returns null for an unparseable date', () => {
    expect(addCalendarMonth('not a date')).toBeNull();
  });
});

// UAT Golden Path remediation (Defect #12) — the exact three scenarios
// called out for explicit, deterministic verification.
describe('addCalendarMonths — explicit month-end semantics (Defect #12)', () => {
  it('31 January + 1 month -> 28 February (non-leap year)', () => {
    expect(toISODateLocal(addCalendarMonths('2026-01-31', 1))).toBe('2026-02-28');
  });

  it('29 February + 12 months -> 28 February the following (non-leap) year', () => {
    // 2028 is a leap year, so 29 February 2028 is a real, valid date.
    expect(toISODateLocal(addCalendarMonths('2028-02-29', 12))).toBe('2029-02-28');
  });

  it('31 August + 6 months -> 28 February the following (non-leap) year', () => {
    expect(toISODateLocal(addCalendarMonths('2026-08-31', 6))).toBe('2027-02-28');
  });

  it('is a single direct jump, not N chained single-month calls — these can genuinely differ', () => {
    // Chaining 31 Jan -> 28 Feb -> 28 Mar lands on 28 Mar. A direct
    // 2-month jump correctly lands on 31 Mar, since March has 31 days
    // and the original day never needed clamping against it.
    const chained = addCalendarMonth(addCalendarMonth('2026-01-31'));
    const direct = addCalendarMonths('2026-01-31', 2);
    expect(toISODateLocal(chained)).toBe('2026-03-28');
    expect(toISODateLocal(direct)).toBe('2026-03-31');
    expect(toISODateLocal(direct)).not.toBe(toISODateLocal(chained));
  });

  it('handles a mid-month date with no clamping needed', () => {
    expect(toISODateLocal(addCalendarMonths('2026-03-15', 6))).toBe('2026-09-15');
  });

  it('handles 0 months as a no-op', () => {
    expect(toISODateLocal(addCalendarMonths('2026-05-10', 0))).toBe('2026-05-10');
  });

  it('handles crossing multiple year boundaries', () => {
    expect(toISODateLocal(addCalendarMonths('2026-06-30', 24))).toBe('2028-06-30');
  });

  it('returns null for an unparseable date', () => {
    expect(addCalendarMonths('not a date', 6)).toBeNull();
  });
});
