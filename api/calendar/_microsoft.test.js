import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { buildMicrosoftEvent, getValidAccessToken } from './_microsoft.js';

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

// Phase 6.5 hardening (production regression suite, integrations) —
// the token-refresh path every calendar create/update/delete handler
// goes through via _providers.js's freshAccessToken. Not exercised by
// any existing test (buildMicrosoftEvent's own tests are pure payload
// shape, no network/expiry involved).
describe('getValidAccessToken', () => {
  let originalFetch;
  beforeEach(() => {
    originalFetch = global.fetch;
    process.env.MS_GRAPH_TENANT_ID = 'tenant-1';
    process.env.MS_GRAPH_CLIENT_ID = 'client-1';
    process.env.MS_GRAPH_CLIENT_SECRET = 'secret-1';
  });
  afterEach(() => { global.fetch = originalFetch; });

  const connection = (overrides = {}) => ({
    access_token: 'old-token',
    refresh_token: 'refresh-1',
    expires_at: new Date(Date.now() + 10 * 60 * 1000).toISOString(),
    ...overrides,
  });

  it('reuses the cached access token without a network call when it is not yet close to expiry', async () => {
    global.fetch = vi.fn();
    const result = await getValidAccessToken(connection());
    expect(global.fetch).not.toHaveBeenCalled();
    expect(result).toEqual({ accessToken: 'old-token', newExpiresAt: null, newRefreshToken: null });
  });

  it('refreshes when the token is within 60s of expiry, and persists the rotated refresh token Microsoft sometimes issues', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ access_token: 'new-token', expires_in: 3600, refresh_token: 'rotated-refresh' }) });
    const result = await getValidAccessToken(connection({ expires_at: new Date(Date.now() + 30 * 1000).toISOString() }));
    expect(global.fetch).toHaveBeenCalledTimes(1);
    expect(result.accessToken).toBe('new-token');
    expect(result.newRefreshToken).toBe('rotated-refresh');
    expect(new Date(result.newExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it('refreshes when the token has already expired', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: true, json: () => Promise.resolve({ access_token: 'new-token', expires_in: 3600 }) });
    const result = await getValidAccessToken(connection({ expires_at: new Date(Date.now() - 60 * 1000).toISOString() }));
    expect(result.accessToken).toBe('new-token');
    expect(result.newRefreshToken).toBeNull(); // Microsoft doesn't always rotate it
  });

  // The real "expired Microsoft token" scenario the prompt names —
  // Microsoft has revoked/expired the refresh token itself (the user
  // hasn't used the connection in months, or revoked consent), so the
  // refresh call itself fails with invalid_grant. Must surface as a
  // clear, catchable error, not a silently-empty token.
  it('throws a clear error when the refresh token itself is expired/revoked (invalid_grant)', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, json: () => Promise.resolve({ error: 'invalid_grant', error_description: 'AADSTS700082: The refresh token has expired' }) });
    await expect(getValidAccessToken(connection({ expires_at: new Date(Date.now() - 60 * 1000).toISOString() })))
      .rejects.toThrow(/Failed to refresh Microsoft access token/);
  });

  // A 429 from the token endpoint looks identical to any other non-ok
  // response to this function (Microsoft returns it as a plain JSON body
  // with a non-2xx status, same as invalid_grant) — this confirms that
  // path is genuinely exercised, not just the invalid_grant shape above.
  it('surfaces a 429 rate-limit response from the token endpoint as a thrown error, not a silent bad token', async () => {
    global.fetch = vi.fn().mockResolvedValue({ ok: false, status: 429, json: () => Promise.resolve({ error: 'temporarily_unavailable' }) });
    await expect(getValidAccessToken(connection({ expires_at: new Date(Date.now() - 60 * 1000).toISOString() })))
      .rejects.toThrow(/Failed to refresh Microsoft access token/);
  });
});
