import { describe, it, expect } from 'vitest';
import { redactTokenResponse } from './_oauthLog.js';

// Phase 6.5 hardening (closes Prompt 11 audit finding 2.11, MEDIUM) — every
// OAuth callback used to log the full token-exchange response verbatim on
// failure, including a genuinely live access_token whenever the provider
// returned one without a refresh_token.
describe('redactTokenResponse (Prompt 11 audit, 2.11)', () => {
  it('redacts access_token, refresh_token, and id_token', () => {
    const redacted = redactTokenResponse({ access_token: 'live-secret-1', refresh_token: 'live-secret-2', id_token: 'live-secret-3' });
    expect(redacted.access_token).toBe('[redacted]');
    expect(redacted.refresh_token).toBe('[redacted]');
    expect(redacted.id_token).toBe('[redacted]');
  });

  it('keeps non-token diagnostic fields intact', () => {
    const redacted = redactTokenResponse({ error: 'invalid_grant', error_description: 'Bad code', access_token: 'live-secret' });
    expect(redacted.error).toBe('invalid_grant');
    expect(redacted.error_description).toBe('Bad code');
    expect(redacted.access_token).toBe('[redacted]');
  });

  it('never leaves a live token value reachable anywhere in the output', () => {
    const tokenData = { access_token: 'ya29.super-secret-live-token', refresh_token: '1//also-secret', scope: 'calendar' };
    const redacted = redactTokenResponse(tokenData);
    expect(JSON.stringify(redacted)).not.toContain('ya29.super-secret-live-token');
    expect(JSON.stringify(redacted)).not.toContain('1//also-secret');
  });

  it('passes through non-object input unchanged', () => {
    expect(redactTokenResponse(null)).toBeNull();
    expect(redactTokenResponse(undefined)).toBeUndefined();
  });
});
