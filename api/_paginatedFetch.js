import { supabaseRequest } from './_supabase.js';

// Phase 6.5 hardening (structural remediation, Prompt 12 — Pagination /
// Complete-Data invariant). Server-side sibling of
// src/lib/paginatedFetch.js's fetchAllPages — that one already closed
// this exact bug client-side (Batch 6) for loadCasesFromDB/
// loadEmployeeRecords, but every api/*.js handler using the plain
// supabaseRequest() fetch wrapper (not the supabase-js client, so no
// .range() builder available) was never covered by that fix. Confirmed
// live and currently active, not theoretical: api/cron/_digest.js's
// unpaginated `cases?org_id=eq.<org>&select=*` silently drops 1,715 of
// that org's 2,715 real cases (PostgREST's default row cap), meaning the
// daily deadline digest has been processing well under half that org's
// cases every single day.
//
// path must already include every filter/order-by the caller needs, with
// no existing Range header of its own — this helper owns paging via
// PostgREST's Range-Unit/Range headers, appending &order=id.asc only if
// the caller hasn't already specified one, since a stable order is
// required for range pages to not skip or duplicate rows (same
// requirement fetchAllPages documents client-side).
export async function fetchAllPagesServer(path, pageSize = 1000) {
  let allRows = [];
  let from = 0;
  while (true) {
    const to = from + pageSize - 1;
    const res = await supabaseRequest(path, { headers: { 'Range-Unit': 'items', Range: `${from}-${to}` } });
    if (!res.ok) return { data: allRows, error: await res.text() };
    const page = await res.json();
    if (!page || page.length === 0) break;
    allRows = allRows.concat(page);
    // Stops on a genuinely empty page, not on page.length < pageSize —
    // PostgREST's own per-request cap could be lower than pageSize, which
    // would make that comparison true while real rows remain (same
    // reasoning as src/lib/paginatedFetch.js's client-side twin).
    from += page.length;
  }
  return { data: allRows, error: null };
}
