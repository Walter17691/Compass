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
vi.mock('../lib/reportVersionGateway', async () => {
  const actual = await vi.importActual('../lib/reportVersionGateway');
  return { ...actual, fetchDsarReportVersions: vi.fn(async () => ({ ok: true, versions: [] })) };
});
vi.mock('../lib/findingRevisionGateway', () => ({
  fetchDsarFindingRevisions: vi.fn(),
  REVISION_GATEWAY_FAILURE: {
    NO_CLIENT: 'no_client', NO_ORG: 'no_org', QUERY_FAILED: 'query_failed', TABLE_ABSENT: 'table_absent',
  },
}));

const { DsarScreen } = await import('../screens/DsarScreen.jsx');
const { authedFetch } = await import('../lib/authedFetch');
const { fetchDsarFindingRevisions } = await import('../lib/findingRevisionGateway');

// ═══════════════════════════════════════════════════════════════════════════
// IR-REPORT-01b / B2 — THE REVISION HISTORY MUST REACH THE PACKAGE THROUGH
// THE SCREEN, NOT JUST THROUGH THE COMPILER.
//
// WHY THIS FILE EXISTS. B2 shipped `investigation_finding_revisions` with a
// `findingRevisions` compiler parameter, a dsar: included classification, a
// manifest entry, a three-way governance lock, and 21 passing tests. Not one
// row was ever read: every test handed the compiler a fixture directly, and no
// caller anywhere supplied the argument. The suite certified an integration
// that did not exist, which is the exact failure the D4.3 block in
// DsarScreen.test.jsx was written about — repeated.
//
// The governance gates CANNOT catch it. They tie the manifest to the compiler's
// signature and to the classification; none of the three knows whether a caller
// passes anything. Only an assertion on the DOWNLOADED BYTES can.
//
// So these tests mock the gateway and assert two different things:
//   1. the screen genuinely CALLS the gateway (the wiring), and
//   2. what the gateway returns genuinely reaches the FILE (the integration),
// with the raw wording and the acting user still absent from it.
//
// A separate file from DsarScreen.test.jsx on purpose: vi.mock is hoisted
// file-wide, and mocking the gateway there would change the rendered output of
// every unrelated test in it.
// ═══════════════════════════════════════════════════════════════════════════

const noop = () => {};
// reviewedFlaggedSections: true — these assert package CONTENT, i.e. the
// approved-response path. See src/test/dsarCompletionIntegrity.test.jsx for the
// draft path.
//
// reviewedBy/reviewedAt are set because "the approved-response path" means an
// attestation that can be ATTRIBUTED to a named reviewer. The flag on its own
// is the THIRD state — recorded, but with no reviewer on record — which carries
// a different label, filename and responseStatus, and has its own tests in that
// same file. Without these the waitFor below looks for a button that no longer
// exists and every test in this file times out.
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

const revision = {
  id: 'rev-1', orgId: 'org-1', caseId: 'c1', allegationId: 'alg_1',
  field: 'investigator_finding',
  previousValue: 'I consider the timeline unclear and the account inconsistent.',
  newValue: 'The timeline is resolved; the overtime was authorised.',
  actorKind: 'user', changedAt: '2026-07-01T09:00:00Z', seq: 41,
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
  fetchDsarFindingRevisions.mockResolvedValue({ ok: true, revisions: [] });
});

describe('B2 wiring — the screen actually reads the revision table', () => {
  it('calls the gateway, scoped to the organisation', async () => {
    await compileAndDownload();
    expect(fetchDsarFindingRevisions).toHaveBeenCalledTimes(1);
    const [, opts] = fetchDsarFindingRevisions.mock.calls[0];
    expect(opts).toEqual({ orgId: 'org-1' });
  });

  it('passes a real client rather than undefined', async () => {
    // A gateway called with no client returns NO_CLIENT and the package would
    // silently contain nothing — the failure mode this whole file exists for.
    await compileAndDownload();
    const [client] = fetchDsarFindingRevisions.mock.calls[0];
    expect(client).toBeTruthy();
  });
});

