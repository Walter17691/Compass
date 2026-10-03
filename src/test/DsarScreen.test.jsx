// The awaited work here is the DSAR compile's own computation — authedFetch is
// mocked and resolves immediately — so waitFor's 1000ms DEFAULT is a timing
// assertion on local CPU, not on the code under test. Under load these failed at
// ~1030-1053ms, intermittently and in varying numbers, and a controlled run at
// the previous commit reproduced it with no product change at all. An explicit
// timeout removes a false gate signal without weakening any assertion.
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

vi.mock('../lib/authedFetch', () => ({ authedFetch: vi.fn() }));

const { DsarScreen } = await import('../screens/DsarScreen.jsx');
const { authedFetch } = await import('../lib/authedFetch');

// Phase 6.5 hardening (Batch 13) — the per-request status select had no
// accessible name at all; the "log new request" form's employee-name and
// requested-by fields had visual labels with no htmlFor/id association.
// Had no test coverage at all before this.
const noop = () => {};
const dsarRequests = [{ id: 'r1', employeeName: 'Sam Employee', requestedBy: '', receivedDate: '2026-08-01', dueDate: '2026-09-01', status: 'received', extended: false }];

const baseProps = {
  dsarRequests,
  createDsarRequest: noop,
  updateDsarRequest: noop,
  extendDsarRequest: noop,
  promptDialog: async () => null,
  cases: [],
  // E0.5A — the subject needs a CANONICAL employee record, because DSAR now fails
  // closed when identity cannot be established. An empty roster means
  // UNRECONCILED, which is exactly the state that must block.
  employeeRecords: [{ id: 'emp-sam', name: 'Sam Employee', jobTitle: 'Analyst', location: 'London' }],
  starterInstances: [],
  leaverInstances: [],
  wellbeingNotes: [],
  concernReferrals: [],
  allegations: [],
  caseSignals: [],
  hrReviewRequests: [],
  auditLog: [],
  setScreen: noop,
};

describe('DsarScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('names the per-request status select after the requesting employee', () => {
    render(<DsarScreen {...baseProps} />);
    expect(screen.getByLabelText("Status for Sam Employee's DSAR request")).toBeInTheDocument();
  });

  it('labels the log-new-request form fields', async () => {
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} dsarRequests={[]} />);
    await user.click(screen.getByRole('button', { name: '+ Log new request' }));
    // Phase E0.6 — the free-text "Employee name" input became a roster selector
    // labelled "Employee". The guarantee this test defends is unchanged: every
    // field on the form is reachable by its label.
    expect(screen.getByLabelText('Employee')).toBeInTheDocument();
    expect(screen.getByLabelText(/Requested by/)).toBeInTheDocument();
  });
});

// Phase 6.5 hardening (data-lifecycle review) — compiling now includes a
// real fetch to api/portal/dsar-lookup (signing_requests/portal accounts
// have zero client-facing RLS, so this data has no other way to reach
// the compiler), and surfaces a possible-name-collision warning.
describe('DsarScreen — compile fetches signing requests/portal access, and surfaces a name collision (Phase 6.5)', () => {
  it('calls dsar-lookup scoped to the org and employee, and shows the returned counts', async () => {
    authedFetch.mockResolvedValue({ ok: true, json: async () => ({
      signingRequests: [{ sign_id: 's1', employee_name: 'Sam Employee', document: 'x', status: 'signed' }],
      portalAccounts: [{ id: 'pa1', employee_name: 'Sam Employee', employee_email: 'sam@acme.com' }],
    }) });
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));

    await waitFor(() => expect(screen.getByText(/1 signing request/)).toBeInTheDocument(), { timeout: 5000 });
    expect(authedFetch).toHaveBeenCalledWith(expect.stringContaining('/api/portal/dsar-lookup?orgId=org-1&employeeName=Sam%20Employee'));
    expect(screen.getByText(/1 portal account/)).toBeInTheDocument();
  });

  it('still compiles the rest of the export if the dsar-lookup fetch fails', async () => {
    authedFetch.mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(() => expect(screen.getByText(/0 signing requests/)).toBeInTheDocument(), { timeout: 5000 });
  });

  it('BLOCKS the export when the subject\'s cases carry more than one distinct email', async () => {
    // STRENGTHENED BY PHASE E0, deliberately. This condition previously produced
    // an advisory banner rendered BELOW an always-enabled download button, so the
    // warning could be read after the package had already been taken. Ambiguous
    // identity now blocks the download: a DSAR must prefer "identity requires
    // reconciliation" over disclosing the wrong person's history.
    authedFetch.mockResolvedValue({ ok: true, json: async () => ({ signingRequests: [], portalAccounts: [] }) });
    const user = userEvent.setup();
    const cases = [
      { id: 'c1', employeeName: 'Sam Employee', employeeEmail: 'sam.london@acme.com', meetings: [] },
      { id: 'c2', employeeName: 'Sam Employee', employeeEmail: 'sam.manchester@acme.com', meetings: [] },
    ];
    render(<DsarScreen {...baseProps} cases={cases} orgId="org-1" />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(() => expect(screen.getByText(/Identity requires reconciliation/)).toBeInTheDocument(), { timeout: 5000 });
    // The collision is still surfaced — that guarantee is unchanged — but the
    // download is now genuinely unavailable rather than merely discouraged.
    expect(screen.queryByRole('button', { name: 'Download response package' })).not.toBeInTheDocument();
    expect(screen.getByText(/Download blocked/)).toBeInTheDocument();
  });

  it('does not show a collision warning for an ordinary, unambiguous subject', async () => {
    authedFetch.mockResolvedValue({ ok: true, json: async () => ({ signingRequests: [], portalAccounts: [] }) });
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(() => expect(screen.getByText(/0 signing requests/)).toBeInTheDocument(), { timeout: 5000 });
    expect(screen.queryByText(/Possible name collision/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Identity requires reconciliation/)).not.toBeInTheDocument();
    // An unambiguous subject can still download, so the gate has not become a
    // blanket refusal.
    expect(screen.getByRole('button', { name: 'Download response package' })).toBeInTheDocument();
  });
});

