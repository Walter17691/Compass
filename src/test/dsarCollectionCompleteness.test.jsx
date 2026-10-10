import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, cleanup } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

import { compileSubjectData } from '../lib/dsarCompile.js';

vi.mock('../lib/authedFetch', () => ({ authedFetch: vi.fn() }));
vi.mock('../lib/meetingTableGateway', async () => {
  const actual = await vi.importActual('../lib/meetingTableGateway');
  return { ...actual, fetchDsarMeetings: vi.fn() };
});
vi.mock('../lib/findingRevisionGateway', async () => {
  const actual = await vi.importActual('../lib/findingRevisionGateway');
  return { ...actual, fetchDsarFindingRevisions: vi.fn() };
});
vi.mock('../lib/reportVersionGateway', async () => {
  const actual = await vi.importActual('../lib/reportVersionGateway');
  return { ...actual, fetchDsarReportVersions: vi.fn() };
});

const { DsarScreen } = await import('../screens/DsarScreen.jsx');
const { authedFetch } = await import('../lib/authedFetch');
const mockedMeetings = (await import('../lib/meetingTableGateway')).fetchDsarMeetings;
const mockedRevisions = (await import('../lib/findingRevisionGateway')).fetchDsarFindingRevisions;
const mockedVersions = (await import('../lib/reportVersionGateway')).fetchDsarReportVersions;

// The gateway-level tests below must exercise the REAL implementations. A
// static import would resolve to the mocks declared above — which is exactly
// how a pagination test comes to pass against a stub that never paginates.
const { fetchDsarMeetings, GATEWAY_FAILURE } = await vi.importActual('../lib/meetingTableGateway');
const { fetchDsarFindingRevisions, REVISION_GATEWAY_FAILURE } = await vi.importActual('../lib/findingRevisionGateway');

// ═══════════════════════════════════════════════════════════════════════════
// DSAR COLLECTION COMPLETENESS.
//
// Three gateways feed the compiler through the ordinary authenticated client.
// All three had the same latent defect and one of them shipped with it fixed:
// a plain .select() is capped by the server's per-request row limit, and
// PostgREST returns the capped page as an ORDINARY SUCCESS. No error. Nothing
// to notice. For a subject access request that is the worst available failure
// shape — a package that is short and looks complete.
//
// This file covers the two that were hardened afterwards, and the thing none
// of them covered: what the PACKAGE says when a collection fails. The review
// attestation was always about the flagged sections a human read; it was never
// a claim that collection succeeded, and until now nothing stopped a package
// with a failed category exporting as `approved_for_release`.
// ═══════════════════════════════════════════════════════════════════════════

/** Serves rows through range windows, capped per request like the real server. */
function pagingClient(rows, { serverCap = 1000, failOnPage = null } = {}) {
  const calls = [];
  const b = {
    select: () => b, eq: () => b, order: () => b,
    range: (from, to) => {
      calls.push([from, to]);
      if (failOnPage !== null && calls.length === failOnPage) {
        return Promise.resolve({ data: null, error: { code: 'XX000', message: 'connection lost' } });
      }
      const width = Math.min(to - from + 1, serverCap);
      return Promise.resolve({ data: rows.slice(from, from + width), error: null });
    },
  };
  return { from: () => b, calls };
}

const meetingRow = n => ({
  id: `m-${n}`, org_id: 'org-1', case_id: null, meeting_type_id: 'informal',
  status: 'completed', employee_name: 'Sam Employee', created_by: 'u1',
});
const revisionRow = n => ({
  id: `rev-${n}`, org_id: 'org-1', case_id: 'c1', allegation_id: 'alg_1',
  field: 'investigator_finding', previous_value: 'old', new_value: 'new',
  actor_kind: 'user', changed_at: '2026-07-01T09:00:00Z', seq: n,
});

// ── The two hardened gateways, same six scenarios each ────────────────────
const GATEWAYS = [
  {
    name: 'fetchDsarMeetings',
    call: (client) => fetchDsarMeetings(client, { orgId: 'org-1' }),
    row: meetingRow,
    collection: 'meetings',
    failure: GATEWAY_FAILURE.QUERY_FAILED,
  },
  {
    name: 'fetchDsarFindingRevisions',
    call: (client) => fetchDsarFindingRevisions(client, { orgId: 'org-1' }),
    row: revisionRow,
    collection: 'revisions',
    failure: REVISION_GATEWAY_FAILURE.QUERY_FAILED,
  },
];