describe('B2 integration — what reaches the downloaded file', () => {
  it('carries the revision into the package', async () => {
    fetchDsarFindingRevisions.mockResolvedValue({ ok: true, revisions: [revision] });
    const pkg = await compileAndDownload();
    expect(pkg.findingRevisions).toHaveLength(1);
    expect(pkg.findingRevisions[0].caseId).toBe('c1');
    expect(pkg.findingRevisions[0].allegationId).toBe('alg_1');
    expect(pkg.findingRevisions[0].field).toBe('investigator_finding');
    expect(pkg.findingRevisions[0].seq).toBe(41);
    expect(pkg.findingRevisions[0].actorKind).toBe('user');
    expect(pkg.findingRevisions[0].supersededTextRequiresReview).toBe(true);
  });

  it('does NOT write the draft wording into the file', async () => {
    fetchDsarFindingRevisions.mockResolvedValue({ ok: true, revisions: [revision] });
    const pkg = await compileAndDownload();
    const asText = JSON.stringify(pkg.findingRevisions);
    expect(asText).not.toContain('I consider the timeline unclear');
    expect(asText).not.toContain('The timeline is resolved');
  });

  it('does NOT write the acting user into the file', async () => {
    fetchDsarFindingRevisions.mockResolvedValue({
      ok: true, revisions: [{ ...revision, changedBy: 'user-inv-secret' }],
    });
    const pkg = await compileAndDownload();
    expect(JSON.stringify(pkg.findingRevisions)).not.toContain('user-inv-secret');
    expect(pkg.findingRevisions[0]).not.toHaveProperty('changedBy');
  });

  it('excludes a revision belonging to someone else\'s case', async () => {
    fetchDsarFindingRevisions.mockResolvedValue({
      ok: true, revisions: [revision, { ...revision, id: 'rev-9', caseId: 'c9' }],
    });
    const pkg = await compileAndDownload();
    expect(pkg.findingRevisions.map(r => r.caseId)).toEqual(['c1']);
  });
});

describe('the download drops nothing from the compiled package', () => {
  // Behavioural replacement for the source-text assertion that used to pin
  // `downloadJson(compiled,`. The completion-integrity slice wraps the payload
  // to stamp responseStatus onto the artefact; this proves the wrapper ADDS and
  // never removes, which is the guarantee dsarCaseDisclosure.test.js relies on
  // when it asserts redaction against the serialised bytes.
  it('carries every section a reviewer and a subject rely on', async () => {
    fetchDsarFindingRevisions.mockResolvedValue({ ok: true, revisions: [revision] });
    const pkg = await compileAndDownload();
    for (const key of [
      'employeeName', 'identityStatus', 'identityRequiresReconciliation',
      'cases', 'caseDisclosure', 'allegations', 'allegationDisclosure',
      'standaloneMeetings', 'standaloneMeetingsDisposition',
      'findingRevisions', 'findingRevisionDisposition',
      'caseDecisions', 'auditLog', 'signingRequests', 'signingDisclosure',
      'thirdPartyContainment', 'flaggedThirdPartyMentions',
      'subjectMentionsInOrgNarratives', 'evidenceRequiringReview',
      'actedAsStaff', 'identityBasisByCollection', 'compiledAt',
    ]) {
      expect(pkg, `the download dropped ${key}`).toHaveProperty(key);
    }
  });

  it('stamps the response status onto the artefact itself', async () => {
    const pkg = await compileAndDownload();
    expect(pkg.responseStatus).toBe('approved_for_release');
    expect(pkg.reviewRecorded).toBe(true);
  });
});

describe('B2 integration — a failed read is never mistaken for "nothing was rewritten"', () => {
  it('reports a query failure in the package', async () => {
    fetchDsarFindingRevisions.mockResolvedValue({ ok: false, reason: 'query_failed' });
    const pkg = await compileAndDownload();
    expect(pkg.findingRevisionDisposition.readFailed).toBe(true);
    expect(pkg.findingRevisionDisposition.note).toMatch(/could not read/i);
    expect(pkg.findingRevisionDisposition.note).toMatch(/completeness cannot be confirmed/i);
  });

  it('reports the pre-migration absent table as a failed read, not as an empty history', async () => {
    fetchDsarFindingRevisions.mockResolvedValue({ ok: false, reason: 'table_absent' });
    const pkg = await compileAndDownload();
    expect(pkg.findingRevisionDisposition.readFailed).toBe(true);
    expect(pkg.findingRevisions).toEqual([]);
  });

  it('says so distinctly when the history was read and is genuinely empty', async () => {
    fetchDsarFindingRevisions.mockResolvedValue({ ok: true, revisions: [] });
    const pkg = await compileAndDownload();
    expect(pkg.findingRevisionDisposition.readFailed).toBe(false);
    expect(pkg.findingRevisionDisposition.excluded).toBe(true);
    expect(pkg.findingRevisionDisposition.note).toMatch(/has been rewritten|no superseded wording|no investigator finding/i);
    expect(pkg.findingRevisionDisposition.note).not.toMatch(/could not read/i);
  });

  it('shows the reviewer that the read failed', async () => {
    fetchDsarFindingRevisions.mockResolvedValue({ ok: false, reason: 'query_failed' });
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(
      () => expect(screen.getByText(/investigation revision history could not be read/i)).toBeInTheDocument(),
      { timeout: 5000 },
    );
  });
});

