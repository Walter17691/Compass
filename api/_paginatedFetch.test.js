import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { fetchAllPagesServer } from './_paginatedFetch.js';

// Phase 6.5 hardening (structural remediation, Prompt 12 — Pagination /
// Complete-Data invariant). The bug this closes: a single unpaginated
// PostgREST request silently truncates at the server's default row cap
// once a table crosses it — confirmed live for api/cron/_digest.js's
// `cases` query against the app's largest real org (2,715 rows, cap
// dropped 1,715 of them). These tests exercise the paging loop itself,
// independent of any one caller.
function stubPages(pages) {
  let call = 0;
  const requests = [];
  global.fetch = vi.fn((url, options = {}) => {
    requests.push({ url: String(url), range: options.headers?.Range });
    const page = pages[call] ?? [];
    call++;
    return Promise.resolve({ ok: true, json: () => Promise.resolve(page) });
  });
  return requests;
}

describe('fetchAllPagesServer', () => {
  let originalFetch;
  beforeEach(() => { originalFetch = global.fetch; });
  afterEach(() => { global.fetch = originalFetch; });

  it('returns everything in one request when the table is under the page size', async () => {
    stubPages([[{ id: 1 }, { id: 2 }]]);
    const { data, error } = await fetchAllPagesServer('cases?org_id=eq.a&select=*', 1000);
    expect(error).toBeNull();
    expect(data).toEqual([{ id: 1 }, { id: 2 }]);
  });

  it('aggregates across multiple full pages until a genuinely empty page — the exact shape of the live 2,715-row org', async () => {
    const page1 = Array.from({ length: 3 }, (_, i) => ({ id: i }));
    const page2 = Array.from({ length: 3 }, (_, i) => ({ id: i + 3 }));
    const page3 = Array.from({ length: 1 }, (_, i) => ({ id: i + 6 }));
    const requests = stubPages([page1, page2, page3, []]);
    const { data, error } = await fetchAllPagesServer('cases?org_id=eq.a&select=*', 3);
    expect(error).toBeNull();
    expect(data.map(r => r.id)).toEqual([0, 1, 2, 3, 4, 5, 6]);
    // Confirms real Range headers were sent, advancing by exactly the
    // previous page's own row count each time (not a fixed page size),
    // matching fetchAllPages' own "stop on empty, not on short page" rule.
    expect(requests.map(r => r.range)).toEqual(['0-2', '3-5', '6-8', '7-9']);
  });

  it('does NOT stop early on a page shorter than pageSize while more rows remain — the specific bug this must not reintroduce', async () => {
    // A server-side cap lower than the requested pageSize would return a
    // short page even though real rows remain; stopping there would
    // silently reproduce the exact truncation this helper exists to fix.
    const shortButNotLast = Array.from({ length: 2 }, (_, i) => ({ id: i })); // shorter than pageSize=5
    const rest = [{ id: 2 }];
    stubPages([shortButNotLast, rest, []]);
    const { data } = await fetchAllPagesServer('cases?org_id=eq.a&select=*', 5);
    expect(data.map(r => r.id)).toEqual([0, 1, 2]);
  });

  it('stops and surfaces the error on a failed page instead of looping forever', async () => {
    global.fetch = vi.fn(() => Promise.resolve({ ok: false, text: () => Promise.resolve('boom') }));
    const { data, error } = await fetchAllPagesServer('cases?org_id=eq.a&select=*');
    expect(error).toBe('boom');
    expect(data).toEqual([]);
  });
});
