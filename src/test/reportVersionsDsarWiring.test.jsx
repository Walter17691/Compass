import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/authedFetch', () => ({ authedFetch: vi.fn() }));
// COLLECTION GATEWAYS MOCKED AS HEALTHY. Without this they run for real
// against a client with no backend, every category reports a failed read, and
// the package correctly reports itself INCOMPLETE — which relabels the
// download button and is not what these tests are about. Previously a failed
// read was invisible here, which is exactly the defect the completeness work
// removed: these tests were relying on it without saying so.
vi.mock('../lib/meetingTableGateway', async () => {
  const actual = await vi.importActual('../lib/meetingTableGateway');
  return { ...actual, fetchDsarMeetings: vi.fn(async () => ({ ok: true, meetings: [] })) };
});
vi.mock('../lib/findingRevisionGateway', async () => {
  const actual = await vi.importActual('../lib/findingRevisionGateway');
  return { ...actual, fetchDsarFindingRevisions: vi.fn(async () => ({ ok: true, revisions: [] })) };
});
vi.mock('../lib/reportVersionGateway', async () => {
  // classifyReportVersion / REPORT_VERSION_STATE are PURE and are imported by
  // dsarCompile itself — mocking them away would make the compiler classify
  // nothing and the assertions below would pass for the wrong reason. Only the
  // fetch is replaced.
  const actual = await vi.importActual('../lib/reportVersionGateway');
  return { ...actual, fetchDsarReportVersions: vi.fn() };
});

const { DsarScreen } = await import('../screens/DsarScreen.jsx');
const { authedFetch } = await import('../lib/authedFetch');
const { fetchDsarReportVersions } = await import('../lib/reportVersionGateway');

// ═══════════════════════════════════════════════════════════════════════════
// B3.4 — THE REPORT VERSIONS MUST REACH THE PACKAGE THROUGH THE SCREEN, NOT
// JUST THROUGH THE COMPILER.
//
// This file exists because the identical failure has already happened once in
// this codebase. B2 shipped investigation_finding_revisions with a compiler
// parameter, a dsar: included classification, a manifest entry, a three-way
// governance lock and 21 passing tests — and nothing read the table, because
// every test handed the compiler a fixture. The suite certified an integration
// that did not exist.
//
// B3.1 then shipped investigation_report_versions deliberately UNWIRED and
// said so (INCLUDED_NOT_WIRED, dsarDefect B3.4) rather than repeat it. B3.4
// wires it, so the wiring itself has to be the thing under test.
//
// The governance gates cannot catch this. They tie the manifest to the
// compiler signature and to the classification; none of them knows whether any
// caller passes the argument. Only an assertion on the DOWNLOADED BYTES can.
//
// Separate file from DsarScreen.test.jsx on purpose: vi.mock is hoisted
// file-wide and would change the rendered output of every unrelated test.
// ═══════════════════════════════════════════════════════════════════════════

const noop = () => {};
const dsarRequests = [{
  id: 'r1', employeeName: 'Sam Employee', requestedBy: '', receivedDate: '2026-08-01',
  dueDate: '2026-09-01', status: 'received', extended: false, reviewedFlaggedSections: true,
  reviewedBy: '6dc60cca-5bae-475f-8e1a-bae85072455f', reviewedAt: '2026-10-09T12:00:00Z',
}];

const subjectCase = {
  id: 'c1', employeeName: 'Sam Employee', employeeEmail: 'sam@acme.com',
  caseType: 'Misconduct', meetings: [],
};

const baseProps = {
  canAdministerDsar: true,
  dsarRequests,
  createDsarRequest: noop,
  updateDsarRequest: noop,
  extendDsarRequest: noop,
  promptDialog: async () => null,
  cases: [subjectCase],
  employeeRecords: [
    { id: 'emp-sam', name: 'Sam Employee', jobTitle: 'Analyst', location: 'London' },
    { id: 'emp-dana', name: 'Dana Colleague', jobTitle: 'Analyst', location: 'London' },
  ],
  starterInstances: [], leaverInstances: [], wellbeingNotes: [], concernReferrals: [],
  allegations: [], caseSignals: [], hrReviewRequests: [], auditLog: [],
  setScreen: noop,
};

