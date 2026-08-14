import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MeetingsTab } from '../components/caseTabs/MeetingsTab.jsx';

// Manager Enablement (Phase 4, MP2, §19) — the HR-facing half of
// Notetaker Mode's "submitted to the case owner for review" loop.
// Component-level, same reasoning as NotetakerView.test.jsx: this is the
// side the fixed E2E test account (always HR) COULD reach, but getting a
// meeting into notetakerNotesStatus:"submitted" in the first place can
// only happen through NotetakerView, which HR is specifically excluded
// from — so there's no way to reach this state through a real login flow
// in the current single-account harness either. Seeding the state
// directly as a prop tests the same rendering/interaction contract
// without needing that second identity.
const screens = { HOME: 'home', REVIEW: 'review' };

const noop = () => {};
const baseProps = {
  cases: [],
  saveCases: noop,
  activeCaseStage: null,
  setActiveCaseStage: noop,
  setMeetingSetup: noop,
  setCaseInfo: noop,
  getEmployeeRecord: () => null,
  orgMembers: [],
  setScreen: noop,
  screens,
  setReviewOutput: noop,
  setMeetingType: noop,
  meetingTypes: [],
  fmtDate: d => d,
  attemptSubmitInvestigation: noop,
  concludingInvestigation: false,
  setShowHandoffModal: noop,
  setLetterOutput: noop,
};

function caseWithMeeting(meetingOverrides) {
  const meeting = { id: 'm1', type: 'Investigation', date: '2026-08-10', savedBy: 'Robin Notetaker', ...meetingOverrides };
  return { id: 'c1', caseType: 'misconduct', meetings: [meeting] };
}

describe('MeetingsTab — notetaker notes review', () => {
  it('shows no notetaker badge for an ordinary meeting', () => {
    const cs = caseWithMeeting({});
    render(<MeetingsTab {...baseProps} cs={cs} cases={[cs]} />);
    expect(screen.queryByText('Notetaker notes awaiting review')).not.toBeInTheDocument();
    expect(screen.queryByText('Notetaker notes reviewed')).not.toBeInTheDocument();
  });

  it('shows the submitted notes and a Mark reviewed action when awaiting review', () => {
    const cs = caseWithMeeting({ notetakerNotesStatus: 'submitted', notetakerNotes: 'Employee explained the absence.', notetakerNotesSubmittedBy: 'Robin Notetaker' });
    render(<MeetingsTab {...baseProps} cs={cs} cases={[cs]} />);

    expect(screen.getByText('Notetaker notes awaiting review')).toBeInTheDocument();
    expect(screen.getByText('Employee explained the absence.')).toBeInTheDocument();
    expect(screen.getByText(/Submitted by Robin Notetaker/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Mark reviewed' })).toBeInTheDocument();
  });

  it('clicking Mark reviewed saves the meeting with status "reviewed"', async () => {
    const user = userEvent.setup();
    const saveCases = vi.fn();
    const cs = caseWithMeeting({ notetakerNotesStatus: 'submitted', notetakerNotes: 'Employee explained the absence.' });
    render(<MeetingsTab {...baseProps} cs={cs} cases={[cs]} saveCases={saveCases} />);

    await user.click(screen.getByRole('button', { name: 'Mark reviewed' }));

    expect(saveCases).toHaveBeenCalledTimes(1);
    const [savedCases] = saveCases.mock.calls[0];
    expect(savedCases[0].meetings[0].notetakerNotesStatus).toBe('reviewed');
  });

  it('shows a reviewed badge, not the review card, once notes are marked reviewed', () => {
    const cs = caseWithMeeting({ notetakerNotesStatus: 'reviewed', notetakerNotes: 'Employee explained the absence.' });
    render(<MeetingsTab {...baseProps} cs={cs} cases={[cs]} />);

    expect(screen.getByText('Notetaker notes reviewed')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Mark reviewed' })).not.toBeInTheDocument();
  });
});