GATEWAYS.forEach(({ name, call, row, collection, failure }) => {
  describe(`${name} — collection completeness`, () => {
    it('an empty result is a SUCCESS with an empty list', async () => {
      const r = await call(pagingClient([]));
      expect(r.ok).toBe(true);
      expect(r[collection]).toEqual([]);
    });

    it('a single page is returned whole', async () => {
      const r = await call(pagingClient([row(1), row(2), row(3)]));
      expect(r.ok).toBe(true);
      expect(r[collection]).toHaveLength(3);
    });

    it('MULTIPLE pages exceeding the server cap are all returned', async () => {
      const rows = Array.from({ length: 2500 }, (_, i) => row(i + 1));
      const client = pagingClient(rows, { serverCap: 1000 });
      const r = await call(client);
      expect(r.ok).toBe(true);
      expect(r[collection]).toHaveLength(2500);
      expect(client.calls.length).toBeGreaterThan(1);
    });

    it('CONTROL — one un-paged request would have returned only the cap', async () => {
      // Proves the assertion above measures something real. If pagination is
      // ever removed, that test drops to 1000 and this explains why.
      const rows = Array.from({ length: 2500 }, (_, i) => row(i + 1));
      const client = pagingClient(rows, { serverCap: 1000 });
      const { data } = await client.from().select().eq().order().range(0, 999999);
      expect(data).toHaveLength(1000);
    });

    it('a failure on the FIRST page is a failure, not an empty collection', async () => {
      const rows = Array.from({ length: 10 }, (_, i) => row(i + 1));
      const r = await call(pagingClient(rows, { serverCap: 1000, failOnPage: 1 }));
      expect(r.ok).toBe(false);
      expect(r.reason).toBe(failure);
      expect(r[collection]).toBeUndefined();
    });

    it('a failure on a LATER page discards the partial rows already gathered', async () => {
      const rows = Array.from({ length: 2500 }, (_, i) => row(i + 1));
      const r = await call(pagingClient(rows, { serverCap: 1000, failOnPage: 2 }));
      expect(r.ok).toBe(false);
      expect(r.reason).toBe(failure);
      // The dangerous shape: 1000 rows in hand. Returning them would be a short
      // package reported as a complete one.
      expect(r[collection]).toBeUndefined();
    });

    it('scopes the query to the organisation (cross-org isolation at the source)', async () => {
      const captured = [];
      const b = {
        select: () => b,
        eq: (col, val) => { captured.push([col, val]); return b; },
        order: () => b,
        range: () => Promise.resolve({ data: [], error: null }),
      };
      await call({ from: () => b });
      expect(captured).toContainEqual(['org_id', 'org-1']);
    });

    it('orders by a TOTAL key, so paging cannot repeat or skip a row', async () => {
      // A range window over a non-total order is not stable between pages.
      const orders = [];
      const b = {
        select: () => b, eq: () => b,
        order: (col) => { orders.push(col); return b; },
        range: () => Promise.resolve({ data: [], error: null }),
      };
      await call({ from: () => b });
      expect(orders).toContain('id');
    });
  });
});

// ── The failure state, traced all the way to the artefact ─────────────────
describe('the compiler reports collection completeness as one answerable fact', () => {
  const base = {
    employeeRecords: [{ name: 'Ada Lovelace', jobTitle: 'Engineer', location: 'London' }],
    cases: [{ id: 'c1', employeeName: 'Ada Lovelace', caseType: 'Misconduct', meetings: [] }],
  };

  it('is complete when every gateway succeeded', () => {
    const r = compileSubjectData('Ada Lovelace', base);
    expect(r.collectionComplete).toBe(true);
    expect(r.incompleteCollections).toEqual([]);
  });

  it('names EVERY failed collection, not just the first', () => {
    const r = compileSubjectData('Ada Lovelace', {
      ...base, meetingFetchFailed: true, findingRevisionFetchFailed: true, reportVersionFetchFailed: true,
    });
    expect(r.collectionComplete).toBe(false);
    expect(r.incompleteCollections).toEqual([
      'meetings', 'investigationFindingRevisions', 'investigationReportVersions',
    ]);
  });

  it('one failed collection is enough to make the package incomplete', () => {
    for (const flag of ['meetingFetchFailed', 'findingRevisionFetchFailed', 'reportVersionFetchFailed']) {
      const r = compileSubjectData('Ada Lovelace', { ...base, [flag]: true });
      expect(r.collectionComplete, flag).toBe(false);
      expect(r.incompleteCollections).toHaveLength(1);
    }
  });
});

