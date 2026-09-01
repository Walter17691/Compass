import { describe, it, expect } from 'vitest';
import { fmtMeetingTime } from '../lib/meetingTiming.js';

// Human UAT remediation, Batch 2, Part 4 — a meeting's actual start/end
// time used to only ever be captured and shown as a bare HH:MM string,
// with no date component. fmtMeetingTime formats the full ISO instant
// App.jsx now captures as a UK date + time string instead.
describe('fmtMeetingTime (Batch 2, Part 4)', () => {
  it('formats an ISO instant as UK date + time', () => {
    const result = fmtMeetingTime('2026-08-31T14:32:00.000Z');
    expect(result).toMatch(/31\/08\/2026/);
    expect(result).toMatch(/14:32|15:32/); // allow for a non-UTC test runner timezone
  });

  it('returns an empty string for null/undefined (no meeting started yet)', () => {
    expect(fmtMeetingTime(null)).toBe('');
    expect(fmtMeetingTime(undefined)).toBe('');
  });

  it('returns an empty string rather than "Invalid Date" for an unparseable value', () => {
    expect(fmtMeetingTime('not-a-real-timestamp')).toBe('');
  });

  it('never returns a bare HH:MM with no date — the exact gap this closes', () => {
    const result = fmtMeetingTime('2026-08-31T09:05:00.000Z');
    expect(result).not.toMatch(/^\d{2}:\d{2}$/);
    expect(result).toContain('2026');
  });
});