describe('B2 integration — the human reviewer is actually told', () => {
  it('raises a review item for superseded wording, in the one banner reviewers read', async () => {
    fetchDsarFindingRevisions.mockResolvedValue({ ok: true, revisions: [revision] });
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(
      () => expect(screen.getByText(/was rewritten — decide whether the superseded wording is disclosed/i)).toBeInTheDocument(),
      { timeout: 5000 },
    );
  });

  it('tells the reviewer how many findings were rewritten, without showing the wording', async () => {
    fetchDsarFindingRevisions.mockResolvedValue({ ok: true, revisions: [revision] });
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(
      () => expect(screen.getByText(/investigator finding has been rewritten/i)).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.queryByText(/I consider the timeline unclear/)).not.toBeInTheDocument();
  });

  it('says nothing about revisions when none were rewritten', async () => {
    fetchDsarFindingRevisions.mockResolvedValue({ ok: true, revisions: [] });
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(
      // The label depends on the package's state. A deliberately failed
      // collection now yields "Download partial package (collection
      // incomplete)", which is the point of the completeness work — so the
      // helper matches any download control rather than pinning one label.
      () => expect(screen.getByRole('button', { name: /^Download (response package|draft for review|partial package)/ })).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.queryByText(/has been rewritten/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/revision history could not be read/i)).not.toBeInTheDocument();
  });
});

describe('B2 integration — third-party protection survives the round trip', () => {
  // The risk: a colleague named in a draft that was later edited out of the live
  // record would be released from the revision store PRECISELY BECAUSE the name
  // had been removed from the current text.
  it('flags a colleague named ONLY in the superseded wording, in the downloaded file', async () => {
    fetchDsarFindingRevisions.mockResolvedValue({
      ok: true,
      revisions: [{
        ...revision,
        previousValue: 'Dana Colleague told me she authorised the overtime herself.',
        newValue: 'The overtime was authorised.',
      }],
    });
    const pkg = await compileAndDownload();
    const flagged = JSON.stringify(pkg.flaggedThirdPartyMentions || []);
    expect(flagged).toContain('Dana Colleague');
    expect(flagged).toContain('findingRevision.investigator_finding.superseded');
  });

  it('flags a colleague named in the REPLACEMENT wording too', async () => {
    fetchDsarFindingRevisions.mockResolvedValue({
      ok: true,
      revisions: [{
        ...revision,
        previousValue: 'The account is inconsistent.',
        newValue: 'Dana Colleague has since confirmed the overtime was authorised.',
      }],
    });
    const pkg = await compileAndDownload();
    const hit = (pkg.flaggedThirdPartyMentions || [])
      .find(m => String(m.field || '').includes('findingRevision'));
    expect(hit).toBeTruthy();
    expect(hit.mentionedName).toBe('Dana Colleague');
    expect(hit.field).toBe('findingRevision.investigator_finding.replacement');
    expect(hit.caseId).toBe('c1');
    expect(hit.allegationId).toBe('alg_1');
  });

  it('surfaces that flag to the human, and does not auto-redact it', async () => {
    fetchDsarFindingRevisions.mockResolvedValue({
      ok: true,
      revisions: [{
        ...revision,
        previousValue: 'Dana Colleague told me she authorised the overtime herself.',
        newValue: 'The overtime was authorised.',
      }],
    });
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(
      () => expect(screen.getByText(/mentions another named individual/i)).toBeInTheDocument(),
      { timeout: 5000 },
    );
    expect(screen.getByText(/it does not redact automatically/i)).toBeInTheDocument();
  });
});