// ── The downloaded artefact and the banner ────────────────────────────────
const noop = () => {};
const approvedRequest = [{
  id: 'r1', employeeName: 'Sam Employee', requestedBy: '', receivedDate: '2026-08-01',
  dueDate: '2026-09-01', status: 'received', extended: false, reviewedFlaggedSections: true,
  reviewedBy: '6dc60cca-5bae-475f-8e1a-bae85072455f', reviewedAt: '2026-10-09T12:00:00Z',
}];

const baseProps = {
  canAdministerDsar: true,
  dsarRequests: approvedRequest,
  createDsarRequest: noop, updateDsarRequest: noop, extendDsarRequest: noop,
  promptDialog: async () => null,
  cases: [{ id: 'c1', employeeName: 'Sam Employee', caseType: 'Misconduct', meetings: [] }],
  employeeRecords: [{ id: 'emp-sam', name: 'Sam Employee', jobTitle: 'Analyst', location: 'London' }],
  starterInstances: [], leaverInstances: [], wellbeingNotes: [], concernReferrals: [],
  allegations: [], caseSignals: [], hrReviewRequests: [], auditLog: [],
  setScreen: noop,
};

async function compileThenDownload() {
  // Each call mounts its own screen; without this a previous mount's download
  // control is still in the document and the role query matches two.
  cleanup();
  const blobs = [];
  const names = [];
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (blob) => { blobs.push(blob); return 'blob:captured'; };
  URL.revokeObjectURL = () => {};
  const origCreateEl = document.createElement.bind(document);
  document.createElement = (tag) => {
    const el = origCreateEl(tag);
    if (tag === 'a') {
      Object.defineProperty(el, 'download', {
        set(v) { names.push(v); },
        get() { return names.at(-1); },
      });
    }
    return el;
  };
  try {
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    const btn = await waitFor(() => {
      const b = screen.getByRole('button', { name: /Download (response package|draft|partial package)/ });
      expect(b).toBeInTheDocument();
      return b;
    }, { timeout: 5000 });
    const label = btn.textContent;
    await user.click(btn);
    expect(blobs).toHaveLength(1);
    return { pkg: JSON.parse(await blobs[0].text()), filename: names.at(-1), label };
  } finally {
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
    document.createElement = origCreateEl;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  // All five collections, because a response missing any of them is now —
  // correctly — treated as an incomplete collection. A two-key payload here
  // would make every test in this file incomplete for an unrelated reason.
  authedFetch.mockResolvedValue({ ok: true, json: async () => ({
    signingRequests: [], portalAccounts: [], portalInvites: [], profiles: [], caseViews: [],
  }) });
  mockedMeetings.mockResolvedValue({ ok: true, meetings: [] });
  mockedRevisions.mockResolvedValue({ ok: true, revisions: [] });
  mockedVersions.mockResolvedValue({ ok: true, versions: [] });
});

