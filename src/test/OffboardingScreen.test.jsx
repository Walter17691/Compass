import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OffboardingScreen } from '../screens/OffboardingScreen.jsx';

// Phase 6.5 hardening (Batch 13) — the reason-for-leaving select, the
// exit-interview date (DateInput-backed), and the exit-interview notes
// field all had visual labels with no htmlFor/id association. Had no
// test coverage at all before this.
const noop = () => {};
const newLeaverForm = { name: '', lastWorkingDay: '', reason: 'resignation' };

const baseProps = {
  activeLeaver: null,
  setActiveLeaver: noop,
  leaverView: 'new',
  setLeaverView: noop,
  newLeaverForm,
  setNewLeaverForm: noop,
  leaverTemplates: [{ id: 'tpl1', name: 'Standard Offboarding' }],
  createLeaverInstance: noop,
  leaverInstances: [],
  aiCustomiseLeaverChecklist: noop,
  leaverAiProcessing: false,
  toggleLeaverTask: noop,
  updateLeaverTaskNote: noop,
  addLeaverTask: noop,
  removeLeaverTask: noop,
  reassignLeaverTaskOwner: noop,
  updateLeaverExitInterview: noop,
  portalAccounts: [],
  revokePortalAccess: noop,
};

describe('OffboardingScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the reason-for-leaving select on the new-leaver form', () => {
    render(<OffboardingScreen {...baseProps} />);
    expect(screen.getByLabelText('Reason for leaving')).toBeInTheDocument();
  });

  it('labels the exit-interview date and notes fields for an active leaver', () => {
    const activeLeaver = { id: 'l1', name: 'Sam Employee', tasks: [], exitInterviewDate: '', exitInterviewNotes: '' };
    render(<OffboardingScreen {...baseProps} activeLeaver={activeLeaver} leaverInstances={[activeLeaver]} />);
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Notes')).toBeInTheDocument();
  });
});

// Phase 6.5 hardening (P0, data-integrity review) — exit-interview notes
// used to call updateLeaverExitInterview (a full leaver_instances upsert)
// on every keystroke via onChange. Now persists only on blur, via a
// local draft (DraftTextarea in OffboardingScreen.jsx).
describe('OffboardingScreen — debounced exit-interview notes (no per-keystroke writes)', () => {
  const activeLeaver = { id: 'l1', name: 'Sam Employee', tasks: [], exitInterviewDate: '', exitInterviewNotes: 'Initial notes' };

  it('does not call updateLeaverExitInterview while typing, and calls it exactly once on blur', async () => {
    const user = userEvent.setup();
    const updateLeaverExitInterview = vi.fn();
    render(<OffboardingScreen {...baseProps} activeLeaver={activeLeaver} leaverInstances={[activeLeaver]} updateLeaverExitInterview={updateLeaverExitInterview} />);

    const field = screen.getByLabelText('Notes');
    await user.click(field);
    await user.type(field, ' plus more');
    expect(updateLeaverExitInterview).not.toHaveBeenCalled();

    await user.tab(); // blur
    expect(updateLeaverExitInterview).toHaveBeenCalledTimes(1);
    expect(updateLeaverExitInterview).toHaveBeenCalledWith('l1', { exitInterviewNotes: 'Initial notes plus more' });
  });

  it('does not call updateLeaverExitInterview on blur if the value never actually changed', async () => {
    const user = userEvent.setup();
    const updateLeaverExitInterview = vi.fn();
    render(<OffboardingScreen {...baseProps} activeLeaver={activeLeaver} leaverInstances={[activeLeaver]} updateLeaverExitInterview={updateLeaverExitInterview} />);

    const field = screen.getByLabelText('Notes');
    await user.click(field);
    await user.tab(); // blur with no edits
    expect(updateLeaverExitInterview).not.toHaveBeenCalled();
  });
});

// Phase 6.5 hardening (closes Prompt 11 audit finding 2.9, MEDIUM) —
// matching a portal account by employee_name alone risked showing (or
// revoking) the wrong account when two employees share a name. Revoke now
// resolves the account by email first, and only revokes by the account's
// own id, never a guessed name match.
describe('OffboardingScreen — portal access match is disambiguated by email, not name alone (Prompt 11 audit, 2.9)', () => {
  const activeLeaver = { id: 'l1', name: 'Sam Employee', email: 'sam@acme.com', tasks: [] };

  it('revokes the account whose email matches the leaver, by its own id — not by name', async () => {
    const user = userEvent.setup();
    const revokePortalAccess = vi.fn();
    const portalAccounts = [
      { id: 'acc-imposter', employee_name: 'Sam Employee', employee_email: 'sam.other@acme.com', created_at: '2026-01-01' },
      { id: 'acc-real', employee_name: 'Sam Employee', employee_email: 'sam@acme.com', created_at: '2026-01-02' },
    ];
    render(<OffboardingScreen {...baseProps} activeLeaver={activeLeaver} leaverInstances={[activeLeaver]} portalAccounts={portalAccounts} revokePortalAccess={revokePortalAccess} />);

    await user.click(screen.getByText('Revoke portal access'));
    expect(revokePortalAccess).toHaveBeenCalledWith('acc-real', 'Sam Employee');
  });

  it('does not show the revoke button when two accounts share a name and neither email matches (ambiguous, no safe match)', () => {
    const portalAccounts = [
      { id: 'acc-1', employee_name: 'Sam Employee', employee_email: 'other1@acme.com', created_at: '2026-01-01' },
      { id: 'acc-2', employee_name: 'Sam Employee', employee_email: 'other2@acme.com', created_at: '2026-01-02' },
    ];
    render(<OffboardingScreen {...baseProps} activeLeaver={activeLeaver} leaverInstances={[activeLeaver]} portalAccounts={portalAccounts} />);
    expect(screen.queryByText('Revoke portal access')).not.toBeInTheDocument();
  });

  it('still resolves by name when it is the only match and neither side has an email', () => {
    const leaverNoEmail = { id: 'l1', name: 'Sam Employee', tasks: [] };
    const portalAccounts = [{ id: 'acc-1', employee_name: 'Sam Employee', employee_email: '', created_at: '2026-01-01' }];
    render(<OffboardingScreen {...baseProps} activeLeaver={leaverNoEmail} leaverInstances={[leaverNoEmail]} portalAccounts={portalAccounts} />);
    expect(screen.getByText('Revoke portal access')).toBeInTheDocument();
  });
});
