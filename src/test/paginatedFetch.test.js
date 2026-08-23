import { describe, it, expect, vi } from 'vitest';
import { fetchAllPages } from '../lib/paginatedFetch';

describe('fetchAllPages', () => {
  // Deliberately makes one trailing empty-page request to CONFIRM the
  // end, rather than assuming a short page (data.length < pageSize)
  // means done — see the "server-side cap below pageSize" test below for
  // why that assumption would be unsafe.
  it('returns everything that fits in one page, confirming the end with one more (empty) request', async () => {
    const buildQuery = vi.fn()
      .mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const result = await fetchAllPages(buildQuery, 1000);
    expect(result).toEqual({ data: [{ id: 1 }, { id: 2 }], error: null });
    expect(buildQuery).toHaveBeenCalledTimes(2);
    expect(buildQuery).toHaveBeenNthCalledWith(1, 0, 999);
    expect(buildQuery).toHaveBeenNthCalledWith(2, 2, 1001);
  });

  it('pages until a genuinely empty page comes back', async () => {
    const buildQuery = vi.fn()
      .mockResolvedValueOnce({ data: [{ id: 1 }, { id: 2 }], error: null })
      .mockResolvedValueOnce({ data: [{ id: 3 }, { id: 4 }], error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const result = await fetchAllPages(buildQuery, 2);
    expect(result.data).toEqual([{ id: 1 }, { id: 2 }, { id: 3 }, { id: 4 }]);
    expect(result.error).toBeNull();
    expect(buildQuery).toHaveBeenCalledTimes(3);
    expect(buildQuery).toHaveBeenNthCalledWith(1, 0, 1);
    expect(buildQuery).toHaveBeenNthCalledWith(2, 2, 3);
    expect(buildQuery).toHaveBeenNthCalledWith(3, 4, 5);
  });

  // The real reason this loop exists: PostgREST can cap a single
  // request's rows below the requested pageSize. Stopping on
  // "data.length < pageSize" would wrongly treat that server-capped
  // short page as the end, even though more rows remain — this proves
  // the loop instead keeps going until a page is truly empty.
  it('keeps paging even when a page returns fewer rows than requested but is not empty (server-side cap below pageSize)', async () => {
    const buildQuery = vi.fn()
      .mockResolvedValueOnce({ data: Array.from({ length: 3 }, (_, i) => ({ id: i })), error: null }) // asked for 10, server capped to 3
      .mockResolvedValueOnce({ data: Array.from({ length: 3 }, (_, i) => ({ id: i + 3 })), error: null })
      .mockResolvedValueOnce({ data: [], error: null });
    const result = await fetchAllPages(buildQuery, 10);
    expect(result.data).toHaveLength(6);
    expect(buildQuery).toHaveBeenCalledTimes(3);
  });

  it('stops immediately and returns what it has so far on an error', async () => {
    const buildQuery = vi.fn()
      .mockResolvedValueOnce({ data: [{ id: 1 }], error: null })
      .mockResolvedValueOnce({ data: null, error: { message: 'network error' } });
    const result = await fetchAllPages(buildQuery, 1);
    expect(result.data).toEqual([{ id: 1 }]);
    expect(result.error).toEqual({ message: 'network error' });
    expect(buildQuery).toHaveBeenCalledTimes(2);
  });

  it('returns an empty array, not null, when there is no data at all', async () => {
    const buildQuery = vi.fn().mockResolvedValue({ data: [], error: null });
    const result = await fetchAllPages(buildQuery);
    expect(result).toEqual({ data: [], error: null });
  });

  it('treats a null data page the same as an empty one', async () => {
    const buildQuery = vi.fn().mockResolvedValue({ data: null, error: null });
    const result = await fetchAllPages(buildQuery);
    expect(result).toEqual({ data: [], error: null });
  });

  it('defaults pageSize to 1000', async () => {
    const buildQuery = vi.fn().mockResolvedValue({ data: [], error: null });
    await fetchAllPages(buildQuery);
    expect(buildQuery).toHaveBeenCalledWith(0, 999);
  });
});

// Phase 6.5 hardening (P1, reliability review) — the abstract tests above
// prove the range/stop mechanics with a handful of rows; these prove the
// same mechanics hold at the literal scale this review was asked to
// check, against a fake table that reproduces the actual production
// failure mode: PostgREST silently capping each request's row count
// (here fixed at 1000, matching this project's live cap) regardless of
// what pageSize the caller asks for. A naive `.select().order()` with no
// `.range()` — or a single `.limit(N)` call for any N below the table's
// true size — would have silently truncated every one of these; this is
// exactly the bug class that was found live and fixed in App.jsx for
// case_signals (1,655 real rows) and case_tasks (1,263 real rows).
describe('fetchAllPages — realistic scale (Phase 6.5, P1)', () => {
  const SERVER_CAP = 1000;

  // Simulates a Postgres table of `totalRows` ordered rows behind a
  // PostgREST-like endpoint that honours .range() but never returns more
  // than SERVER_CAP rows in one response, no matter how large a range is
  // requested — the same shape as the real Supabase project this bug was
  // found in.
  function makeFakeTable(totalRows) {
    const allRows = Array.from({ length: totalRows }, (_, i) => ({ id: i, created_at: i }));
    return (from, to) => {
      const requested = allRows.slice(from, to + 1);
      const capped = requested.slice(0, SERVER_CAP);
      return Promise.resolve({ data: capped, error: null });
    };
  }

  it.each([100, 1000, 2000, 4500])('loads all %i rows, complete and in order, despite the server cap', async (totalRows) => {
    const buildQuery = makeFakeTable(totalRows);
    const { data, error } = await fetchAllPages(buildQuery, 1000);
    expect(error).toBeNull();
    expect(data).toHaveLength(totalRows);
    expect(data.map(r => r.id)).toEqual(Array.from({ length: totalRows }, (_, i) => i));
  });

  it('makes the minimum number of requests needed, not one per server-capped row', async () => {
    const raw = makeFakeTable(2000);
    const buildQuery = vi.fn(raw);
    await fetchAllPages(buildQuery, 1000);
    // 2000 rows / 1000-per-request cap = 2 full pages + 1 trailing empty
    // page to confirm the end, matching fetchAllPages' own documented
    // contract (see the first test in this file) rather than guessing
    // "done" from a short page.
    expect(buildQuery).toHaveBeenCalledTimes(3);
  });
});
