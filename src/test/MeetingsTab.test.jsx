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

describe('MeetingsTab — automatic meeting workspace (Phase 5, IP17)', () => {
  it('shows the "Scheduled — not yet held" workspace with agenda, attendees and prep questions for a recordless meeting', () => {
    const cs = caseWithMeeting({
      record: null, attendees: ['sarah@company.com'], agenda: '- Discuss the allegation\n- Confirm next steps',
      prepQuestions: [{ id: 'q1', text: 'What happened on 5 August?', essential: true }, { id: 'q2', text: 'Any prior warnings?', essential: false }],
    });
    render(<MeetingsTab {...baseProps} cs={cs} cases={[cs]} />);

    expect(screen.getByText('Scheduled — not yet held')).toBeInTheDocument();
    expect(screen.getByText('Attendees: sarah@company.com')).toBeInTheDocument();
    expect(screen.getByText(/Discuss the allegation/)).toBeInTheDocument();
    expect(screen.getByText(/What happened on 5 August\?/)).toBeInTheDocument();
    expect(screen.getByText(/Any prior warnings\?/)).toBeInTheDocument();
  });

  it('does not show the workspace card once the meeting has a real record', () => {
    const cs = caseWithMeeting({ record: 'Meeting notes here', agenda: '- Discuss the allegation', attendees: ['sarah@company.com'] });
    render(<MeetingsTab {...baseProps} cs={cs} cases={[cs]} />);
    expect(screen.queryByText('Scheduled — not yet held')).not.toBeInTheDocument();
  });

  it('does not show the workspace card for an ordinary meeting with no agenda/questions/attendees at all', () => {
    const cs = caseWithMeeting({});
    render(<MeetingsTab {...baseProps} cs={cs} cases={[cs]} />);
    expect(screen.queryByText('Scheduled — not yet held')).not.toBeInTheDocument();
  });
});

describe('MeetingsTab — meeting completion automation (Phase 5, IP18)', () => {
  const unresolvedSuggestions = [
    { kind: 'witness', description: 'Sarah Jones' },
    { kind: 'evidence', description: 'CCTV footage' },
    { kind: 'action', description: 'Send the screenshots', suggestedOwner: 'Jo', suggestedDueDate: '20/08/2026' },
  ];

  it('lists each unresolved suggestion with its own Accept/Dismiss actions, once the meeting has a real record', () => {
    const cs = caseWithMeeting({ record: 'Meeting notes here', unresolvedSuggestions });
    render(<MeetingsTab {...baseProps} cs={cs} cases={[cs]} onAcceptSavedSuggestion={()=>{}} onDismissSavedSuggestion={()=>{}} />);

    expect(screen.getByText('Not actioned during the meeting')).toBeInTheDocument();
    expect(screen.getByText('Potential witness: Sarah Jones')).toBeInTheDocument();
    expect(screen.getByText('Evidence mentioned: CCTV footage')).toBeInTheDocument();
    expect(screen.getByText('Action: Send the screenshots')).toBeInTheDocument();
    expect(screen.getAllByRole('button', { name: 'Accept' })).toHaveLength(3);
    expect(screen.getAllByRole('button', { name: 'Dismiss' })).toHaveLength(3);
  });

  it('calls onAcceptSavedSuggestion with the case, meeting id and the exact suggestion clicked', async () => {
    const user = userEvent.setup();
    const onAcceptSavedSuggestion = vi.fn();
    const cs = caseWithMeeting({ record: 'Meeting notes here', unresolvedSuggestions });
    render(<MeetingsTab {...baseProps} cs={cs} cases={[cs]} onAcceptSavedSuggestion={onAcceptSavedSuggestion} onDismissSavedSuggestion={()=>{}} />);

    await user.click(screen.getAllByRole('button', { name: 'Accept' })[0]);
    expect(onAcceptSavedSuggestion).toHaveBeenCalledWith(cs, 'm1', unresolvedSuggestions[0]);
  });

  it('calls onDismissSavedSuggestion with the case, meeting id and the exact suggestion clicked', async () => {
    const user = userEvent.setup();
    const onDismissSavedSuggestion = vi.fn();
    const cs = caseWithMeeting({ record: 'Meeting notes here', unresolvedSuggestions });
    render(<MeetingsTab {...baseProps} cs={cs} cases={[cs]} onAcceptSavedSuggestion={()=>{}} onDismissSavedSuggestion={onDismissSavedSuggestion} />);

    await user.click(screen.getAllByRole('button', { name: 'Dismiss' })[1]);
    expect(onDismissSavedSuggestion).toHaveBeenCalledWith(cs, 'm1', unresolvedSuggestions[1]);
  });

  it('does not show the unresolved-suggestions card once there are none left', () => {
    const cs = caseWithMeeting({ record: 'Meeting notes here', unresolvedSuggestions: [] });
    render(<MeetingsTab {...baseProps} cs={cs} cases={[cs]} onAcceptSavedSuggestion={()=>{}} onDismissSavedSuggestion={()=>{}} />);
    expect(screen.queryByText('Not actioned during the meeting')).not.toBeInTheDocument();
  });

  it('does not show the card for a scheduled-not-yet-held meeting even if unresolvedSuggestions is somehow present', () => {
    const cs = caseWithMeeting({ record: null, unresolvedSuggestions });
    render(<MeetingsTab {...baseProps} cs={cs} cases={[cs]} onAcceptSavedSuggestion={()=>{}} onDismissSavedSuggestion={()=>{}} />);
    expect(screen.queryByText('Not actioned during the meeting')).not.toBeInTheDocument();
  });
});

