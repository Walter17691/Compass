import { describe, it, expect } from 'vitest';
import { buildEventTimes, parseAttendees } from '../lib/meetingScheduling.js';

describe('buildEventTimes (Phase 5, IP15)', () => {
  it('builds start/end ISO strings from a date, time and duration', () => {
    const result = buildEventTimes({ date: '2026-08-20', startTime: '14:00', durationMinutes: 30 });
    expect(result.startISO).toBe(new Date('2026-08-20T14:00:00').toISOString());
    expect(result.endISO).toBe(new Date('2026-08-20T14:30:00').toISOString());
  });

  it('defaults duration to 60 minutes when omitted or invalid', () => {
    const result = buildEventTimes({ date: '2026-08-20', startTime: '09:00' });
    expect(new Date(result.endISO) - new Date(result.startISO)).toBe(60 * 60000);
    const result2 = buildEventTimes({ date: '2026-08-20', startTime: '09:00', durationMinutes: -10 });
    expect(new Date(result2.endISO) - new Date(result2.startISO)).toBe(60 * 60000);
  });

  it('returns null when date or startTime is missing', () => {
    expect(buildEventTimes({ startTime: '09:00' })).toBeNull();
    expect(buildEventTimes({ date: '2026-08-20' })).toBeNull();
    expect(buildEventTimes({})).toBeNull();
  });

  it('returns null for an unparseable date/time', () => {
    expect(buildEventTimes({ date: 'not-a-date', startTime: '09:00' })).toBeNull();
  });
});

describe('parseAttendees (Phase 5, IP15)', () => {
  it('splits on commas, semicolons and newlines and trims whitespace', () => {
    expect(parseAttendees('a@b.com, c@d.com;\ne@f.com')).toEqual(['a@b.com', 'c@d.com', 'e@f.com']);
  });

  it('drops entries that do not look like an email address', () => {
    expect(parseAttendees('Sarah Jones, a@b.com, not-an-email')).toEqual(['a@b.com']);
  });

  it('returns an empty array for empty/missing input', () => {
    expect(parseAttendees('')).toEqual([]);
    expect(parseAttendees(undefined)).toEqual([]);
  });
});
