import { describe, it, expect } from 'vitest';
import {
  fetchDsarReportVersions, REPORT_VERSION_GATEWAY_FAILURE,
} from '../lib/reportVersionGateway.js';

// ═══════════════════════════════════════════════════════════════════════════
// B3.4 — THE GATEWAY MUST DISTINGUISH FOUR OUTCOMES, NOT TWO.
//
//   no versions exist          -> ok, []           a true absence
//   versions exist, unreadable -> ok, [] or fewer  RLS filtered them; the
//                                                  caller is entitled to see
//                                                  only what it sees
//   fetch failed               -> NOT ok           must never read as absence
//   partial results            -> NOT ok           the dangerous one
//
// The fourth is why this file exists. PostgREST caps the rows a single request
// returns and hands back the capped page as an ORDINARY SUCCESS — no error,
// no signal. For a subject access request that is the worst failure shape
// available: a package that is short and looks complete. src/lib/
// paginatedFetch.js says so in its own header, and this gateway uses it.
// ═══════════════════════════════════════════════════════════════════════════

const row = (n, caseId = 'c1') => ({
  id: `ver-${n}`, org_id: 'org-1', case_id: caseId, version_no: n,
  body: `body ${n}`, source: 'generated', created_at: '2026-07-01T09:00:00Z',
  author_kind: 'user', adopted_at: null, adoption_basis: null,
  adoption_reason: null, is_current: false, superseded_at: null,
  superseded_by_version_id: null,
});

/**
 * A client that serves `rows` through range windows, capped at `serverCap`
 * rows per request — the behaviour the real server has and a naive
 * .select() cannot see.
 */
function pagingClient(rows, serverCap = 1000, failOnPage = null) {
  const calls = [];
  const q = {
    select: () => q, eq: () => q, order: () => q,
    range: (from, to) => {
      calls.push([from, to]);
      if (failOnPage !== null && calls.length === failOnPage) {
        return Promise.resolve({ data: null, error: { code: 'XX000', message: 'connection lost' } });
      }
      const width = Math.min(to - from + 1, serverCap);
      return Promise.resolve({ data: rows.slice(from, from + width), error: null });
    },
  };
  return { from: () => q, calls };
}

