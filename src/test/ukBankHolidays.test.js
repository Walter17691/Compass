import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { isUkBankHoliday, isValidUkJurisdiction, UK_JURISDICTIONS, DEFAULT_UK_JURISDICTION } from '../lib/ukBankHolidays.js';
import { addWorkingDays } from '../lib/dateMath.js';

// Phase 7 (Controlled Beta Infrastructure Gate 1) — dedicated coverage for
// the four scenarios the gate explicitly requires: Christmas, Easter,
// substitute bank holidays, and jurisdiction differences (year-boundary
// and ordinary-weekend coverage already live in dateMath.test.js).
//
// Every weekday used below is independently derived from the hardcoded
// BANK_HOLIDAY_EVENTS table in ukBankHolidays.js itself (e.g. Jan 1 2027's
// weekday is fixed by that table listing it as a standalone New Year's Day
// holiday with no substitute date alongside it, meaning it must fall on a
// weekday) rather than assumed, so these tests fail honestly if the
// underlying dataset — not just the arithmetic — is ever wrong.
let originalTZ;
beforeAll(() => { originalTZ = process.env.TZ; process.env.TZ = 'Europe/London'; });
afterAll(() => { process.env.TZ = originalTZ; });

describe('UK_JURISDICTIONS / isValidUkJurisdiction', () => {
  it('offers exactly the three real UK bank-holiday calendars', () => {
    expect(UK_JURISDICTIONS.map(j => j.id).sort()).toEqual(['england-and-wales', 'northern-ireland', 'scotland']);
  });

  it('defaults to England & Wales', () => {
    expect(DEFAULT_UK_JURISDICTION).toBe('england-and-wales');
  });

  it('rejects an unrecognised jurisdiction id', () => {
    expect(isValidUkJurisdiction('wales-only')).toBe(false);
    expect(isValidUkJurisdiction(undefined)).toBe(false);
  });
});

describe('addWorkingDays over Christmas', () => {
  // Friday 18 Dec 2026 + 5 working days. Both Christmas Day (Fri 25 Dec,
  // tabulated directly) and Boxing Day's weekend substitute (Mon 28 Dec,
  // since 26 Dec 2026 is a Saturday) fall inside this window and must both
  // be skipped, alongside the two ordinary weekends either side of them.
  it('skips Christmas Day and the Boxing Day weekend-substitute (Fri 18 Dec 2026 + 5 working days = Tue 29 Dec 2026)', () => {
    const result = addWorkingDays(new Date(2026, 11, 18), 5);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(11); // December
    expect(result.getDate()).toBe(29);
    expect(result.getDay()).toBe(2); // Tuesday
  });
});

describe('addWorkingDays over Easter', () => {
  // Wednesday 1 Apr 2026 + 3 working days. Good Friday (3 Apr) and Easter
  // Monday (6 Apr) are both tabulated for England & Wales and must both be
  // skipped, along with the weekend between them.
  it('skips Good Friday and Easter Monday (Wed 1 Apr 2026 + 3 working days = Wed 8 Apr 2026)', () => {
    const result = addWorkingDays(new Date(2026, 3, 1), 3);
    expect(result.getFullYear()).toBe(2026);
    expect(result.getMonth()).toBe(3); // April
    expect(result.getDate()).toBe(8);
    expect(result.getDay()).toBe(3); // Wednesday
  });

  it('Scotland has no Easter Monday bank holiday, so the same window resolves one working day earlier', () => {
    const ewResult = addWorkingDays(new Date(2026, 3, 1), 3, 'england-and-wales');
    const scotResult = addWorkingDays(new Date(2026, 3, 1), 3, 'scotland');
    expect(scotResult.getTime()).toBeLessThan(ewResult.getTime());
    expect(scotResult.getDate()).toBe(7); // Tue 7 Apr 2026
  });
});

describe('substitute bank holidays', () => {
  it('substitutes Boxing Day 2026 (falls on a Saturday) onto Monday 28 December instead', () => {
    expect(isUkBankHoliday(new Date(2026, 11, 26))).toBe(false); // the Saturday itself is not separately flagged
    expect(isUkBankHoliday(new Date(2026, 11, 28))).toBe(true); // its substitute is
  });

  it('does not flag an ordinary weekday immediately around a substitute as a holiday', () => {
    expect(isUkBankHoliday(new Date(2026, 11, 24))).toBe(false); // Christmas Eve
    expect(isUkBankHoliday(new Date(2026, 11, 29))).toBe(false); // day after the substitute
  });
});

