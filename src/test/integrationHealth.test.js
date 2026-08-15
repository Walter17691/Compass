import { describe, it, expect } from 'vitest';
import { summarizeIntegrationHealth } from '../lib/integrationHealth.js';

describe('summarizeIntegrationHealth', () => {
  it('returns an empty object for no events', () => {
    expect(summarizeIntegrationHealth([])).toEqual({});
    expect(summarizeIntegrationHealth(undefined)).toEqual({});
  });

  it('records the most recent success per provider', () => {
    const events = [
      { provider: 'outlook_mail', status: 'success', created_at: '2026-08-15T10:00:00Z', detail: 'hr@acme.com' },
      { provider: 'outlook_mail', status: 'success', created_at: '2026-08-10T10:00:00Z', detail: 'hr@acme.com' },
    ];
    const summary = summarizeIntegrationHealth(events);
    expect(summary.outlook_mail.lastSuccessAt).toBe('2026-08-15T10:00:00Z');
    expect(summary.outlook_mail.recentFailureCount).toBe(0);
  });

  it('counts errors that are newer than the most recent success as recent failures', () => {
    const events = [
      { provider: 'gmail', status: 'error', created_at: '2026-08-15T12:00:00Z', detail: 'Token exchange failed' },
      { provider: 'gmail', status: 'error', created_at: '2026-08-15T11:00:00Z', detail: 'Token exchange failed' },
      { provider: 'gmail', status: 'success', created_at: '2026-08-14T10:00:00Z', detail: 'hr@acme.com' },
      { provider: 'gmail', status: 'error', created_at: '2026-08-13T09:00:00Z', detail: 'old failure' },
    ];
    const summary = summarizeIntegrationHealth(events);
    expect(summary.gmail.lastSuccessAt).toBe('2026-08-14T10:00:00Z');
    expect(summary.gmail.recentFailureCount).toBe(2);
    expect(summary.gmail.lastErrorAt).toBe('2026-08-15T12:00:00Z');
    expect(summary.gmail.lastErrorDetail).toBe('Token exchange failed');
  });

  it('keeps providers independent of each other', () => {
    const events = [
      { provider: 'google_calendar', status: 'success', created_at: '2026-08-15T10:00:00Z' },
      { provider: 'ms365_calendar', status: 'error', created_at: '2026-08-15T09:00:00Z', detail: 'Token exchange failed' },
    ];
    const summary = summarizeIntegrationHealth(events);
    expect(summary.google_calendar.lastSuccessAt).toBe('2026-08-15T10:00:00Z');
    expect(summary.ms365_calendar.lastSuccessAt).toBeNull();
    expect(summary.ms365_calendar.recentFailureCount).toBe(1);
  });

  it('reports a provider with only errors as never having succeeded', () => {
    const events = [
      { provider: 'outlook_mail', status: 'error', created_at: '2026-08-15T10:00:00Z', detail: 'Failed to save the connection' },
    ];
    const summary = summarizeIntegrationHealth(events);
    expect(summary.outlook_mail.lastSuccessAt).toBeNull();
    expect(summary.outlook_mail.recentFailureCount).toBe(1);
  });
});
