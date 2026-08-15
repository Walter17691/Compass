import { describe, it, expect } from 'vitest';
import { providerAdapter, availabilityPath, availabilityRequestOptions, normalizeAvailabilityEvents } from './_providers.js';

describe('providerAdapter', () => {
  it('returns the google adapter with a PUT update method', () => {
    const adapter = providerAdapter('google');
    expect(adapter.eventsPath).toBe('events');
    expect(adapter.updateMethod).toBe('PUT');
    expect(typeof adapter.buildEvent).toBe('function');
  });

  it('returns the microsoft adapter with a PATCH update method', () => {
    const adapter = providerAdapter('microsoft');
    expect(adapter.eventsPath).toBe('events');
    expect(adapter.updateMethod).toBe('PATCH');
    expect(typeof adapter.buildEvent).toBe('function');
  });

  it('throws for an unrecognised provider', () => {
    expect(() => providerAdapter('yahoo')).toThrow('Unknown calendar provider: yahoo');
  });
});

describe('availabilityPath (Phase 5, IP16)', () => {
  it('builds a Google events.list time-window query', () => {
    expect(availabilityPath('google', '2026-08-20T09:00:00.000Z', '2026-08-20T10:00:00.000Z'))
      .toBe('events?timeMin=2026-08-20T09%3A00%3A00.000Z&timeMax=2026-08-20T10%3A00%3A00.000Z&singleEvents=true');
  });

  it('builds a Microsoft calendarView query', () => {
    expect(availabilityPath('microsoft', '2026-08-20T09:00:00.000Z', '2026-08-20T10:00:00.000Z'))
      .toBe('calendarView?startDateTime=2026-08-20T09%3A00%3A00.000Z&endDateTime=2026-08-20T10%3A00%3A00.000Z');
  });

  it('throws for an unrecognised provider', () => {
    expect(() => availabilityPath('yahoo', 'a', 'b')).toThrow('Unknown calendar provider: yahoo');
  });
});

describe('availabilityRequestOptions (Phase 5, IP16)', () => {
  it('requests UTC-normalized times from Microsoft only', () => {
    expect(availabilityRequestOptions('microsoft')).toEqual({ headers: { Prefer: 'outlook.timezone="UTC"' } });
    expect(availabilityRequestOptions('google')).toEqual({});
  });
});

describe('normalizeAvailabilityEvents (Phase 5, IP16)', () => {
  it('normalizes a Google events.list response', () => {
    const json = { items: [{ summary: 'Team standup', start: { dateTime: '2026-08-20T09:00:00Z' }, end: { dateTime: '2026-08-20T09:15:00Z' } }] };
    expect(normalizeAvailabilityEvents('google', json)).toEqual([{ title: 'Team standup', start: '2026-08-20T09:00:00Z', end: '2026-08-20T09:15:00Z' }]);
  });

  it('normalizes a Microsoft calendarView response, appending the Z the API omits', () => {
    const json = { value: [{ subject: 'Disciplinary hearing', start: { dateTime: '2026-08-20T09:00:00.0000000' }, end: { dateTime: '2026-08-20T10:00:00.0000000' } }] };
    expect(normalizeAvailabilityEvents('microsoft', json)).toEqual([{ title: 'Disciplinary hearing', start: '2026-08-20T09:00:00.0000000Z', end: '2026-08-20T10:00:00.0000000Z' }]);
  });

  it('falls back to "Busy" when a title is missing, on both providers', () => {
    expect(normalizeAvailabilityEvents('google', { items: [{ start: {}, end: {} }] })[0].title).toBe('Busy');
    expect(normalizeAvailabilityEvents('microsoft', { value: [{ start: {}, end: {} }] })[0].title).toBe('Busy');
  });

  it('returns an empty array for a missing/empty response or an unknown provider', () => {
    expect(normalizeAvailabilityEvents('google', {})).toEqual([]);
    expect(normalizeAvailabilityEvents('google', null)).toEqual([]);
    expect(normalizeAvailabilityEvents('yahoo', { items: [{}] })).toEqual([]);
  });
});
