import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DsarScreen } from '../screens/DsarScreen.jsx';

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