// Phase 6.5 hardening (data-lifecycle review) — "DSAR generated" and
// "data exported" are both privacy actions this review was asked to make
// auditable.
describe('DsarScreen — audits DSAR compile and download (Phase 6.5)', () => {
  it('audits a DSAR compile with the subject\'s name, no record content', async () => {
    authedFetch.mockResolvedValue({ ok: true, json: async () => ({ signingRequests: [], portalAccounts: [] }) });
    const audit = vi.fn();
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" audit={audit} />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(() => expect(audit).toHaveBeenCalledWith('DSAR data compiled', 'Sam Employee'), { timeout: 5000 });
  });

  it('audits a DSAR response download separately from the compile', async () => {
    authedFetch.mockResolvedValue({ ok: true, json: async () => ({ signingRequests: [], portalAccounts: [] }) });
    const audit = vi.fn();
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" audit={audit} />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download response package' })).toBeInTheDocument(), { timeout: 5000 });
    audit.mockClear();
    await user.click(screen.getByRole('button', { name: 'Download response package' }));
    expect(audit).toHaveBeenCalledWith('DSAR response downloaded', 'Sam Employee');
  });

  it('does not crash when audit is not supplied', async () => {
    authedFetch.mockResolvedValue({ ok: true, json: async () => ({ signingRequests: [], portalAccounts: [] }) });
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(() => expect(screen.getByText(/0 signing requests/)).toBeInTheDocument(), { timeout: 5000 });
  });
});

// ─────────────────────────────────────────────────────────────────────────
// WAVE D4.3 — the decision history has to reach the package THROUGH THE SCREEN.
//
// WHY THIS TEST EXISTS, SPECIFICALLY. D4.3's own unit tests call
// compileSubjectData directly, which proves the compiler and proves nothing
// about the wiring. The first cut of this wave added `caseDecisions` to
// DsarScreen's signature — but the compile call lives in RequestDetail, so the
// handler threw `ReferenceError: caseDecisions is not defined`, the async
// rejection went unhandled, React never re-rendered, and all seven tests above
// died of waitFor timeouts rather than of a readable failure. It looked exactly
// like machine-load flakiness and was very nearly dismissed as such.
//
// A timeout is a terrible failure message for a missing prop, so this asserts
// the end state that matters: the decision is IN the downloaded package.
// ─────────────────────────────────────────────────────────────────────────
describe('DsarScreen — carries the authoritative decision into the package (D4.3)', () => {
  const subjectCase = { id: 'c1', employeeName: 'Sam Employee', employeeEmail: 'sam@acme.com', caseType: 'Misconduct', meetings: [] };
  const decision = {
    id: 'd1', caseId: 'c1', decisionType: 'original', outcome: 'First written warning',
    decidedAt: '2026-06-01T00:00:00Z', warningDurationMonths: 12, warningExpiresAt: '2027-06-01',
    appealEffect: null, supersedesDecisionId: null,
    decidedBy: 'user-hr-secret', outcomeNotes: 'internal HR reasoning',
  };

  it('includes the decision, and still withholds the actor and the reasoning', async () => {
    authedFetch.mockResolvedValue({ ok: true, json: async () => ({ signingRequests: [], portalAccounts: [] }) });
    const blobs = [];
    const origCreate = URL.createObjectURL;
    const origRevoke = URL.revokeObjectURL;
    URL.createObjectURL = (blob) => { blobs.push(blob); return 'blob:captured'; };
    URL.revokeObjectURL = () => {};
    try {
      const user = userEvent.setup();
      render(<DsarScreen {...baseProps} orgId="org-1" cases={[subjectCase]} caseDecisions={[decision]} />);
      await user.click(screen.getByRole('button', { name: 'Compile data' }));
      await waitFor(() => expect(screen.getByRole('button', { name: 'Download response package' })).toBeInTheDocument(), { timeout: 5000 });
      await user.click(screen.getByRole('button', { name: 'Download response package' }));

      expect(blobs).toHaveLength(1);
      const pkg = JSON.parse(await blobs[0].text());
      expect(pkg.caseDecisions).toHaveLength(1);
      expect(pkg.caseDecisions[0].outcome).toBe('First written warning');
      expect(pkg.caseDecisions[0].warningExpiresAt).toBe('2027-06-01');
      // the internal actor and HR's reasoning are not the subject's to receive
      const asText = JSON.stringify(pkg.caseDecisions);
      expect(asText).not.toContain('user-hr-secret');
      expect(asText).not.toContain('internal HR reasoning');
      expect(pkg.caseDecisions[0].reasoningRequiresReview).toBe(true);
    } finally {
      URL.createObjectURL = origCreate;
      URL.revokeObjectURL = origRevoke;
    }
  });
});