describe('B3.4 gateway — argument validation', () => {
  it('refuses with no client rather than pretending there were no versions', async () => {
    const r = await fetchDsarReportVersions(null, { orgId: 'org-1' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(REPORT_VERSION_GATEWAY_FAILURE.NO_CLIENT);
  });

  it('refuses with no organisation', async () => {
    for (const bad of [undefined, null, '', '   ', 42]) {
      const r = await fetchDsarReportVersions(pagingClient([]), { orgId: bad });
      expect(r.ok).toBe(false);
      expect(r.reason).toBe(REPORT_VERSION_GATEWAY_FAILURE.NO_ORG);
    }
  });
});

describe('B3.4 gateway — the four outcomes are distinguishable', () => {
  it('a genuine absence is ok with an empty list', async () => {
    const r = await fetchDsarReportVersions(pagingClient([]), { orgId: 'org-1' });
    expect(r.ok).toBe(true);
    expect(r.versions).toEqual([]);
  });

  it('a query failure is NOT ok, and carries no rows', async () => {
    const client = { from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ order: () => ({
        range: () => Promise.resolve({ data: null, error: { code: 'XX000', message: 'boom' } }),
      }) }) }) }),
    }) };
    const r = await fetchDsarReportVersions(client, { orgId: 'org-1' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(REPORT_VERSION_GATEWAY_FAILURE.QUERY_FAILED);
    expect(r.versions).toBeUndefined();
  });

  it('an absent table is reported distinctly, not as a crash or an absence', async () => {
    const client = { from: () => ({
      select: () => ({ eq: () => ({ order: () => ({ order: () => ({
        range: () => Promise.resolve({ data: null, error: { code: '42P01', message: 'no relation' } }),
      }) }) }) }),
    }) };
    const r = await fetchDsarReportVersions(client, { orgId: 'org-1' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(REPORT_VERSION_GATEWAY_FAILURE.TABLE_ABSENT);
  });

  it('a thrown error is caught and reported, never propagated to the compile', async () => {
    const client = { from: () => { throw new Error('network down'); } };
    const r = await fetchDsarReportVersions(client, { orgId: 'org-1' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(REPORT_VERSION_GATEWAY_FAILURE.QUERY_FAILED);
  });
});

describe('B3.4 gateway — a capped server cannot silently shorten the package', () => {
  it('returns EVERY row when the server caps each request below the total', async () => {
    const rows = Array.from({ length: 2500 }, (_, i) => row(i + 1));
    const client = pagingClient(rows, 1000);
    const r = await fetchDsarReportVersions(client, { orgId: 'org-1' });
    expect(r.ok).toBe(true);
    expect(r.versions).toHaveLength(2500);
    // and it genuinely had to page to get there
    expect(client.calls.length).toBeGreaterThan(1);
  });

  it('CONTROL — a single un-paged request would have returned only the cap', async () => {
    // Proves the test above is measuring something real: with the same client,
    // one window of the server's cap yields 1000, not 2500. If the gateway
    // ever stops paginating, the assertion above fails and this one explains why.
    const rows = Array.from({ length: 2500 }, (_, i) => row(i + 1));
    const client = pagingClient(rows, 1000);
    const { data } = await client.from().select().eq().order().order().range(0, 999999);
    expect(data).toHaveLength(1000);
  });

  it('a failure on a LATER page discards the partial rows rather than returning them', async () => {
    // The dangerous case: 1000 rows already in hand when page two fails.
    // Returning them would be a short package reported as a complete one.
    const rows = Array.from({ length: 2500 }, (_, i) => row(i + 1));
    const r = await fetchDsarReportVersions(pagingClient(rows, 1000, 2), { orgId: 'org-1' });
    expect(r.ok).toBe(false);
    expect(r.reason).toBe(REPORT_VERSION_GATEWAY_FAILURE.QUERY_FAILED);
    expect(r.versions).toBeUndefined();
  });
});

describe('B3.4 gateway — what it selects and what it maps', () => {
  it('maps snake_case columns onto the shape the compiler consumes', async () => {
    const r = await fetchDsarReportVersions(pagingClient([{
      ...row(2), adopted_at: '2026-07-02T09:00:00Z', adoption_basis: 'hr_exception',
      adoption_reason: 'investigator left', is_current: true,
    }]), { orgId: 'org-1' });
    expect(r.versions[0]).toEqual({
      id: 'ver-2', orgId: 'org-1', caseId: 'c1', versionNo: 2, body: 'body 2',
      source: 'generated', createdAt: '2026-07-01T09:00:00Z', authorKind: 'user',
      adoptedAt: '2026-07-02T09:00:00Z', adoptionBasis: 'hr_exception',
      adoptionReason: 'investigator left', isCurrent: true,
      supersededAt: null, supersededByVersionId: null,
    });
  });

  it('never selects the internal actors, so they cannot reach the browser at all', async () => {
    const captured = [];
    const q = {
      select: (cols) => { captured.push(cols); return q; },
      eq: () => q, order: () => q, range: () => Promise.resolve({ data: [], error: null }),
    };
    await fetchDsarReportVersions({ from: () => q }, { orgId: 'org-1' });
    expect(captured[0]).toBeTruthy();
    expect(captured[0]).not.toMatch(/created_by/);
    expect(captured[0]).not.toMatch(/adopted_by/);
    // CONTROL: it does select the things it needs, so the assertion above is
    // not passing because the column list is empty.
    expect(captured[0]).toMatch(/author_kind/);
    expect(captured[0]).toMatch(/adoption_basis/);
    expect(captured[0]).toMatch(/\bbody\b/);
  });

  it('drops malformed rows rather than emitting nulls into the package', async () => {
    const r = await fetchDsarReportVersions(pagingClient([row(1), null, 'nonsense', row(2)]), { orgId: 'org-1' });
    expect(r.ok).toBe(true);
    expect(r.versions).toHaveLength(2);
  });
});
