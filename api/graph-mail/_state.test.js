import { describe, it, expect, beforeAll } from 'vitest';
import { signState, verifyState } from './_state.js';

// signState/verifyState guard the Outlook OAuth callback against CSRF and
// forged connection requests — this is the only thing standing between an
// attacker crafting their own `state` value and having their Outlook
// mailbox linked to someone else's Compass account (or vice versa).
describe('graph-mail state signing', () => {
  beforeAll(() => {
    process.env.GRAPH_MAIL_STATE_SECRET = 'test-secret-do-not-use-in-prod';
  });

  it('round-trips a payload signed and verified with the same secret', () => {
    const payload = { userId: 'u1', orgId: 'o1', nonce: 'n1', expiresAt: Date.now() + 60000 };
    const state = signState(payload);
    expect(verifyState(state)).toEqual(payload);
  });

  it('rejects a state with a tampered payload', () => {
    const state = signState({ userId: 'u1', orgId: 'o1', nonce: 'n1', expiresAt: Date.now() + 60000 });
    const [, sig] = state.split('.');
    const tamperedPayload = Buffer.from(JSON.stringify({ userId: 'attacker', orgId: 'o1', nonce: 'n1', expiresAt: Date.now() + 60000 })).toString('base64url');
    expect(verifyState(`${tamperedPayload}.${sig}`)).toBeNull();
  });

  it('rejects a state signed with a different secret', () => {
    const state = signState({ userId: 'u1', orgId: 'o1', nonce: 'n1', expiresAt: Date.now() + 60000 });
    const originalSecret = process.env.GRAPH_MAIL_STATE_SECRET;
    process.env.GRAPH_MAIL_STATE_SECRET = 'a-different-secret';
    try {
      expect(verifyState(state)).toBeNull();
    } finally {
      process.env.GRAPH_MAIL_STATE_SECRET = originalSecret;
    }
  });

  it('rejects an expired state', () => {
    const state = signState({ userId: 'u1', orgId: 'o1', nonce: 'n1', expiresAt: Date.now() - 1000 });
    expect(verifyState(state)).toBeNull();
  });

  it('rejects malformed input without throwing', () => {
    expect(verifyState(null)).toBeNull();
    expect(verifyState('')).toBeNull();
    expect(verifyState('no-dot-separator')).toBeNull();
    expect(verifyState(42)).toBeNull();
  });
});
