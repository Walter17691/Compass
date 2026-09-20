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

// Appeal Prep Pack P1 (Human UAT, 2026-09-20) — chair and meeting type are
// already authoritative when preparation arrives from the appeal workflow, but
// PrepScreen rendered both as free-form inputs, so a user could silently name
// a different chair or turn an appeal into a disciplinary. The inherited
// hearing time/method were carried in state but never shown, and "Background"
// implied the user had to retype case history Compass already holds.
describe('PrepScreen — structured appeal preparation (P1)', () => {
  const APPEAL_TYPE = { id: 'appeal-disciplinary', label: 'Disciplinary Appeal — ACAS S5' };
  const appealCaseInfo = {
    employee: 'UAT - Fresh Golden Path 2', manager: 'UAT - HR Manager',
    date: '2026-09-22', time: '10:00', locationOrMethod: 'Microsoft Teams',
    context: '', preparedCaseId: '3e99e129', appealChairLocked: true,
  };
  const renderAppeal = (overrides = {}) =>
    render(<PrepScreen {...baseProps} meetingType={APPEAL_TYPE} caseInfo={{ ...appealCaseInfo, ...overrides }} />);

  it('H. the chair is read-only and cannot be overridden from this screen', () => {
    renderAppeal();
    expect(screen.getByText('Appeal officer / Chair')).toBeInTheDocument();
    const chair = document.getElementById('prep-manager-name');
    expect(chair.tagName).not.toBe('INPUT');
    expect(chair.textContent).toContain('UAT - HR Manager');
    expect(screen.queryByPlaceholderText('Chair / HR manager name')).not.toBeInTheDocument();
  });

  it('I. the meeting type is locked and cannot be changed to another kind of hearing', () => {
    renderAppeal();
    const type = document.getElementById('prep-meeting-type');
    expect(type.tagName).not.toBe('SELECT');
    expect(type.textContent).toContain('Disciplinary Appeal');
    expect(screen.queryByRole('option', { name: 'Disciplinary' })).not.toBeInTheDocument();
  });

  it('J. the inherited hearing date, time and method are displayed', () => {
    renderAppeal();
    expect(screen.getByText('Hearing')).toBeInTheDocument();
    expect(screen.getByText('22 September 2026 · 10:00 · Microsoft Teams')).toBeInTheDocument();
  });

  it('J. the hearing summary is omitted when no logistics were inherited', () => {
    renderAppeal({ date: '', time: '', locationOrMethod: '' });
    expect(screen.queryByText('Hearing')).not.toBeInTheDocument();
  });

  it('K. Background becomes optional Additional context for a case-grounded meeting', () => {
    renderAppeal();
    expect(screen.getByText(/Additional context/)).toBeInTheDocument();
    expect(screen.getByText(/\(optional\)/)).toBeInTheDocument();
    expect(screen.getByPlaceholderText("Add anything relevant that isn't already recorded in Compass.")).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Previous warnings, allegations, relevant history/)).not.toBeInTheDocument();
  });

  it('K. it explains that case facts are drawn automatically', () => {
    renderAppeal();
    expect(screen.getByText(/drawn from the case record automatically/)).toBeInTheDocument();
  });
});

describe('PrepScreen — non-appeal and ad-hoc preparation is unchanged (S, T)', () => {
  it('T. an ad-hoc meeting keeps the free-text Background field and its original placeholder', () => {
    render(<PrepScreen {...baseProps} meetingType={{ id: 'disciplinary', label: 'Disciplinary' }} caseInfo={{ employee: 'A', manager: 'B', date: '', context: '' }} />);
    expect(screen.getByPlaceholderText(/Previous warnings, allegations, relevant history/)).toBeInTheDocument();
    expect(screen.getByText(/Background/)).toBeInTheDocument();
    expect(screen.queryByText(/drawn from the case record automatically/)).not.toBeInTheDocument();
  });

  it('S. an ad-hoc meeting keeps an editable chair and meeting type', () => {
    render(<PrepScreen {...baseProps} meetingType={{ id: 'disciplinary', label: 'Disciplinary' }} caseInfo={{ employee: 'A', manager: 'B', date: '', context: '' }} />);
    expect(document.getElementById('prep-manager-name').tagName).toBe('INPUT');
    expect(document.getElementById('prep-meeting-type').tagName).toBe('SELECT');
    expect(screen.getByText('Your name')).toBeInTheDocument();
  });

  it('a case-grounded NON-appeal meeting keeps an editable chair and type but gets the new context copy', () => {
    render(<PrepScreen {...baseProps} meetingType={{ id: 'disciplinary', label: 'Disciplinary' }}
      caseInfo={{ employee: 'A', manager: 'B', date: '', context: '', preparedCaseId: 'c1' }} />);
    expect(document.getElementById('prep-manager-name').tagName).toBe('INPUT');
    expect(document.getElementById('prep-meeting-type').tagName).toBe('SELECT');
    expect(screen.getByText(/Additional context/)).toBeInTheDocument();
  });
});
