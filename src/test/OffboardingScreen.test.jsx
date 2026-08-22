import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
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