describe('jurisdiction differences', () => {
  it('2 January is a bank holiday in Scotland only', () => {
    expect(isUkBankHoliday(new Date(2026, 0, 2), 'scotland')).toBe(true);
    expect(isUkBankHoliday(new Date(2026, 0, 2), 'england-and-wales')).toBe(false);
    expect(isUkBankHoliday(new Date(2026, 0, 2), 'northern-ireland')).toBe(false);
  });

  it("St Patrick's Day (17 March) is a bank holiday in Northern Ireland only", () => {
    expect(isUkBankHoliday(new Date(2026, 2, 17), 'northern-ireland')).toBe(true);
    expect(isUkBankHoliday(new Date(2026, 2, 17), 'england-and-wales')).toBe(false);
    expect(isUkBankHoliday(new Date(2026, 2, 17), 'scotland')).toBe(false);
  });

  it('an invalid jurisdiction id falls back to the England & Wales calendar rather than throwing', () => {
    expect(isUkBankHoliday(new Date(2026, 0, 2), 'not-a-real-place')).toBe(false);
    expect(isUkBankHoliday(new Date(2026, 3, 3), 'not-a-real-place')).toBe(true); // Good Friday 2026, E&W
  });

  // Same start date, same requested working-day count, genuinely
  // different results — this is the concrete case an org's own
  // configured calendar setting (DataPrivacySection's "Working-day
  // calendar" dropdown) actually changes for a real ACAS deadline.
  it('Scotland\'s extra 2 January holiday pushes a working-day calculation a day later than England & Wales for the same window (Wed 31 Dec 2025 + 2 working days)', () => {
    const ew = addWorkingDays(new Date(2025, 11, 31), 2, 'england-and-wales');
    const scotland = addWorkingDays(new Date(2025, 11, 31), 2, 'scotland');
    expect(ew.getDate()).toBe(5); // Mon 5 Jan 2026
    expect(ew.getMonth()).toBe(0);
    expect(scotland.getDate()).toBe(6); // Tue 6 Jan 2026
    expect(scotland.getMonth()).toBe(0);
  });
});

describe('ordinary weekends (no bank holiday in the window)', () => {
  it('behaves identically across all three jurisdictions when no holiday falls inside the window', () => {
    // Tuesday 14 Jul 2026 + 3 working days — no bank holiday anywhere
    // near this window in any of the three calendars.
    const start = new Date(2026, 6, 14);
    const ew = addWorkingDays(start, 3, 'england-and-wales');
    const scotland = addWorkingDays(start, 3, 'scotland');
    const ni = addWorkingDays(start, 3, 'northern-ireland');
    expect(ew.getTime()).toBe(scotland.getTime());
    expect(ew.getTime()).toBe(ni.getTime());
    expect(ew.getDate()).toBe(17); // Fri 17 Jul 2026
  });
});

describe('years outside the tabulated 2019-2028 range (algorithmic fallback)', () => {
  it('still recognises New Year\'s Day 2029, derived from the fallback path rather than the table', () => {
    // Jan 1 2028 is a Saturday (the table substitutes it to Mon 3 Jan
    // 2028, with no untouched "2028-01-01" entry) — 2028 is a leap year,
    // so Jan 1 2029 falls exactly 2 weekdays later, i.e. a Monday, and so
    // is a genuine, unsubstituted bank holiday in its own right.
    expect(isUkBankHoliday(new Date(2029, 0, 1))).toBe(true);
  });

  it('still substitutes or directly flags Christmas somewhere in its usual late-December window in a fallback year', () => {
    let flaggedSomeDayInWindow = false;
    for (let day = 23; day <= 28; day++) {
      if (isUkBankHoliday(new Date(2029, 11, day))) flaggedSomeDayInWindow = true;
    }
    expect(flaggedSomeDayInWindow).toBe(true);
  });

  it('does not treat every day in a fallback year as a working day (the exact bug this gate closes)', () => {
    // Good Friday must exist somewhere in the fallback year — if the
    // fallback silently produced zero holidays, this would fail.
    let holidayCountInYear = 0;
    for (let month = 0; month < 12; month++) {
      for (let day = 1; day <= 28; day++) {
        if (isUkBankHoliday(new Date(2030, month, day))) holidayCountInYear++;
      }
    }
    expect(holidayCountInYear).toBeGreaterThan(0);
  });
});
