import { describe, it, expect } from 'vitest';
import { buildMicrosoftEvent } from './_microsoft.js';

describe('buildMicrosoftEvent', () => {
  it('builds a timed event with the trailing UTC "Z" stripped, paired with timeZone:UTC', () => {
    const event = buildMicrosoftEvent({ title: 'Investigation meeting', description: 'Re: allegation 1', startISO: '2026-09-01T14:00:00Z', endISO: '2026-09-01T15:00:00Z' });
    expect(event).toEqual({
      subject: 'Investigation meeting',
      body: { contentType: 'text', content: 'Re: allegation 1' },
      start: { dateTime: '2026-09-01T14:00:00', timeZone: 'UTC' },
      end: { dateTime: '2026-09-01T15:00:00', timeZone: 'UTC' },
    });
  });

  it('strips a "+00:00" offset the same way as a trailing "Z"', () => {
    const event = buildMicrosoftEvent({ title: 'x', startISO: '2026-09-01T14:00:00+00:00', endISO: '2026-09-01T15:00:00+00:00' });
    expect(event.start.dateTime).toBe('2026-09-01T14:00:00');
    expect(event.end.dateTime).toBe('2026-09-01T15:00:00');
  });

  it('defaults description body content to an empty string when omitted', () => {
    const event = buildMicrosoftEvent({ title: 'x', startISO: '2026-09-01T14:00:00Z', endISO: '2026-09-01T15:00:00Z' });
    expect(event.body.content).toBe('');
  });

  it('includes attendees, mapped to Graph\'s emailAddress/type shape', () => {
    const event = buildMicrosoftEvent({
      title: 'Disciplinary hearing', startISO: '2026-09-01T14:00:00Z', endISO: '2026-09-01T15:00:00Z',
      attendees: [{ email: 'jane@acme.com', name: 'Jane Doe' }, { email: 'sam@acme.com' }],
    });
    expect(event.attendees).toEqual([
      { emailAddress: { address: 'jane@acme.com', name: 'Jane Doe' }, type: 'required' },
      { emailAddress: { address: 'sam@acme.com', name: 'sam@acme.com' }, type: 'required' },
    ]);
  });

  it('omits attendees entirely when none are given', () => {
    const event = buildMicrosoftEvent({ title: 'x', startISO: '2026-09-01T14:00:00Z', endISO: '2026-09-01T15:00:00Z' });
    expect(event.attendees).toBeUndefined();
  });
});
