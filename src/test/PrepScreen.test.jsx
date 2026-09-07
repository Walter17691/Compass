import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { PrepScreen } from '../screens/PrepScreen.jsx';

// Phase 6.5 hardening (Batch 13) — every field on this screen had a
// visual <label> with no htmlFor/id association; the per-question-row
// text input and allegation/evidence link selects had no label at all.
// Had no test coverage at all before this.
const noop = () => {};
const caseInfo = { employee: '', manager: '', date: '', context: '' };

const baseProps = {
  meetingType: null,
  setMeetingType: noop,
  caseInfo,
  setCaseInfo: noop,
  handlePrepare: noop,
  aiProcessing: false,
  setScreen: noop,
  bgDoc: null,
  setBgDoc: noop,
  prepNotes: '',
  prepQuestions: [],
  linkedCaseAllegations: [],
  linkedCaseEvidence: [],
  onAddPrepQuestion: noop,
  onUpdatePrepQuestionText: noop,
  onRemovePrepQuestion: noop,
  onMovePrepQuestion: noop,
  onTogglePrepQuestionEssential: noop,
  onLinkPrepQuestionToAllegation: noop,
  onLinkPrepQuestionToEvidence: noop,
  aiError: '',
};

describe('PrepScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the meeting setup fields', () => {
    render(<PrepScreen {...baseProps} />);
    expect(screen.getByLabelText(/Meeting type/)).toBeInTheDocument();
    expect(screen.getByLabelText(/Employee name/)).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
    expect(screen.getByLabelText(/Background/)).toBeInTheDocument();
  });

  it('labels each prep question row\'s text field and its allegation/evidence link selects', () => {
    const prepQuestions = [{ id: 'q1', text: 'What happened on the day?', category: 'general' }];
    const linkedCaseAllegations = [{ id: 'a1', title: 'Unauthorised absence' }];
    const linkedCaseEvidence = [{ id: 'e1', name: 'CCTV footage.mp4' }];
    render(<PrepScreen {...baseProps} prepNotes="Some prep notes" prepQuestions={prepQuestions} linkedCaseAllegations={linkedCaseAllegations} linkedCaseEvidence={linkedCaseEvidence} />);
    expect(screen.getByLabelText('Question 1 text')).toBeInTheDocument();
    expect(screen.getByLabelText('Link question 1 to allegation')).toBeInTheDocument();
    expect(screen.getByLabelText('Link question 1 to evidence')).toBeInTheDocument();
  });
});

// Release 1.0 UAT remediation (Defect #4) — handlePrepare's catch block
// already set aiError safely (never raw provider text), but this screen
// never rendered it, so a prep-pack generation failure looked exactly
// like nothing happening at all. "Skip prep and start meeting now" is
// the manual/skip path and must remain available regardless.
describe('PrepScreen — surfaces a generation failure (Defect #4)', () => {
  it('shows a clear error message when aiError is set and generation is not in progress', () => {
    render(<PrepScreen {...baseProps} aiError="Compass AI is temporarily unavailable. You can retry, or skip prep and start the meeting now." />);
    expect(screen.getByText(/Compass AI is temporarily unavailable/)).toBeInTheDocument();
  });

  it('does not show an error while generation is still in progress', () => {
    render(<PrepScreen {...baseProps} aiError="Compass AI is temporarily unavailable." aiProcessing={true} />);
    expect(screen.queryByText(/Compass AI is temporarily unavailable/)).not.toBeInTheDocument();
  });

  it('the manual skip path stays available regardless of aiError', () => {
    render(<PrepScreen {...baseProps} aiError="Compass AI is temporarily unavailable." />);
    expect(screen.getByText('Skip prep and start meeting now')).toBeInTheDocument();
  });
});
