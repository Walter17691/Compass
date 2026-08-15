import { describe, it, expect } from 'vitest';
import { buildGoogleEvent } from './_google.js';

// Integrations & Workflow Automation (Phase 5, IP3) — buildGoogleEvent is
// the real-meeting event builder Track C's scheduling phase calls into,
// distinct from deadlineToGoogleEvent's own all-day-only shape (not
// retested here — pre-existing, untouched by this phase).
describe('buildGoogleEvent', () => {
  it('builds a timed event with UTC start/end', () => {
    const event = buildGoogleEvent({ title: 'Investigation meeting', description: 'Re: allegation 1', startISO: '2026-09-01T14:00:00Z', endISO: '2026-09-01T15:00:00Z' });
    expect(event).toEqual({
      summary: 'Investigation meeting',
      description: 'Re: allegation 1',
      start: { dateTime: '2026-09-01T14:00:00Z', timeZone: 'UTC' },
      end: { dateTime: '2026-09-01T15:00:00Z', timeZone: 'UTC' },
    });
  });

  it('defaults description to an empty string when omitted', () => {
    const event = buildGoogleEvent({ title: 'x', startISO: '2026-09-01T14:00:00Z', endISO: '2026-09-01T15:00:00Z' });
    expect(event.description).toBe('');
  });

  it('includes attendees, mapped to Google\'s email/displayName shape', () => {
    const event = buildGoogleEvent({
      title: 'Disciplinary hearing', startISO: '2026-09-01T14:00:00Z', endISO: '2026-09-01T15:00:00Z',
      attendees: [{ email: 'jane@acme.com', name: 'Jane Doe' }, { email: 'sam@acme.com' }],
    });
    expect(event.attendees).toEqual([
      { email: 'jane@acme.com', displayName: 'Jane Doe' },
      { email: 'sam@acme.com', displayName: undefined },
    ]);
  });

  it('omits attendees entirely when none are given', () => {
    const event = buildGoogleEvent({ title: 'x', startISO: '2026-09-01T14:00:00Z', endISO: '2026-09-01T15:00:00Z' });
    expect(event.attendees).toBeUndefined();
  });
});
