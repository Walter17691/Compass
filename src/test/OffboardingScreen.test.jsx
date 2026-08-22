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
