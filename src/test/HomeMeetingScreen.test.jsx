import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeMeetingScreen } from '../screens/HomeMeetingScreen.jsx';

const renderScreen = (meetingSetupOverrides = {}, propOverrides = {}) => {
  const base = { type: '', employee: 'Sam Employee', manager: '', chairJobTitle: '', notetaker: '', employeeJobTitle: '', representative: '', representativeRole: 'colleague', participants: [], date: '2026-08-01' };
  const ms = { ...base, ...meetingSetupOverrides };
  return render(<HomeMeetingScreen meetingSetup={ms} setMeetingSetup={()=>{}} orgMembers={[]} getEmployeeRecord={()=>null} cases={[]} getCaseStage={()=>"open"} activeCaseId={null} setActiveCaseId={()=>{}} needsInvitation={()=>false} setCaseInfo={()=>{}} setMeetingType={()=>{}} setPendingLetterType={()=>{}} setShowLetterModal={()=>{}} setScreen={()=>{}} setTranscript={()=>{}} setPrepNotes={()=>{}} setPrepQuestions={()=>{}} setMeetingEvidenceSuggestions={()=>{}} setMeetingActionSuggestions={()=>{}} setReviewOutput={()=>{}} setReviewOutputOriginal={()=>{}} setMeetingSummary={()=>{}} setLetterOutput={()=>{}} setRiskScore={()=>{}} setLiveChatHistory={()=>{}} setParticipants={()=>{}} setDismissedCoachingTipKeys={()=>{}} fmtDate={d=>d} startSession={()=>{}} {...propOverrides} />);
};

// Phase 6.5 hardening (Batch 13) — every text/select field on this form
// had a visual <label> with no htmlFor/id association (or, for the two
// compound fields sharing one label with a secondary select, no
// accessible name on the select at all). Had no test coverage at all
// before this.
const noop = () => {};
const meetingSetup = { type: '', employee: '', manager: '', chairJobTitle: '', notetaker: '', employeeJobTitle: '', representative: '', representativeRole: 'colleague', participants: [], date: '2026-08-01' };

describe('HomeMeetingScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('associates every standalone text/select field with its real, visible label', () => {
    render(<HomeMeetingScreen meetingSetup={meetingSetup} setMeetingSetup={noop} orgMembers={[]} getEmployeeRecord={noop} cases={[]} getCaseStage={()=>"open"} activeCaseId={null} setActiveCaseId={noop} needsInvitation={()=>false} setCaseInfo={noop} setMeetingType={noop} setPendingLetterType={noop} setShowLetterModal={noop} setScreen={noop} setTranscript={noop} setPrepNotes={noop} setPrepQuestions={noop} setMeetingEvidenceSuggestions={noop} setMeetingActionSuggestions={noop} setReviewOutput={noop} setReviewOutputOriginal={noop} setMeetingSummary={noop} setLetterOutput={noop} setRiskScore={noop} setLiveChatHistory={noop} setParticipants={noop} setDismissedCoachingTipKeys={noop} fmtDate={d=>d} startSession={noop} />);
    expect(screen.getByLabelText('Your name (chair)')).toBeInTheDocument();
    expect(screen.getByLabelText(/Chair job title/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Notetaker/)).toBeInTheDocument();
    expect(screen.getByLabelText('Employee name')).toBeInTheDocument();
    expect(screen.getByLabelText(/Employee job title/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Link to case/)).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
  });

  it('labels the representative-role select even though it shares a visible label with the name field', () => {
    const withInvitation = { ...meetingSetup, type: 'disciplinary' };
    render(<HomeMeetingScreen meetingSetup={withInvitation} setMeetingSetup={noop} orgMembers={[]} getEmployeeRecord={noop} cases={[]} getCaseStage={()=>"open"} activeCaseId={null} setActiveCaseId={noop} needsInvitation={()=>true} setCaseInfo={noop} setMeetingType={noop} setPendingLetterType={noop} setShowLetterModal={noop} setScreen={noop} setTranscript={noop} setPrepNotes={noop} setPrepQuestions={noop} setMeetingEvidenceSuggestions={noop} setMeetingActionSuggestions={noop} setReviewOutput={noop} setReviewOutputOriginal={noop} setMeetingSummary={noop} setLetterOutput={noop} setRiskScore={noop} setLiveChatHistory={noop} setParticipants={noop} setDismissedCoachingTipKeys={noop} fmtDate={d=>d} startSession={noop} />);
    expect(screen.getByLabelText(/Representative \/ companion/)).toBeInTheDocument();
    expect(screen.getByLabelText("Representative's relationship")).toBeInTheDocument();
  });
});

