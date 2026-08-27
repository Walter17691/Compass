import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ls, lsSet, capRecentForCache } from '../lib/storage';

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

  // Phase 6.5 hardening (data-lifecycle review, 10.1 remainder) — once a
  // key's payload crosses the quota, every future write for that same
  // key fails the exact same way forever, since setItem always
  // serialises the whole value. A pre-check avoids even attempting a
  // write already known to be hopeless, rather than relying on catching
  // the same failure over and over.
  it('skips the write entirely, without throwing, when the value is too large to ever fit', () => {
    const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    const settItemSpy = vi.spyOn(Storage.prototype, 'setItem');
    try {
      const huge = { blob: 'x'.repeat(4 * 1024 * 1024) };
      expect(() => lsSet('too-big-key', huge)).not.toThrow();
      expect(settItemSpy).not.toHaveBeenCalled();
      expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('too-big-key'));
    } finally {
      settItemSpy.mockRestore();
      consoleSpy.mockRestore();
    }
  });

  it('still writes a normally-sized value under the size cap', () => {
    lsSet('normal-key', { a: 'b'.repeat(1000) });
    expect(ls('normal-key', null)).toEqual({ a: 'b'.repeat(1000) });
  });
});

describe('capRecentForCache', () => {
  it('returns the array unchanged when it is at or under the cap', () => {
    const items = [{ id: 1, updatedAt: '2026-01-01' }, { id: 2, updatedAt: '2026-01-02' }];
    expect(capRecentForCache(items, 'updatedAt', 5)).toBe(items);
  });

  it('keeps only the most-recently-updated items, sorted newest first, when over the cap', () => {
    const items = [
      { id: 1, updatedAt: '2026-01-01' },
      { id: 2, updatedAt: '2026-03-01' },
      { id: 3, updatedAt: '2026-02-01' },
    ];
    expect(capRecentForCache(items, 'updatedAt', 2).map(i => i.id)).toEqual([2, 3]);
  });

  // A missing date field is what a case looks like on its very first
  // local save, before the Supabase round-trip sets a real updatedAt
  // (see App.jsx's newCase object). Live-reproduced via E2E: treating
  // that as epoch/oldest made a freshly-created case the FIRST thing
  // dropped by the cap, not the last — the opposite of the intent.
  it('treats a missing date field as newest, not oldest, so it survives the cap ahead of genuinely old items', () => {
    const items = [
      { id: 1, updatedAt: '2026-01-01' },
      { id: 2 }, // no updatedAt yet — must not be dropped first
      { id: 3, updatedAt: '2026-02-01' },
    ];
    expect(capRecentForCache(items, 'updatedAt', 2).map(i => i.id)).toEqual(expect.arrayContaining([2, 3]));
    expect(capRecentForCache(items, 'updatedAt', 2)).toHaveLength(2);
    expect(capRecentForCache(items, 'updatedAt', 2).map(i => i.id)).not.toContain(1);
  });

  it('passes through non-array input unchanged rather than throwing', () => {
    expect(capRecentForCache(null, 'updatedAt', 5)).toBeNull();
  });
});
