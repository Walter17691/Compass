import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { parseFlexDate, daysBetween, daysSince, addWorkingDays } from '../lib/dateMath.js';

// DST tests must run in a real UK timezone regardless of the host
// machine's default — Node respects a runtime process.env.TZ
// reassignment for subsequent Date operations, so this makes the test
// deterministic in CI environments that don't default to Europe/London.
let originalTZ;
beforeAll(() => { originalTZ = process.env.TZ; process.env.TZ = 'Europe/London'; });
afterAll(() => { process.env.TZ = originalTZ; });

describe('parseFlexDate', () => {
  it('parses UK format DD/MM/YYYY', () => {
    const d = parseFlexDate('05/08/2026');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7); // August, 0-indexed
    expect(d.getDate()).toBe(5);
  });

  it('parses ISO format', () => {
    const d = parseFlexDate('2026-08-05');
    expect(d.getFullYear()).toBe(2026);
    expect(d.getMonth()).toBe(7);
    expect(d.getDate()).toBe(5);
  });

  it('passes through an existing valid Date', () => {
    const input = new Date(2026, 7, 5);
    expect(parseFlexDate(input)).toBe(input);
  });

  it('returns null, never NaN, for an invalid Date object', () => {
    expect(parseFlexDate(new Date('not a date'))).toBeNull();
  });

  it('returns null for an empty string', () => {
    expect(parseFlexDate('')).toBeNull();
  });

  it('returns null for null/undefined', () => {
    expect(parseFlexDate(null)).toBeNull();
    expect(parseFlexDate(undefined)).toBeNull();
  });

  it('returns null for unparseable garbage text', () => {
    expect(parseFlexDate('not a date at all')).toBeNull();
  });
});

describe('daysBetween — DST safety', () => {
  it('returns 0 for the same day', () => {
    expect(daysBetween(new Date(2026, 7, 5), new Date(2026, 7, 5))).toBe(0);
  });

  it('returns a simple positive diff with no DST boundary involved', () => {
    expect(daysBetween(new Date(2026, 7, 1), new Date(2026, 7, 15))).toBe(14);
  });

  it('returns a negative diff when b is earlier than a', () => {
    expect(daysBetween(new Date(2026, 7, 15), new Date(2026, 7, 1))).toBe(-14);
  });

  // UK clocks spring forward on Sunday 29 March 2026 — that local day is
  // only 23 hours long. A naive (b-a)/86400000 across this boundary would
  // undercount by a fraction, which Math.ceil-ing (the old deadlines.js
  // behaviour) rounds the WRONG way for a countdown — making a deadline
  // look like it has one more day left than it really does, or a
  // genuinely-overdue deadline read as "due today" instead of overdue.
  it('counts exactly 7 calendar days across the spring-forward transition', () => {
    expect(daysBetween(new Date(2026, 2, 25), new Date(2026, 3, 1))).toBe(7);
  });

  it('counts exactly 1 calendar day for the spring-forward day itself', () => {
    expect(daysBetween(new Date(2026, 2, 29), new Date(2026, 2, 30))).toBe(1);
  });

  // UK clocks go back on Sunday 25 October 2026 — that local day is 25
  // hours long, the opposite failure mode: a naive diff overcounts.
  it('counts exactly 7 calendar days across the autumn-back transition', () => {
    expect(daysBetween(new Date(2026, 9, 21), new Date(2026, 9, 28))).toBe(7);
  });

  it('counts exactly 1 calendar day for the autumn-back day itself', () => {
    expect(daysBetween(new Date(2026, 9, 25), new Date(2026, 9, 26))).toBe(1);
  });

  it('is unaffected by a time-of-day component on either input', () => {
    const a = new Date(2026, 7, 1, 23, 59, 0);
    const b = new Date(2026, 7, 2, 0, 1, 0);
    expect(daysBetween(a, b)).toBe(1);
  });

  it('accepts UK-format date strings directly', () => {
    expect(daysBetween('01/08/2026', '15/08/2026')).toBe(14);
  });

  it('returns null when either side is unparseable', () => {
    expect(daysBetween('garbage', new Date())).toBeNull();
    expect(daysBetween(new Date(), 'garbage')).toBeNull();
  });

  // Phase 6.5 hardening (production regression suite, dates) — 2028 is a
  // real leap year (divisible by 4, not by 100); the count must include
  // 29 Feb as its own calendar day, not silently collapse it the way a
  // naive month-length lookup table could.
  it('counts 29 February as a real day in a leap year', () => {
    expect(daysBetween(new Date(2028, 1, 27), new Date(2028, 2, 1))).toBe(3); // 27→28→29→1
  });

  it('does not count a 29th day in the equivalent non-leap-year window', () => {
    expect(daysBetween(new Date(2026, 1, 27), new Date(2026, 2, 1))).toBe(2); // 27→28→1, no 29 Feb
  });

  it('counts correctly across a year boundary (31 Dec → 2 Jan)', () => {
    expect(daysBetween(new Date(2026, 11, 31), new Date(2027, 0, 2))).toBe(2);
  });
});

