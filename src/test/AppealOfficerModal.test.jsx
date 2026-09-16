import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AppealOfficerModal } from '../screens/AppealOfficerModal.jsx';

// Independent appeal officer workflow (2026-09-16) — this modal is
// deliberately separate from HandoffModal.jsx (see its own header
// comment): it never touches cases.stage, and every state transition
// below is what appoint_appeal_manager()/revoke_appeal_manager() (the
// authoritative RPCs, supabase/appeal_officer_workflow_2026-09-16.sql)
// actually decided, surfaced honestly — this test suite verifies the UI
// reacts correctly to each of those outcomes, not that the authorization
// itself is correct (that's the SQL migration's own empirically-verified
// rolled-back-transaction battery).
const cs = { id: 'c1', employeeName: 'Sam Employee' };
const orgMembers = [
  { id: 'm1', user_id: 'u1', name: 'Priya Shah', job_title: 'HR Manager' },
  { id: 'm2', user_id: 'u2', name: 'Tom Norton', job_title: 'Ops Lead' },
];

const baseProps = {
  cases: [cs],
  activeCaseId: 'c1',
  orgMembers,
  caseAccess: [],
  onClose: () => {},
  appointAppealManager: async () => ({ ok: true }),
  revokeAppealManager: async () => {},
  confirmDialog: async () => true,
  showToast: () => {},
};

describe('AppealOfficerModal — appointment (no current officer)', () => {
  it('shows a candidate select and an Appoint button, not a Revoke/Replace pair', async () => {
    render(<AppealOfficerModal {...baseProps} />);
    expect(screen.getByLabelText('Select appeal officer')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Appoint' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Revoke' })).not.toBeInTheDocument();
  });

  it('appoints the selected candidate and closes on success', async () => {
    const user = userEvent.setup();
    const appointAppealManager = vi.fn().mockResolvedValue({ ok: true });
    const onClose = vi.fn();
    render(<AppealOfficerModal {...baseProps} appointAppealManager={appointAppealManager} onClose={onClose} />);
    await user.selectOptions(screen.getByLabelText('Select appeal officer'), 'u2');
    await user.click(screen.getByRole('button', { name: 'Appoint' }));
    expect(appointAppealManager).toHaveBeenCalledWith('c1', 'u2', null);
    expect(onClose).toHaveBeenCalled();
  });

  it('shows an independence-conflict warning and required-reason flow when the RPC reports one', async () => {
    const user = userEvent.setup();
    const appointAppealManager = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'INDEPENDENCE_CONFLICT: Tom Norton was involved in the original decision on this case.' });
    const onClose = vi.fn();
    render(<AppealOfficerModal {...baseProps} appointAppealManager={appointAppealManager} onClose={onClose} />);
    await user.selectOptions(screen.getByLabelText('Select appeal officer'), 'u2');
    await user.click(screen.getByRole('button', { name: 'Appoint' }));

    expect(screen.getByText(/Tom Norton was involved in the original decision/)).toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();

    const proceedButton = screen.getByRole('button', { name: 'Proceed exceptionally' });
    expect(proceedButton).toBeDisabled();

    await user.type(screen.getByLabelText('Reason for proceeding anyway'), 'No independent alternative available in this small team');
    expect(proceedButton).not.toBeDisabled();

    appointAppealManager.mockResolvedValueOnce({ ok: true });
    await user.click(proceedButton);
    expect(appointAppealManager).toHaveBeenLastCalledWith('c1', 'u2', 'No independent alternative available in this small team');
  });

  it('lets HR back out of the conflict warning via "Choose someone else" without appointing anyone', async () => {
    const user = userEvent.setup();
    const appointAppealManager = vi.fn()
      .mockResolvedValueOnce({ ok: false, error: 'INDEPENDENCE_CONFLICT: Tom Norton was involved in the original decision on this case.' });
    render(<AppealOfficerModal {...baseProps} appointAppealManager={appointAppealManager} />);
    await user.selectOptions(screen.getByLabelText('Select appeal officer'), 'u2');
    await user.click(screen.getByRole('button', { name: 'Appoint' }));
    await user.click(screen.getByRole('button', { name: 'Choose someone else' }));
    expect(screen.getByLabelText('Select appeal officer')).toBeInTheDocument();
    expect(appointAppealManager).toHaveBeenCalledTimes(1);
  });

  it('shows an error toast, without closing, for any other appointment failure', async () => {
    const user = userEvent.setup();
    const appointAppealManager = vi.fn().mockResolvedValue({ ok: false, error: 'Only an HR Director or HR Manager can appoint, replace, or revoke an appeal officer' });
    const showToast = vi.fn();
    const onClose = vi.fn();
    render(<AppealOfficerModal {...baseProps} appointAppealManager={appointAppealManager} showToast={showToast} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Appoint' }));
    expect(showToast).toHaveBeenCalledWith(expect.stringContaining('Only an HR Director or HR Manager'), 'error');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('AppealOfficerModal — an officer is already appointed', () => {
  const caseAccess = [{ id: 'ca1', caseId: 'c1', userId: 'u1', role: 'appeal_manager' }];

  it('shows the current officer and Revoke/Replace, not the candidate select', () => {
    render(<AppealOfficerModal {...baseProps} caseAccess={caseAccess} />);
    expect(screen.getByText('Priya Shah')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Revoke' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Replace' })).toBeInTheDocument();
    expect(screen.queryByLabelText('Select appeal officer')).not.toBeInTheDocument();
  });

  it('switches to the candidate select on Replace', async () => {
    const user = userEvent.setup();
    render(<AppealOfficerModal {...baseProps} caseAccess={caseAccess} />);
    await user.click(screen.getByRole('button', { name: 'Replace' }));
    expect(screen.getByLabelText('Select appeal officer')).toBeInTheDocument();
  });

  it('confirms, then revokes and closes, on Revoke', async () => {
    const user = userEvent.setup();
    const confirmDialog = vi.fn().mockResolvedValue(true);
    const revokeAppealManager = vi.fn().mockResolvedValue(undefined);
    const onClose = vi.fn();
    render(<AppealOfficerModal {...baseProps} caseAccess={caseAccess} confirmDialog={confirmDialog} revokeAppealManager={revokeAppealManager} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(confirmDialog).toHaveBeenCalledWith(expect.objectContaining({ danger: true }));
    expect(revokeAppealManager).toHaveBeenCalledWith('c1');
    expect(onClose).toHaveBeenCalled();
  });

  it('does nothing if the revoke confirmation is declined', async () => {
    const user = userEvent.setup();
    const confirmDialog = vi.fn().mockResolvedValue(false);
    const revokeAppealManager = vi.fn();
    const onClose = vi.fn();
    render(<AppealOfficerModal {...baseProps} caseAccess={caseAccess} confirmDialog={confirmDialog} revokeAppealManager={revokeAppealManager} onClose={onClose} />);
    await user.click(screen.getByRole('button', { name: 'Revoke' }));
    expect(revokeAppealManager).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
  });
});
