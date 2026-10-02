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
    // E2 — PrepScreen is a creation route, so it establishes canonical identity
    // rather than collecting a name. With no employee selected it asks
    // canonically; with one selected it shows who, and does not ask again.
    expect(screen.getByLabelText(/Who is this meeting with\?/)).toBeInTheDocument();
    expect(screen.getByLabelText('Your name')).toBeInTheDocument();
    // Wave C2 — "Background" is now "Why this meeting is happening" (ad-hoc) or
    // "Anything else to add" (case-grounded): the field asks what it is for.
    expect(screen.getByRole('heading', { name: /Why this meeting is happening/ })).toBeInTheDocument();
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

  it('starting the meeting stays available regardless of aiError', () => {
    // Wave C2 — this used to be a small underlined "Skip prep and start meeting
    // now" link, which framed preparation as compulsory and the real lifecycle
    // action as an escape hatch. Start is now the primary action and is never
    // gated on Compass having produced anything.
    render(<PrepScreen {...baseProps} aiError="Compass AI is temporarily unavailable." />);
    expect(screen.getByRole('button', { name: 'Start meeting' })).toBeEnabled();
    expect(screen.queryByText('Skip prep and start meeting now')).not.toBeInTheDocument();
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

  it('K. Background becomes optional "Anything else to add" for a case-grounded meeting', () => {
    renderAppeal();
    expect(screen.getByRole('heading', { name: /Anything else to add/ })).toBeInTheDocument();
    expect(screen.getByText(/^Optional\./)).toBeInTheDocument();
    expect(screen.getByText(/add only what is not recorded there/)).toBeInTheDocument();
    expect(screen.queryByText(/Previous warnings, allegations, relevant history/)).not.toBeInTheDocument();
  });

  it('K. it explains that case facts are drawn automatically', () => {
    renderAppeal();
    expect(screen.getByText(/already drawn from the case record/)).toBeInTheDocument();
  });
});

describe('PrepScreen — non-appeal and ad-hoc preparation is unchanged (S, T)', () => {
  it('T. an ad-hoc meeting keeps the free-text background field and its original guidance', () => {
    render(<PrepScreen {...baseProps} meetingType={{ id: 'disciplinary', label: 'Disciplinary' }} caseInfo={{ employee: 'A', manager: 'B', date: '', context: '' }} />);
    expect(screen.getByText(/Previous warnings, allegations, relevant history/)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: /Why this meeting is happening/ })).toBeInTheDocument();
    expect(screen.queryByText(/already drawn from the case record/)).not.toBeInTheDocument();
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
    expect(screen.getByRole('heading', { name: /Anything else to add/ })).toBeInTheDocument();
  });
});