const adopted = {
  id: 'ver-1', orgId: 'org-1', caseId: 'c1', versionNo: 2,
  body: 'Dana Colleague confirmed the rota was changed without notice.',
  source: 'edited', createdAt: '2026-07-01T09:00:00Z', authorKind: 'user',
  adoptedAt: '2026-07-02T09:00:00Z', adoptionBasis: 'assigned_investigator',
  adoptionReason: null, isCurrent: true, supersededAt: null, supersededByVersionId: null,
};

/** Compile, download, and return the parsed package the user actually gets. */
async function compileAndDownload(props = {}) {
  const blobs = [];
  const origCreate = URL.createObjectURL;
  const origRevoke = URL.revokeObjectURL;
  URL.createObjectURL = (blob) => { blobs.push(blob); return 'blob:captured'; };
  URL.revokeObjectURL = () => {};
  try {
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" {...props} />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(
      // The label depends on the package's state. A deliberately failed
      // collection now yields "Download partial package (collection
      // incomplete)", which is the point of the completeness work — so the
      // helper matches any download control rather than pinning one label.
      () => expect(screen.getByRole('button', { name: /^Download (response package|draft for review|partial package)/ })).toBeInTheDocument(),
      { timeout: 5000 },
    );
    await user.click(screen.getByRole('button', { name: /^Download (response package|draft for review|partial package)/ }));
    expect(blobs).toHaveLength(1);
    return JSON.parse(await blobs[0].text());
  } finally {
    URL.createObjectURL = origCreate;
    URL.revokeObjectURL = origRevoke;
  }
}

beforeEach(() => {
  vi.clearAllMocks();
  authedFetch.mockResolvedValue({ ok: true, json: async () => ({ signingRequests: [], portalAccounts: [], portalInvites: [], profiles: [], caseViews: [] }) });
  fetchDsarReportVersions.mockResolvedValue({ ok: true, versions: [] });
});

describe('B3.4 wiring — the screen actually reads the report version table', () => {
  it('calls the gateway, scoped to the organisation', async () => {
    await compileAndDownload();
    expect(fetchDsarReportVersions).toHaveBeenCalledTimes(1);
    const [, opts] = fetchDsarReportVersions.mock.calls[0];
    expect(opts).toEqual({ orgId: 'org-1' });
  });

  it('passes a real client rather than undefined', async () => {
    // A gateway called with no client returns NO_CLIENT, and the package would
    // silently contain nothing — the failure this whole file exists for.
    await compileAndDownload();
    const [client] = fetchDsarReportVersions.mock.calls[0];
    expect(client).toBeTruthy();
  });
});

describe('B3.4 integration — what reaches the downloaded file', () => {
  it('carries the version and its state into the package', async () => {
    fetchDsarReportVersions.mockResolvedValue({ ok: true, versions: [adopted] });
    const pkg = await compileAndDownload();
    expect(pkg.reportVersions).toHaveLength(1);
    expect(pkg.reportVersions[0].caseId).toBe('c1');
    expect(pkg.reportVersions[0].versionNo).toBe(2);
    expect(pkg.reportVersions[0].state).toBe('current_adopted');
    expect(pkg.reportVersions[0].adoptionBasis).toBe('assigned_investigator');
    expect(pkg.reportVersions[0].bodyRequiresReview).toBe(true);
    expect(pkg.reportVersionDisposition.counts.currentAdopted).toBe(1);
  });

  it('does NOT write the report wording into the file', async () => {
    fetchDsarReportVersions.mockResolvedValue({ ok: true, versions: [adopted] });
    const pkg = await compileAndDownload();
    expect(JSON.stringify(pkg.reportVersions)).not.toContain('rota was changed without notice');
  });

  it('does NOT write the internal actors into the file', async () => {
    fetchDsarReportVersions.mockResolvedValue({
      ok: true, versions: [{ ...adopted, createdBy: 'user-author-secret', adoptedBy: 'user-adopter-secret' }],
    });
    const pkg = await compileAndDownload();
    const asText = JSON.stringify(pkg.reportVersions);
    expect(asText).not.toContain('user-author-secret');
    expect(asText).not.toContain('user-adopter-secret');
  });

  it('still flags a third party named ONLY inside the withheld report body', async () => {
    // The wording never reaches the file, so the scan is the only thing that
    // can protect Dana — and it has to survive the round trip to the blob.
    fetchDsarReportVersions.mockResolvedValue({ ok: true, versions: [adopted] });
    const pkg = await compileAndDownload();
    const flagged = JSON.stringify(pkg.flaggedThirdPartyMentions || []);
    expect(flagged).toContain('Dana Colleague');
    expect(flagged).toContain('reportVersion.current_adopted.body');
  });

  it('excludes a version belonging to someone else\'s case', async () => {
    fetchDsarReportVersions.mockResolvedValue({
      ok: true, versions: [adopted, { ...adopted, id: 'ver-9', caseId: 'c9' }],
    });
    const pkg = await compileAndDownload();
    expect(pkg.reportVersions.map(v => v.caseId)).toEqual(['c1']);
  });

  it('reports a failed read as a failed read, not as "no versions exist"', async () => {
    fetchDsarReportVersions.mockResolvedValue({ ok: false, reason: 'query_failed' });
    const pkg = await compileAndDownload();
    expect(pkg.reportVersions).toEqual([]);
    expect(pkg.reportVersionDisposition.readFailed).toBe(true);
    expect(pkg.reportVersionDisposition.note).toMatch(/completeness cannot be confirmed/i);
  });

  it('reports an absent table as a failed read rather than crashing the compile', async () => {
    // A database without the B3.1 migration. The package must still be
    // produced, and must still say it cannot confirm completeness.
    fetchDsarReportVersions.mockResolvedValue({ ok: false, reason: 'table_absent' });
    const pkg = await compileAndDownload();
    expect(pkg.reportVersionDisposition.readFailed).toBe(true);
  });
});

