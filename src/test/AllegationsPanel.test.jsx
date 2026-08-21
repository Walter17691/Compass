import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AllegationsPanel } from '../components/AllegationsPanel.jsx';

// Manager Enablement (Phase 4, MP3, §18) — the P10 decision workspace
// (investigator finding / outstanding uncertainty / decision reasoning /
// employee response / status) is now gated to canDecide (HR or the
// assigned Hearing Manager) rather than editable by anyone who reaches
// the full case view. Component-level: this needs a specific
// canDecide=false case that a real E2E login can't easily produce
// (same single-test-account constraint as MP2), and it's really about
// this component's own rendering contract, not an app-wide flow.
const noop = () => {};
const cs = { id: 'c1', caseType: 'misconduct', employeeName: 'Sam Employee', evidence: [] };
const allegation = {
  id: 'a1',
  caseId: 'c1',
  title: 'Unauthorised absence',
  status: 'substantiated',
  investigatorFinding: 'Swipe-card records confirm the absence.',
  outstandingUncertainty: 'None recorded.',
  decisionReasoning: 'Evidence was clear and undisputed.',
  employeeResponse: 'The employee said they overslept.',
};

const baseProps = {
  cs,
  allegations: [allegation],
  allAllegations: [allegation],
  createAllegation: noop,
  patchAllegation: noop,
  changeAllegationStatus: noop,
  deleteAllegation: noop,
  saveCases: noop,
  cases: [cs],
  confirmDialog: noop,
  showToast: noop,
  setReviewOutput: noop,
  setScreen: noop,
  screens: {},
  orgMembers: [],
  fmtDate: d => d,
  generateAppealReview: noop,
  recordAppealOutcome: noop,
  policies: [],
  generateConsistencyReview: noop,
};

// The allegation title also appears in EvidenceMatrixPanel's own table
// (rendered above the allegations list itself) — the list's own row,
// the one that's actually clickable to expand, is the last match.
async function expandAllegation(title = 'Unauthorised absence') {
  const user = (await import('@testing-library/user-event')).default.setup();
  const matches = screen.getAllByText(title);
  await user.click(matches[matches.length - 1]);
}

describe('AllegationsPanel — decision-field gating (canDecide)', () => {
  it('defaults to editable (canDecide=true) when the prop is omitted, matching pre-MP3 behaviour', async () => {
    render(<AllegationsPanel {...baseProps} />);
    await expandAllegation();
    expect(screen.getByPlaceholderText('What did the investigation itself conclude, before any hearing?')).toBeInTheDocument();
  });

  it('renders every decision field as editable inputs when canDecide is true', async () => {
    render(<AllegationsPanel {...baseProps} canDecide={true} />);
    await expandAllegation();
    expect(screen.getByPlaceholderText('What did the investigation itself conclude, before any hearing?')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Anything still unclear or unresolved about this allegation?')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('Summarise what the evidence showed and why it supports this finding.')).toBeInTheDocument();
    expect(screen.getByPlaceholderText('What did the employee say about this allegation?')).toBeInTheDocument();
    expect(screen.getByRole('combobox')).toBeInTheDocument();
  });

  it('renders every decision field as read-only text, with the recorded content still visible, when canDecide is false', async () => {
    render(<AllegationsPanel {...baseProps} canDecide={false} />);
    await expandAllegation();

    expect(screen.queryByPlaceholderText('What did the investigation itself conclude, before any hearing?')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Anything still unclear or unresolved about this allegation?')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Summarise what the evidence showed and why it supports this finding.')).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('What did the employee say about this allegation?')).not.toBeInTheDocument();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();

    // EvidenceMatrixPanel's own table (rendered above the allegations
    // list) separately echoes this same finding/reasoning/response text,
    // so these are existence checks (at least one match), not uniqueness
    // checks — the point is the read-only text renders at all, not
    // exactly once across the whole page.
    expect(screen.getAllByText('Swipe-card records confirm the absence.').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('None recorded.').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Evidence was clear and undisputed.').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('The employee said they overslept.').length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText('Substantiated').length).toBeGreaterThanOrEqual(1);
  });

  it('shows "Not yet recorded" placeholders for empty fields when canDecide is false, not blank boxes', async () => {
    const emptyAllegation = { id: 'a2', caseId: 'c1', title: 'A second allegation', status: 'unreviewed' };
    render(<AllegationsPanel {...baseProps} allegations={[emptyAllegation]} allAllegations={[emptyAllegation]} canDecide={false} />);
    await expandAllegation('A second allegation');

    // "Not yet recorded" is the shared placeholder for two separate empty
    // fields (investigator's finding, employee response) — both present,
    // not a single unique match.
    expect(screen.getAllByText('Not yet recorded').length).toBeGreaterThanOrEqual(2);
    expect(screen.getAllByText('None recorded').length).toBeGreaterThanOrEqual(1);
  });
});

// Phase 6.5 hardening (P0, Cluster 7) — these fields used to call
// patchAllegation (a full-row upsert) on every keystroke. Now they persist
// only on blur, via a local draft (DraftTextarea in AllegationsPanel.jsx).
describe('AllegationsPanel — debounced persistence (no per-keystroke writes)', () => {
  it('does not call patchAllegation while typing, and calls it exactly once on blur', async () => {
    const user = userEvent.setup();
    const patchAllegation = vi.fn();
    render(<AllegationsPanel {...baseProps} patchAllegation={patchAllegation} />);
    await expandAllegation();

    const field = screen.getByPlaceholderText('What did the investigation itself conclude, before any hearing?');
    await user.click(field);
    await user.type(field, ' plus more detail');
    expect(patchAllegation).not.toHaveBeenCalled();

    await user.tab(); // blur
    expect(patchAllegation).toHaveBeenCalledTimes(1);
    expect(patchAllegation).toHaveBeenCalledWith('a1', { investigatorFinding: 'Swipe-card records confirm the absence. plus more detail' });
  });

  it('does not call patchAllegation on blur if the value never actually changed', async () => {
    const user = userEvent.setup();
    const patchAllegation = vi.fn();
    render(<AllegationsPanel {...baseProps} patchAllegation={patchAllegation} />);
    await expandAllegation();

    const field = screen.getByPlaceholderText('What did the investigation itself conclude, before any hearing?');
    await user.click(field);
    await user.tab(); // blur with no edits
    expect(patchAllegation).not.toHaveBeenCalled();
  });

  it('commits an in-progress, unblurred edit when the field is removed from the DOM (row collapsed)', async () => {
    const user = userEvent.setup();
    const patchAllegation = vi.fn();
    render(<AllegationsPanel {...baseProps} patchAllegation={patchAllegation} />);
    await expandAllegation();

    const field = screen.getByPlaceholderText('What did the investigation itself conclude, before any hearing?');
    await user.click(field);
    await user.type(field, '!');
    expect(patchAllegation).not.toHaveBeenCalled();

    // Collapse the row (re-click the header) without blurring first —
    // this unmounts the field directly.
    await expandAllegation();
    expect(patchAllegation).toHaveBeenCalledTimes(1);
    expect(patchAllegation).toHaveBeenCalledWith('a1', { investigatorFinding: 'Swipe-card records confirm the absence.!' });
  });
});
