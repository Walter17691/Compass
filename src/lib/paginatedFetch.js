// Phase 6.5 hardening (Batch 6) — PostgREST caps how many rows a single
// request returns regardless of any .limit() a caller passes, unless the
// caller explicitly paginates. loadCasesFromDB/loadEmployeeRecords (App.jsx)
// both queried an org-scoped table with no .order()/.range() at all,
// which silently truncated real data once an org's row count crossed
// that cap — confirmed live, not theoretical, for both tables. Shared
// here instead of duplicated per call site.
//
// buildQuery(from, to) must return a Supabase query already filtered/
// ordered, with .range(from, to) applied — this helper only owns the
// paging loop, not the query shape, since every caller's own filters/
// column list/order-by column differ. A stable order is the caller's own
// responsibility: without one, Postgres row order isn't guaranteed
// stable across separate range requests, which can skip or duplicate
// rows between pages.
export async function fetchAllPages(buildQuery, pageSize = 1000) {
  let allRows = [];
  let from = 0;
  while (true) {
    const { data, error } = await buildQuery(from, from + pageSize - 1);
    if (error) return { data: allRows, error };
    if (!data || data.length === 0) break;
    allRows = allRows.concat(data);
    // Stops on a genuinely empty page, not on data.length < pageSize —
    // the server's own per-request cap could be lower than pageSize,
    // which would make that comparison true while real rows remain.
    from += data.length;
  }
  return { data: allRows, error: null };
}
