import { describe, it, expect, vi } from 'vitest';
import { conditionalUpdate, enqueueSave, withTransientRetry } from '../lib/optimisticSave.js';

function deferred() {
  let resolve;
  const promise = new Promise(r => { resolve = r; });
  return { promise, resolve };
}

// Mimics the chainable supabase-js query builder shape this helper calls:
// .from(table).update(payload).eq(...).eq(...).select() and
// .from(table).upsert(payload).select().
function fakeSupabase({ updateResult, upsertResult }) {
  const chain = (result) => {
    const builder = {
      eq: () => builder,
      select: () => Promise.resolve(result),
    };
    return builder;
  };
  return {
    from: () => ({
      update: () => chain(updateResult),
      upsert: () => chain(upsertResult),
    }),
  };
}

describe('conditionalUpdate', () => {
  it('upserts (no conflict check) when updatedAt is absent — first-ever save of a new row', async () => {
    const supabase = fakeSupabase({ upsertResult: { data: [{ id: 'a1' }], error: null } });
    const result = await conditionalUpdate(supabase, 'allegations', 'a1', null, { title: 'x' });
    expect(result).toEqual({ error: null, conflict: false });
  });

  it('succeeds when the conditional update matches exactly one row — nobody else saved first', async () => {
    const supabase = fakeSupabase({ updateResult: { data: [{ id: 'a1' }], error: null } });
    const result = await conditionalUpdate(supabase, 'allegations', 'a1', '2026-08-21T10:00:00.000Z', { title: 'x' });
    expect(result).toEqual({ error: null, conflict: false });
  });

  it('reports a conflict, not a silent no-op, when zero rows match — someone else saved since updatedAt', async () => {
    const supabase = fakeSupabase({ updateResult: { data: [], error: null } });
    const result = await conditionalUpdate(supabase, 'allegations', 'a1', '2026-08-21T10:00:00.000Z', { title: 'x' });
    expect(result).toEqual({ error: null, conflict: true });
  });

  it('surfaces a genuine Supabase error distinctly from a conflict', async () => {
    const supabase = fakeSupabase({ updateResult: { data: null, error: { message: 'network down' } } });
    const result = await conditionalUpdate(supabase, 'allegations', 'a1', '2026-08-21T10:00:00.000Z', { title: 'x' });
    expect(result.conflict).toBe(false);
    expect(result.error).toEqual({ message: 'network down' });
  });
});

// Phase 6.5 hardening (P0, data-integrity review) — extracted from
// saveAllegationToDB (App.jsx) so the ordering guarantee itself is
// directly testable: a save for the same id queued behind an earlier,
// still-in-flight one must not start until that earlier one has
// actually finished, regardless of which underlying network request
// would otherwise resolve first.
describe('enqueueSave', () => {
  it('runs saves for the same id strictly in order — a later save never starts before an earlier, slower one finishes (delayed/out-of-order requests)', async () => {
    const order = [];
    const queue = {};
    const first = deferred();
    const p1 = enqueueSave(queue, 'a1', async () => {
      order.push('first-start');
      await first.promise; // simulates a slow first request still in flight
      order.push('first-end');
    });
    // Fired immediately after, before the first has resolved — simulates
    // a rapid second edit's save landing while the first is still pending.
    const p2 = enqueueSave(queue, 'a1', async () => {
      order.push('second-start');
      order.push('second-end');
    });
    await Promise.resolve(); // let the microtask queue flush so 'first-start' actually runs
    // Nothing from the second save has run yet — it's queued, not racing.
    expect(order).toEqual(['first-start']);
    first.resolve();
    await Promise.all([p1, p2]);
    expect(order).toEqual(['first-start', 'first-end', 'second-start', 'second-end']);
  });

  it('a failed/rejected save does not wedge later saves for the same id (retry after transient failure keeps the queue moving)', async () => {
    const order = [];
    const queue = {};
    const p1 = enqueueSave(queue, 'a1', async () => { order.push('first'); throw new Error('transient network failure'); });
    const p2 = enqueueSave(queue, 'a1', async () => { order.push('second'); });
    await Promise.allSettled([p1, p2]);
    expect(order).toEqual(['first', 'second']);
  });

  it('different ids save independently — one id\'s queue never blocks another\'s (simultaneous edits to different rows)', async () => {
    const order = [];
    const queue = {};
    const slow = deferred();
    const pA = enqueueSave(queue, 'a1', async () => { await slow.promise; order.push('a1-done'); });
    const pB = enqueueSave(queue, 'a2', async () => { order.push('a2-done'); });
    await pB; // a2 finishes without waiting on a1's still-pending save
    expect(order).toEqual(['a2-done']);
    slow.resolve();
    await pA;
    expect(order).toEqual(['a2-done', 'a1-done']);
  });
});

describe('withTransientRetry', () => {
  it('does not retry on success', async () => {
    const fn = vi.fn().mockResolvedValue({ error: null, conflict: false });
    const result = await withTransientRetry(fn, { delayMs: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result).toEqual({ error: null, conflict: false });
  });

  it('does not retry a conflict — retrying the same stale write would not resolve it', async () => {
    const fn = vi.fn().mockResolvedValue({ error: null, conflict: true });
    const result = await withTransientRetry(fn, { delayMs: 1 });
    expect(fn).toHaveBeenCalledTimes(1);
    expect(result.conflict).toBe(true);
  });

  it('retries exactly once after a genuine transient failure, and succeeds on the retry', async () => {
    const fn = vi.fn()
      .mockResolvedValueOnce({ error: { message: 'network down' }, conflict: false })
      .mockResolvedValueOnce({ error: null, conflict: false });
    const result = await withTransientRetry(fn, { delayMs: 1 });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result).toEqual({ error: null, conflict: false });
  });

  it('surfaces the retry\'s own failure if it fails again too — never retries a third time', async () => {
    const fn = vi.fn().mockResolvedValue({ error: { message: 'still down' }, conflict: false });
    const result = await withTransientRetry(fn, { delayMs: 1 });
    expect(fn).toHaveBeenCalledTimes(2);
    expect(result.error).toEqual({ message: 'still down' });
  });
});
