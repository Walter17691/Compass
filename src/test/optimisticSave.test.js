import { describe, it, expect, vi } from 'vitest';
import { conditionalUpdate } from '../lib/optimisticSave.js';

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
