import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ls, lsSet } from '../lib/storage';

describe('ls / lsSet', () => {
  beforeEach(() => { localStorage.clear(); });

  it('round-trips a value through lsSet/ls', () => {
    lsSet('k1', { a: 1 });
    expect(ls('k1', null)).toEqual({ a: 1 });
  });

  it('ls returns the fallback when the key is missing', () => {
    expect(ls('missing-key', 'fallback')).toBe('fallback');
  });

  // Phase 6.5 hardening (Prompt 14, Section 9 — closes independent audit
  // finding 10.1) — was a bare try/catch swallowing every error
  // including QuotaExceededError, with zero visibility. Live-reproduced
  // via E2E against a real org whose case data had grown large enough to
  // exceed the browser's quota — every save silently failed forever.
  it('does not throw when localStorage.setItem fails, but logs it', () => {
    const original = Storage.prototype.setItem;
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    Storage.prototype.setItem = () => { throw new DOMException('quota exceeded', 'QuotaExceededError'); };
    try {
      expect(() => lsSet('big-key', { huge: 'payload' })).not.toThrow();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('big-key'), expect.anything());
    } finally {
      Storage.prototype.setItem = original;
      consoleSpy.mockRestore();
    }
  });
});