// Appeal Hearing Control Remediation (2026-09-18) — the structured appeal-
// hearing entry (meetingSetup.appealChairLocked, only ever set by
// CaseViewScreen.jsx's start_appeal_meeting handler) locks the chair
// identity and the meeting type to read-only displays, and surfaces
// cases.appeal_text compactly. Every other meeting type must keep the
// original editable fields exactly as before.
describe('HomeMeetingScreen — structured appeal-hearing lock (Appeal Hearing Control Remediation)', () => {
  it('renders the appeal officer as a read-only "Appeal officer / Chair" display, not an editable input, when appealChairLocked is true', () => {
    renderScreen({ appealChairLocked: true, manager: 'Priya Shah', chairJobTitle: 'Operations Director', type: 'appeal-disciplinary' });
    expect(screen.getByText('Appeal officer / Chair')).toBeInTheDocument();
    expect(screen.getByText(/Priya Shah/)).toBeInTheDocument();
    expect(screen.getByText(/Operations Director/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Your name (chair)')).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/Chair job title/)).not.toBeInTheDocument();
  });

  it('points the user to reassigning the appeal officer rather than typing a different name', () => {
    renderScreen({ appealChairLocked: true, manager: 'Priya Shah', type: 'appeal-disciplinary' });
    expect(screen.getByText(/reassign the appeal officer/i)).toBeInTheDocument();
  });

  it('locks the meeting type to a read-only display and hides the full selectable catalogue', () => {
    renderScreen({ appealChairLocked: true, manager: 'Priya Shah', type: 'appeal-disciplinary' });
    expect(screen.getAllByText('Disciplinary Appeal').length).toBeGreaterThan(0);
    // The generic catalogue's other entries must not be selectable/present.
    expect(screen.queryByText('Investigation')).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Grievance$/ })).not.toBeInTheDocument();
  });

  it('surfaces cases.appeal_text read-only as "Appeal grounds" when present', () => {
    renderScreen({ appealChairLocked: true, manager: 'Priya Shah', type: 'appeal-disciplinary', appealGrounds: 'I believe the sanction was disproportionate.' });
    expect(screen.getByText('Appeal grounds')).toBeInTheDocument();
    expect(screen.getByText('I believe the sanction was disproportionate.')).toBeInTheDocument();
    // Read-only: no textarea/input carrying this value.
    expect(screen.queryByRole('textbox', { name: /Appeal grounds/i })).not.toBeInTheDocument();
  });

  it('renders no appeal-grounds card when none is passed', () => {
    renderScreen({ appealChairLocked: true, manager: 'Priya Shah', type: 'appeal-disciplinary', appealGrounds: '' });
    expect(screen.queryByText('Appeal grounds')).not.toBeInTheDocument();
  });

  it('an ordinary (non-locked) meeting keeps the editable chair fields and the full meeting-type catalogue unchanged', () => {
    renderScreen({ appealChairLocked: false, manager: '', type: 'disciplinary' });
    expect(screen.getByLabelText('Your name (chair)')).toBeInTheDocument();
    expect(screen.getByLabelText(/Chair job title/)).toBeInTheDocument();
    expect(screen.getByText('Investigation')).toBeInTheDocument();
    expect(screen.getByText('Grievance')).toBeInTheDocument();
    expect(screen.queryByText('Appeal officer / Chair')).not.toBeInTheDocument();
  });
});