// Integrations & Workflow Automation (Phase 5, IP27, §21) — the widened
// signing_requests status vocabulary (sent/opened/signed/acknowledged/
// declined/expired), replacing the old pending/signed-only badge.
describe('MeetingsTab — e-signature status badges (Phase 5, IP27)', () => {
  it.each([
    ['sent', 'Sent — awaiting signature'],
    ['opened', 'Opened — awaiting signature'],
    ['signed', 'Signed'],
    ['acknowledged', 'Acknowledged'],
    ['declined', 'Declined'],
    ['expired', 'Expired'],
  ])('shows the right badge text for signStatus "%s"', (signStatus, expectedText) => {
    const cs = caseWithMeeting({ signStatus, signId: 'sign-1' });
    render(<MeetingsTab {...baseProps} cs={cs} cases={[cs]} />);
    expect(screen.getByText(expectedText)).toBeInTheDocument();
  });

  it('shows no badge at all when the meeting was never sent for signature', () => {
    const cs = caseWithMeeting({});
    render(<MeetingsTab {...baseProps} cs={cs} cases={[cs]} />);
    expect(screen.queryByText(/awaiting signature/)).not.toBeInTheDocument();
    expect(screen.queryByText('Signed')).not.toBeInTheDocument();
  });

  it('shows the manual "Mark signed" override for every non-terminal status, never for a terminal one', () => {
    ['sent', 'opened'].forEach(signStatus => {
      const cs = caseWithMeeting({ signStatus, signId: 'sign-1' });
      const { unmount } = render(<MeetingsTab {...baseProps} cs={cs} cases={[cs]} />);
      expect(screen.getByRole('button', { name: 'Mark signed' })).toBeInTheDocument();
      unmount();
    });
    ['signed', 'acknowledged', 'declined', 'expired'].forEach(signStatus => {
      const cs = caseWithMeeting({ signStatus, signId: 'sign-1' });
      const { unmount } = render(<MeetingsTab {...baseProps} cs={cs} cases={[cs]} />);
      expect(screen.queryByRole('button', { name: 'Mark signed' })).not.toBeInTheDocument();
      unmount();
    });
  });

  it('clicking "Mark signed" saves the meeting with signStatus "signed"', async () => {
    const user = userEvent.setup();
    const saveCases = vi.fn();
    const cs = caseWithMeeting({ signStatus: 'sent', signId: 'sign-1' });
    render(<MeetingsTab {...baseProps} cs={cs} cases={[cs]} saveCases={saveCases} />);
    await user.click(screen.getByRole('button', { name: 'Mark signed' }));
    const [savedCases] = saveCases.mock.calls[0];
    expect(savedCases[0].meetings[0].signStatus).toBe('signed');
  });
});