describe('daysSince', () => {
  it('computes days from a past date to now', () => {
    const now = new Date(2026, 7, 15);
    expect(daysSince(new Date(2026, 7, 10), now)).toBe(5);
  });

  it('returns null, never NaN, for an unparseable date — the exact bug this replaces', () => {
    expect(daysSince('not a date', new Date())).toBeNull();
    expect(daysSince(null, new Date())).toBeNull();
  });
});

describe('addWorkingDays', () => {
  it('skips weekends when adding working days', () => {
    // Friday 2026-08-07 + 1 working day = Monday 2026-08-10
    const result = addWorkingDays(new Date(2026, 7, 7), 1);
    expect(result.getDay()).toBe(1); // Monday
    expect(result.getDate()).toBe(10);
  });

  it('adds multiple working days correctly across a weekend', () => {
    // Thursday 2026-08-06 + 5 working days = Thursday 2026-08-13
    const result = addWorkingDays(new Date(2026, 7, 6), 5);
    expect(result.getDate()).toBe(13);
    expect(result.getMonth()).toBe(7);
  });

  it('accepts a UK-format date string', () => {
    const result = addWorkingDays('07/08/2026', 1);
    expect(result.getDate()).toBe(10);
  });

  it('returns null for an unparseable input date', () => {
    expect(addWorkingDays('not a date', 5)).toBeNull();
  });

  // Phase 6.5 hardening (P1, reliability review) — regression test for a
  // real bug found in the now-removed duplicate lib/dates.js
  // addWorkingDays, which special-cased days===0 to return null instead
  // of the same date. NEXT_STEPS_MAP (constants.js) has a real days:0
  // step ("Note warning on HR record" for Disciplinary meetings), which
  // silently got no deadline at all — and so never appeared in the
  // overdue/due-soon feed — until App.jsx switched to this shared
  // implementation.
  // Phase 6.5 hardening (production regression suite, dates) — a naive
  // day-of-month increment that forgets to roll the month/year over
  // would produce an invalid date (e.g. "31 February") instead of
  // genuinely crossing into the next month/year.
  it('rolls over the month boundary correctly (Friday 30 Jan + 1 working day = Monday 2 Feb)', () => {
    const result = addWorkingDays(new Date(2026, 0, 30), 1);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(1); // February
    expect(result.getDate()).toBe(2);
    expect(result.getDay()).toBe(1); // Monday
  });

  it('rolls over the year boundary correctly, still skipping the weekend inside it (Thursday 31 Dec 2026 + 2 working days = Monday 4 Jan 2027)', () => {
    const result = addWorkingDays(new Date(2026, 11, 31), 2);
    expect(result.getFullYear()).toBe(2027);
    expect(result.getMonth()).toBe(0); // January
    expect(result.getDate()).toBe(4);
    expect(result.getDay()).toBe(1); // Monday
  });

  it('returns the same date, not null, for 0 working days', () => {
    const result = addWorkingDays(new Date(2026, 7, 7), 0);
    expect(result).not.toBeNull();
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(7);
    expect(result.getDate()).toBe(7);
  });
});
