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
  employeeRecords: [],
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
    expect(screen.getByLabelText('Employee name')).toBeInTheDocument();
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

    await waitFor(() => expect(screen.getByText(/1 signing request/)).toBeInTheDocument());
    expect(authedFetch).toHaveBeenCalledWith(expect.stringContaining('/api/portal/dsar-lookup?orgId=org-1&employeeName=Sam%20Employee'));
    expect(screen.getByText(/1 portal account/)).toBeInTheDocument();
  });

  it('still compiles the rest of the export if the dsar-lookup fetch fails', async () => {
    authedFetch.mockResolvedValue({ ok: false });
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(() => expect(screen.getByText(/0 signing requests/)).toBeInTheDocument());
  });

  it('shows a possible-name-collision warning when the subject\'s cases carry more than one distinct email', async () => {
    authedFetch.mockResolvedValue({ ok: true, json: async () => ({ signingRequests: [], portalAccounts: [] }) });
    const user = userEvent.setup();
    const cases = [
      { id: 'c1', employeeName: 'Sam Employee', employeeEmail: 'sam.london@acme.com', meetings: [] },
      { id: 'c2', employeeName: 'Sam Employee', employeeEmail: 'sam.manchester@acme.com', meetings: [] },
    ];
    render(<DsarScreen {...baseProps} cases={cases} orgId="org-1" />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(() => expect(screen.getByText(/Possible name collision/)).toBeInTheDocument());
  });

  it('does not show a collision warning for an ordinary, unambiguous subject', async () => {
    authedFetch.mockResolvedValue({ ok: true, json: async () => ({ signingRequests: [], portalAccounts: [] }) });
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(() => expect(screen.getByText(/0 signing requests/)).toBeInTheDocument());
    expect(screen.queryByText(/Possible name collision/)).not.toBeInTheDocument();
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
    await waitFor(() => expect(audit).toHaveBeenCalledWith('DSAR data compiled', 'Sam Employee'));
  });

  it('audits a DSAR response download separately from the compile', async () => {
    authedFetch.mockResolvedValue({ ok: true, json: async () => ({ signingRequests: [], portalAccounts: [] }) });
    const audit = vi.fn();
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" audit={audit} />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(() => expect(screen.getByRole('button', { name: 'Download response package' })).toBeInTheDocument());
    audit.mockClear();
    await user.click(screen.getByRole('button', { name: 'Download response package' }));
    expect(audit).toHaveBeenCalledWith('DSAR response downloaded', 'Sam Employee');
  });

  it('does not crash when audit is not supplied', async () => {
    authedFetch.mockResolvedValue({ ok: true, json: async () => ({ signingRequests: [], portalAccounts: [] }) });
    const user = userEvent.setup();
    render(<DsarScreen {...baseProps} orgId="org-1" />);
    await user.click(screen.getByRole('button', { name: 'Compile data' }));
    await waitFor(() => expect(screen.getByText(/0 signing requests/)).toBeInTheDocument());
  });
});
