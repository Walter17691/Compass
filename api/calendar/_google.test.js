import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildGoogleEvent, getValidAccessToken } from './_google.js';

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

// Defect #1 remediation — getValidAccessToken must classify Google's
// token-refresh failure with a stable providerErrorCode (the actual
// production repro's invalid_grant), and must never let a raw
// token-shaped value from the provider's response reach the thrown
// error's own message text.
describe('getValidAccessToken (Defect #1)', () => {
  const PAST = new Date(Date.now() - 3600000).toISOString();
  const FAR_FUTURE = new Date(Date.now() + 3600000).toISOString();
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('does not call Google at all when the current access token is not yet close to expiring', async () => {
    global.fetch = vi.fn();
    const result = await getValidAccessToken({ access_token: 'still-good', expires_at: FAR_FUTURE });
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toEqual({ accessToken: 'still-good', newExpiresAt: null });
  });

  it('attaches providerErrorCode "invalid_grant" and never includes the refresh token value in the thrown error message', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({ error: 'invalid_grant', error_description: 'Token has been expired or revoked.' }) }));
    await expect(getValidAccessToken({ access_token: 'stale', refresh_token: 'super-secret-refresh-token', expires_at: PAST }))
      .rejects.toMatchObject({ providerErrorCode: 'invalid_grant' });
    try {
      await getValidAccessToken({ access_token: 'stale', refresh_token: 'super-secret-refresh-token', expires_at: PAST });
    } catch (e) {
      expect(e.message).not.toContain('super-secret-refresh-token');
      expect(e.message).toContain('invalid_grant');
    }
  });

  it('attaches "unknown" as providerErrorCode when Google returns an error body with no error field', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, json: () => Promise.resolve({}) }));
    await expect(getValidAccessToken({ access_token: 'stale', refresh_token: 'x', expires_at: PAST }))
      .rejects.toMatchObject({ providerErrorCode: 'unknown' });
  });

  it('returns a fresh access token and expiry when refresh succeeds', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: true, json: () => Promise.resolve({ access_token: 'new-tok', expires_in: 3600 }) }));
    const result = await getValidAccessToken({ access_token: 'stale', refresh_token: 'x', expires_at: PAST });
    expect(result.accessToken).toBe('new-tok');
    expect(result.newExpiresAt).not.toBeNull();
  });
});
