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
