import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import * as scheduling from '../lib/meetingScheduling.js';
import { buildEventTimes, parseAttendees, suggestAttendees, checkNoticePeriod } from '../lib/meetingScheduling.js';

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

describe('suggestAttendees (Phase 5, IP16)', () => {
  const cs = { id: 'c1', email: 'sarah@company.com', manager: 'Jo Smith' };

  it('includes the case employee and the organiser as real, known emails', () => {
    const result = suggestAttendees(cs, { organiserEmail: 'hr@company.com' });
    expect(result.emails).toEqual(['sarah@company.com', 'hr@company.com']);
  });

  it('does not duplicate the organiser email if it matches the employee email', () => {
    const result = suggestAttendees(cs, { organiserEmail: 'sarah@company.com' });
    expect(result.emails).toEqual(['sarah@company.com']);
  });

  it('suggests the manager as chair by name, not a fabricated email', () => {
    const result = suggestAttendees(cs, { organiserEmail: 'hr@company.com', meetingTypeId: 'disciplinary' });
    expect(result.roleNotes).toEqual(['Chair: Jo Smith — add their email above']);
  });

  it('flags an appeal meeting as needing someone other than the existing manager', () => {
    const result = suggestAttendees(cs, { meetingTypeId: 'appeal-disciplinary' });
    expect(result.roleNotes[0]).toContain('someone other than Jo Smith');
    expect(result.roleNotes[0]).toContain('not previously involved');
  });

  it('surfaces the assigned investigator by name when one exists', () => {
    const caseAccess = [{ caseId: 'c1', role: 'investigator', userId: 'u1' }];
    const orgMembers = [{ user_id: 'u1', name: 'Priya Shah' }];
    const result = suggestAttendees(cs, { caseAccess, orgMembers, meetingTypeId: 'investigation' });
    expect(result.roleNotes).toContain('Investigator: Priya Shah — add their email above');
  });

  it('handles a case with no email/manager and no investigator gracefully', () => {
    const result = suggestAttendees({ id: 'c2' });
    expect(result.emails).toEqual([]);
    expect(result.roleNotes).toEqual([]);
  });
});

describe('checkNoticePeriod (Phase 5, IP16)', () => {
  const now = new Date('2026-08-15T09:00:00Z');

  it('flags a violation when the meeting is sooner than the policy requires', () => {
    const result = checkNoticePeriod(["Employees are entitled to 48 hours' notice of a disciplinary hearing."], { meetingISO: '2026-08-16T09:00:00Z', now });
    expect(result.violated).toBe(true);
    expect(result.requiredHours).toBe(48);
    expect(result.requiredText).toBe("48 hours' notice");
  });

  it('does not flag a violation when there is enough notice', () => {
    const result = checkNoticePeriod(["Employees are entitled to 48 hours' notice of a disciplinary hearing."], { meetingISO: '2026-08-20T09:00:00Z', now });
    expect(result.violated).toBe(false);
  });

  // Phase 6.5 hardening (closes independent audit finding 5.8) — was
  // "treats a working-day requirement as 24 hours per day", asserting
  // the exact bug: a meeting proposed on Friday 14 Aug for the following
  // Wednesday 19 Aug is 5 CALENDAR days' notice (the flat-24h-per-day
  // bug's own math: 5 x 24 = 120h = exactly 5 days = reported compliant)
  // but only 3 WORKING days (Mon/Tue/Wed) — a genuine violation of "5
  // working days' notice" that the old logic silently missed.
  it('evaluates a working-day requirement by real working days, not a flat 24h-per-day count', () => {
    const fridayNow = new Date('2026-08-14T09:00:00Z');
    const result = checkNoticePeriod(["Give 5 working days' notice before the hearing."], { meetingISO: '2026-08-19T09:00:00Z', now: fridayNow });
    expect(result.violated).toBe(true);
  });

  it('does not flag a working-day requirement when there genuinely are enough working days', () => {
    const fridayNow = new Date('2026-08-14T09:00:00Z');
    // Friday + 5 working days = the following Friday, 21 Aug.
    const result = checkNoticePeriod(["Give 5 working days' notice before the hearing."], { meetingISO: '2026-08-24T09:00:00Z', now: fridayNow });
    expect(result.violated).toBe(false);
  });

  it('returns null when no clause matches a notice-period pattern', () => {
    expect(checkNoticePeriod(['This policy covers disciplinary procedure generally.'], { meetingISO: '2026-08-16T09:00:00Z', now })).toBeNull();
  });

  it('returns null when there is no meeting time or no clauses at all', () => {
    expect(checkNoticePeriod(["48 hours' notice required."], { now })).toBeNull();
    expect(checkNoticePeriod([], { meetingISO: '2026-08-16T09:00:00Z', now })).toBeNull();
    expect(checkNoticePeriod(undefined, { meetingISO: '2026-08-16T09:00:00Z', now })).toBeNull();
  });
});

describe('buildScheduledMeetingEntry is retired (Release 1 Phase 2.3)', () => {
  // INTENTIONAL REMOVAL, with replacement coverage.
  //
  // The old builder produced a meeting-shaped entry with no caseId and no
  // lifecycle status, relying on `record: null` to mean "hasn't happened yet"
  // — the exact proxy Phase 1 replaced. The entry it created could not be
  // started, prepared or cancelled as itself. Scheduling now creates a real
  // lifecycle meeting through meetingWrites.persistMeeting, so keeping the
  // builder would have left a second, diverging way to create a meeting.
  it('is no longer exported', () => {
    expect(scheduling.buildScheduledMeetingEntry).toBeUndefined();
  });

  it('and nothing in the app still calls it', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    expect(app).not.toContain('buildScheduledMeetingEntry(');
  });

  it('scheduling now persists a real lifecycle meeting instead', () => {
    const app = readFileSync('src/App.jsx', 'utf8');
    expect(app).toContain('status: MEETING_STATUS.SCHEDULED,');
    expect(app).toContain('const result = await persistMeeting({ cases: casesRef.current, caseId, meeting, saveCases });');
  });

  it('the surviving helpers are untouched', () => {
    expect(typeof buildEventTimes).toBe('function');
    expect(typeof parseAttendees).toBe('function');
    expect(typeof suggestAttendees).toBe('function');
    expect(typeof checkNoticePeriod).toBe('function');
  });
});
