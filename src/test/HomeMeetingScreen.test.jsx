import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { HomeMeetingScreen } from '../screens/HomeMeetingScreen.jsx';

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