describe('B3.4 release safety — this candidate reads, and only reads', () => {
  it('never calls an adoption RPC', async () => {
    fetchDsarReportVersions.mockResolvedValue({ ok: true, versions: [adopted] });
    await compileAndDownload();
    // The gateway module exports no write at all; assert that stays true, so
    // adding one becomes a conscious act rather than a side effect.
    const mod = await vi.importActual('../lib/reportVersionGateway');
    const exported = Object.keys(mod).sort();
    // B3.2-0 added fetchCaseReportVersions — a second READ on the same choke
    // point, case-scoped rather than org-scoped. B3.2-1 added
    // fetchReportVersionBody, a third read for the text of ONE chosen
    // version, and put its WRITE in src/lib/reportDraftGateway.js rather than
    // here. Listing the exports exactly is the point: a new export here has
    // to be a conscious act, and this assertion is what makes it one.
    expect(exported).toEqual([
      'REPORT_VERSION_GATEWAY_FAILURE', 'REPORT_VERSION_STATE',
      'classifyReportVersion', 'fetchCaseReportVersions', 'fetchDsarReportVersions',
      'fetchReportVersionBody',
    ]);
    expect(exported.some(n => /insert|save|create|adopt|update|delete/i.test(n))).toBe(false);
  });
});

describe('B3.4 — the downloaded file keeps a review flag on every version', () => {
  it('flags every state in the package and reproduces no wording', async () => {
    fetchDsarReportVersions.mockResolvedValue({ ok: true, versions: [
      { ...adopted, id: 'v-draft', versionNo: 1, body: 'Draft wording alpha',
        adoptedAt: null, adoptionBasis: null, isCurrent: false },
      { ...adopted, id: 'v-old', versionNo: 2, body: 'Replaced wording beta',
        isCurrent: false, supersededAt: '2026-07-03T09:00:00Z' },
      { ...adopted, id: 'v-now', versionNo: 3, body: 'Current wording gamma' },
    ] });
    const pkg = await compileAndDownload();
    expect(pkg.reportVersions).toHaveLength(3);
    expect(pkg.reportVersions.map(v => v.state).sort())
      .toEqual(['current_adopted', 'draft', 'historically_adopted']);
    pkg.reportVersions.forEach(v => {
      expect(v.bodyRequiresReview).toBe(true);
      expect(v).not.toHaveProperty('body');
    });
    const asText = JSON.stringify(pkg);
    for (const wording of ['Draft wording alpha', 'Replaced wording beta', 'Current wording gamma']) {
      expect(asText).not.toContain(wording);
    }
    expect(pkg.reportVersionDisposition.counts)
      .toEqual({ currentAdopted: 1, historicallyAdopted: 1, drafts: 1, unexpected: 0 });
  });
});