describe('a package with a failed collection cannot present itself as approved', () => {
  it('CONTROL — with every collection healthy it IS approved for release', async () => {
    const { pkg, filename, label } = await compileThenDownload();
    expect(pkg.collectionComplete).toBe(true);
    expect(pkg.responseStatus).toBe('approved_for_release');
    expect(filename).not.toMatch(/INCOMPLETE/);
    expect(label).toBe('Download response package');
  });

  it('a failed meetings read downgrades the status and says why', async () => {
    mockedMeetings.mockResolvedValue({ ok: false, reason: 'query_failed' });
    const { pkg, filename, label } = await compileThenDownload();
    expect(pkg.collectionComplete).toBe(false);
    expect(pkg.incompleteCollections).toEqual(['meetings']);
    expect(pkg.responseStatus).toBe('incomplete_collection_not_approved');
    expect(pkg.responseStatus).not.toBe('approved_for_release');
    expect(filename).toMatch(/_INCOMPLETE_COLLECTION\.json$/);
    expect(label).toBe('Download partial package (collection incomplete)');
    expect(pkg.warning).toMatch(/INCOMPLETE/);
    expect(pkg.warning).toMatch(/must not be sent/);
  });

  it('a failed revisions read does the same', async () => {
    mockedRevisions.mockResolvedValue({ ok: false, reason: 'query_failed' });
    const { pkg } = await compileThenDownload();
    expect(pkg.incompleteCollections).toEqual(['investigationFindingRevisions']);
    expect(pkg.responseStatus).toBe('incomplete_collection_not_approved');
  });

  it('a failed report-version read does the same', async () => {
    mockedVersions.mockResolvedValue({ ok: false, reason: 'query_failed' });
    const { pkg } = await compileThenDownload();
    expect(pkg.incompleteCollections).toEqual(['investigationReportVersions']);
    expect(pkg.responseStatus).toBe('incomplete_collection_not_approved');
  });

  it('PRESERVES the historical reviewer provenance it reports alongside', async () => {
    // The attestation is not withdrawn by an unrelated read failure. It was a
    // review of the flagged sections, and that remains true and attributable.
    mockedMeetings.mockResolvedValue({ ok: false, reason: 'query_failed' });
    const { pkg } = await compileThenDownload();
    expect(pkg.reviewRecorded).toBe(true);
    expect(pkg.reviewAttributable).toBe(true);
    expect(pkg.reviewedBy).toBe('6dc60cca-5bae-475f-8e1a-bae85072455f');
    expect(pkg.reviewedAt).toBe('2026-10-09T12:00:00Z');
    expect(pkg.warning).toMatch(/still stands/);
  });

  it('still carries the per-category disposition, so the reason is findable', async () => {
    mockedRevisions.mockResolvedValue({ ok: false, reason: 'query_failed' });
    const { pkg } = await compileThenDownload();
    expect(pkg.findingRevisionDisposition.readFailed).toBe(true);
    expect(pkg.findingRevisionDisposition.note).toMatch(/completeness cannot be confirmed/i);
  });
});

describe('the reviewer is warned on screen, before downloading anything', () => {
  it('shows an incomplete-collection banner naming the categories', async () => {
    mockedMeetings.mockResolvedValue({ ok: false, reason: 'query_failed' });
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(() => expect(screen.getByText(/This package is incomplete/)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByText(/cannot be approved for release/)).toBeInTheDocument();
    expect(screen.getByText(/meetings/)).toBeInTheDocument();
  });

  it('CONTROL — no banner when every collection succeeded', async () => {
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download response package' })).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.queryByText(/This package is incomplete/)).not.toBeInTheDocument();
  });
});

describe('HR Director-only access is unchanged by any of this', () => {
  it('refuses the whole workspace without the capability, failed collection or not', () => {
    const { canAdministerDsar, ...withoutCapability } = baseProps;
    expect(canAdministerDsar).toBe(true);
    render(<DsarScreen {...withoutCapability} orgId="org-1" />);
    expect(screen.getByText(/Only an HR Director can work on subject access requests/i)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Compile data' })).not.toBeInTheDocument();
  });
});

// ═══════════════════════════════════════════════════════════════════════════
// THE PORTAL LOOKUP — five collections the browser cannot read for anyone
// else, and the only one of the four pathways whose failure was previously
// invisible in the artefact rather than merely untruncated.
//
// A swallowed failure here is a TOTAL silent loss, not a truncation: all five
// simply stayed [] and the package compiled as though the subject had no
// signing requests, no portal account, no invitations, no profile and no case
// views. That is a worse shape than a short list, because nothing about it
// looks wrong.
// ═══════════════════════════════════════════════════════════════════════════
const PORTAL_FIVE = ['signingRequests', 'portalAccounts', 'portalInvites', 'profiles', 'caseViews'];
const okPayload = (over = {}) => ({
  signingRequests: [], portalAccounts: [], portalInvites: [], profiles: [], caseViews: [], ...over,
});

describe('the portal lookup — the six outcomes are distinguished', () => {
  it('a successful EMPTY response is a real absence, and the package stays complete', async () => {
    authedFetch.mockResolvedValue({ ok: true, json: async () => okPayload() });
    const { pkg } = await compileThenDownload();
    expect(pkg.collectionComplete).toBe(true);
    expect(pkg.incompleteCollections).toEqual([]);
    expect(pkg.responseStatus).toBe('approved_for_release');
  });

  it('a successful POPULATED response is used, and the package stays complete', async () => {
    authedFetch.mockResolvedValue({ ok: true, json: async () => okPayload({
      signingRequests: [{ sign_id: 's1', employee_name: 'Sam Employee', status: 'signed', document: 'Record' }],
    }) });
    const { pkg } = await compileThenDownload();
    expect(pkg.collectionComplete).toBe(true);
    expect(pkg.signingRequests.length).toBeGreaterThan(0);
  });

  it('an HTTP non-OK marks ALL FIVE collections incomplete', async () => {
    authedFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const { pkg } = await compileThenDownload();
    expect(pkg.collectionComplete).toBe(false);
    expect(pkg.incompleteCollections).toEqual(PORTAL_FIVE);
    expect(pkg.responseStatus).toBe('incomplete_collection_not_approved');
  });

  it('a NETWORK exception marks all five incomplete rather than compiling silently', async () => {
    authedFetch.mockRejectedValue(new Error('network down'));
    const { pkg } = await compileThenDownload();
    expect(pkg.collectionComplete).toBe(false);
    expect(pkg.incompleteCollections).toEqual(PORTAL_FIVE);
  });

  it('MALFORMED JSON (a body that will not parse) is a failure, not an empty result', async () => {
    authedFetch.mockResolvedValue({ ok: true, json: async () => { throw new SyntaxError('Unexpected token <'); } });
    const { pkg } = await compileThenDownload();
    expect(pkg.collectionComplete).toBe(false);
    expect(pkg.incompleteCollections).toEqual(PORTAL_FIVE);
  });

  it('a 200 carrying something that is not the expected object is a failure', async () => {
    for (const body of [null, 'a string', [1, 2, 3], 42]) {
      authedFetch.mockResolvedValue({ ok: true, json: async () => body });
      const { pkg } = await compileThenDownload();
      expect(pkg.collectionComplete, JSON.stringify(body)).toBe(false);
      expect(pkg.incompleteCollections).toEqual(PORTAL_FIVE);
      cleanup();
    }
  });

  it('a MISSING required collection is named, and only that one', async () => {
    const { profiles, ...withoutProfiles } = okPayload();
    expect(profiles).toEqual([]); // the key really was there to remove
    authedFetch.mockResolvedValue({ ok: true, json: async () => withoutProfiles });
    const { pkg } = await compileThenDownload();
    expect(pkg.collectionComplete).toBe(false);
    expect(pkg.incompleteCollections).toEqual(['profiles']);
  });

  it('a non-array collection is treated as missing, not as empty', async () => {
    authedFetch.mockResolvedValue({ ok: true, json: async () => okPayload({ caseViews: { nope: true } }) });
    const { pkg } = await compileThenDownload();
    expect(pkg.incompleteCollections).toEqual(['caseViews']);
  });

  it('a PARTIAL collection reported by the server is marked, and the rows it DID return are kept', async () => {
    // The server now says which collections it could not read whole. Without
    // that this arrives as a short list under HTTP 200 and is undetectable.
    authedFetch.mockResolvedValue({ ok: true, json: async () => okPayload({
      signingRequests: [{ sign_id: 's1', employee_name: 'Sam Employee', status: 'signed', document: 'Record' }],
      failedCollections: ['signingRequests'],
    }) });
    const { pkg } = await compileThenDownload();
    expect(pkg.collectionComplete).toBe(false);
    expect(pkg.incompleteCollections).toEqual(['signingRequests']);
    // the partial rows are still carried — a reviewer may need them
    expect(pkg.signingRequests.length).toBeGreaterThan(0);
  });

  it('server-reported and client-detected failures are merged without duplicates', async () => {
    const { profiles, ...noProfiles } = okPayload();
    expect(profiles).toEqual([]);
    authedFetch.mockResolvedValue({ ok: true, json: async () => ({
      ...noProfiles, failedCollections: ['profiles', 'caseViews'],
    }) });
    const { pkg } = await compileThenDownload();
    expect(pkg.incompleteCollections.filter(c => c === 'profiles')).toHaveLength(1);
    expect(pkg.incompleteCollections.sort()).toEqual(['caseViews', 'profiles']);
  });
});

describe('the portal lookup — the failure reaches the artefact and the screen', () => {
  it('the downloaded JSON is labelled incomplete and never approved', async () => {
    authedFetch.mockResolvedValue({ ok: false, status: 503, json: async () => ({}) });
    const { pkg, filename, label } = await compileThenDownload();
    expect(pkg.responseStatus).toBe('incomplete_collection_not_approved');
    expect(pkg.responseStatus).not.toBe('approved_for_release');
    expect(filename).toMatch(/_INCOMPLETE_COLLECTION\.json$/);
    expect(label).toBe('Download partial package (collection incomplete)');
    expect(pkg.warning).toMatch(/signingRequests/);
    expect(pkg.warning).toMatch(/must not be sent/);
  });

  it('the banner names the affected collections', async () => {
    authedFetch.mockResolvedValue({ ok: true, json: async () => okPayload({ failedCollections: ['portalInvites'] }) });
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(() => expect(screen.getByText(/This package is incomplete/)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.getByText(/portalInvites/)).toBeInTheDocument();
  });

  it('PRESERVES the recorded review provenance — a lookup failure does not erase it', async () => {
    authedFetch.mockRejectedValue(new Error('network down'));
    const { pkg } = await compileThenDownload();
    expect(pkg.reviewRecorded).toBe(true);
    expect(pkg.reviewAttributable).toBe(true);
    expect(pkg.reviewedBy).toBe('6dc60cca-5bae-475f-8e1a-bae85072455f');
    expect(pkg.reviewedAt).toBe('2026-10-09T12:00:00Z');
    expect(pkg.warning).toMatch(/still stands/);
  });

  it('does NOT accidentally approve when only the portal lookup failed', async () => {
    // Every other gateway is healthy, and the request is fully attested and
    // attributable — the exact combination that would previously have
    // produced approved_for_release.
    authedFetch.mockResolvedValue({ ok: false, status: 500, json: async () => ({}) });
    const { pkg } = await compileThenDownload();
    expect(pkg.findingRevisionDisposition.readFailed).toBe(false);
    expect(pkg.reportVersionDisposition.readFailed).toBe(false);
    expect(pkg.responseStatus).toBe('incomplete_collection_not_approved');
  });
});

describe('a dropped malformed row is reported, not silently discarded', () => {
  it('each gateway counts the rows it rejected', async () => {
    const bad = { org_id: 'org-1', case_id: 'c1' }; // no id
    const m = await fetchDsarMeetings(pagingClient([meetingRow(1), bad]), { orgId: 'org-1' });
    expect(m.ok).toBe(true);
    expect(m.meetings).toHaveLength(1);
    expect(m.droppedRows).toBe(1);

    const r = await fetchDsarFindingRevisions(pagingClient([revisionRow(1), bad]), { orgId: 'org-1' });
    expect(r.ok).toBe(true);
    expect(r.revisions).toHaveLength(1);
    expect(r.droppedRows).toBe(1);
  });

  it('reports zero when every row mapped cleanly', async () => {
    const m = await fetchDsarMeetings(pagingClient([meetingRow(1), meetingRow(2)]), { orgId: 'org-1' });
    expect(m.droppedRows).toBe(0);
  });

  it('a dropped row makes the PACKAGE incomplete rather than quietly short', async () => {
    mockedMeetings.mockResolvedValue({ ok: true, meetings: [], droppedRows: 2 });
    const { pkg } = await compileThenDownload();
    expect(pkg.collectionComplete).toBe(false);
    expect(pkg.incompleteCollections).toContain('meetings');
    expect(pkg.responseStatus).toBe('incomplete_collection_not_approved');
  });

  it('CONTROL — the same shape with zero drops stays complete and approved', async () => {
    mockedMeetings.mockResolvedValue({ ok: true, meetings: [], droppedRows: 0 });
    const { pkg } = await compileThenDownload();
    expect(pkg.collectionComplete).toBe(true);
    expect(pkg.responseStatus).toBe('approved_for_release');
  });
});

describe('none of this weakened the existing protections', () => {
  it('HR Director-only access still refuses the workspace without the capability', () => {
    const { canAdministerDsar, ...withoutCapability } = baseProps;
    expect(canAdministerDsar).toBe(true);
    render(<DsarScreen {...withoutCapability} orgId="org-1" />);
    expect(screen.getByText(/Only an HR Director can work on subject access requests/i)).toBeInTheDocument();
  });

  it('tenant isolation and third-party flags survive a portal failure', async () => {
    authedFetch.mockRejectedValue(new Error('network down'));
    const { pkg } = await compileThenDownload();
    // The case boundary still holds and the third-party machinery still ran.
    expect(pkg).toHaveProperty('thirdPartyContainment');
    expect(pkg).toHaveProperty('identityBasisByCollection');
    expect(pkg.cases.every(c => c.employeeName === 'Sam Employee')).toBe(true);
  });
});
