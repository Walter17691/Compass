import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { NotetakerView } from '../components/NotetakerView.jsx';

// Manager Enablement (Phase 4, MP2, §19) — Notetaker Mode's restricted
// view can't be exercised end-to-end the way most of this app's E2E
// suite works: the harness only has one fixed login (the HR test
// account), and this component specifically renders for a NON-HR user
// looking at a case they don't have full access to — there's no way to
// log in as that second identity in the current E2E setup. Component
// tests (same tool this codebase already uses for AddRoleForm) are the
// right level here instead: real rendering, real user interaction, no
// second login required.
const screens = { CASES: 'cases' };

const baseCase = {
  id: 'c1',
  employeeName: 'Sam Employee',
  meetings: [
    { id: 'm1', type: 'Investigation', date: '2026-08-10', participants: [{ name: 'Alex Manager', role: 'Chair' }, { name: 'Jordan Colleague' }] },
  ],
};

describe('NotetakerView', () => {
  it('shows an empty state when the case has no meetings yet', () => {
    render(<NotetakerView cs={{ ...baseCase, meetings: [] }} cases={[]} saveCases={() => {}} createCaseTask={() => {}} openQuestions={[]} currentUser={{ name: 'Robin Notetaker' }} fmtDate={d => d} setScreen={() => {}} screens={screens} />);
    expect(screen.getByText('No meeting has been set up on this case yet.')).toBeInTheDocument();
  });

  it('renders meeting details, participants, and questions to ask — never evidence or outcome data', () => {
    render(<NotetakerView cs={baseCase} cases={[baseCase]} saveCases={() => {}} createCaseTask={() => {}} openQuestions={[{ id: 'q1', title: 'Did you speak to Priya afterwards?' }]} currentUser={{ name: 'Robin Notetaker' }} fmtDate={d => d} setScreen={() => {}} screens={screens} />);

    expect(screen.getByText('Investigation')).toBeInTheDocument();
    expect(screen.getByText('Alex Manager · Chair')).toBeInTheDocument();
    expect(screen.getByText('Jordan Colleague')).toBeInTheDocument();
    expect(screen.getByText('Did you speak to Priya afterwards?')).toBeInTheDocument();
    // Nothing evidence/outcome-shaped ever gets passed to this component
    // in the first place (unlike the full workspace) — asserting the
    // props contract itself, not a rendering accident.
    expect(screen.queryByText(/outcome/i)).not.toBeInTheDocument();
  });

  it('lets the notetaker save a draft without submitting it', async () => {
    const user = userEvent.setup();
    const saveCases = vi.fn();
    render(<NotetakerView cs={baseCase} cases={[baseCase]} saveCases={saveCases} createCaseTask={() => {}} openQuestions={[]} currentUser={{ name: 'Robin Notetaker' }} fmtDate={d => d} setScreen={() => {}} screens={screens} />);

    await user.type(screen.getByPlaceholderText('Type your notes here...'), 'Draft notes');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(saveCases).toHaveBeenCalledTimes(1);
    const [savedCases] = saveCases.mock.calls[0];
    expect(savedCases[0].meetings[0].notetakerNotes).toBe('Draft notes');
    expect(savedCases[0].meetings[0].notetakerNotesStatus).toBeUndefined();
  });

  it('submitting notes marks them as awaiting review and stops showing the editable textarea', async () => {
    const user = userEvent.setup();
    const saveCases = vi.fn();
    render(<NotetakerView cs={baseCase} cases={[baseCase]} saveCases={saveCases} createCaseTask={() => {}} openQuestions={[]} currentUser={{ name: 'Robin Notetaker' }} fmtDate={d => d} setScreen={() => {}} screens={screens} />);

    await user.type(screen.getByPlaceholderText('Type your notes here...'), 'Final notes for review');
    await user.click(screen.getByRole('button', { name: 'Submit for review' }));

    const [savedCases] = saveCases.mock.calls[saveCases.mock.calls.length - 1];
    const savedMeeting = savedCases[0].meetings[0];
    expect(savedMeeting.notetakerNotesStatus).toBe('submitted');
    expect(savedMeeting.notetakerNotes).toBe('Final notes for review');
    expect(savedMeeting.notetakerNotesSubmittedBy).toBe('Robin Notetaker');
  });

  it('shows a read-only "awaiting review" state once notes are already submitted, not the textarea', () => {
    const submittedCase = { ...baseCase, meetings: [{ ...baseCase.meetings[0], notetakerNotes: 'Already submitted notes', notetakerNotesStatus: 'submitted' }] };
    render(<NotetakerView cs={submittedCase} cases={[submittedCase]} saveCases={() => {}} createCaseTask={() => {}} openQuestions={[]} currentUser={{ name: 'Robin Notetaker' }} fmtDate={d => d} setScreen={() => {}} screens={screens} />);

    expect(screen.getByText('Submitted — awaiting review')).toBeInTheDocument();
    expect(screen.getByText('Already submitted notes')).toBeInTheDocument();
    expect(screen.queryByPlaceholderText('Type your notes here...')).not.toBeInTheDocument();
  });

  it('shows a "reviewed" state once the case owner has marked the notes reviewed', () => {
    const reviewedCase = { ...baseCase, meetings: [{ ...baseCase.meetings[0], notetakerNotes: 'Reviewed notes', notetakerNotesStatus: 'reviewed' }] };
    render(<NotetakerView cs={reviewedCase} cases={[reviewedCase]} saveCases={() => {}} createCaseTask={() => {}} openQuestions={[]} currentUser={{ name: 'Robin Notetaker' }} fmtDate={d => d} setScreen={() => {}} screens={screens} />);

    expect(screen.getByText('Reviewed by the case owner')).toBeInTheDocument();
    expect(screen.getByText('Reviewed notes')).toBeInTheDocument();
  });

  it('lets the notetaker raise an action, reusing createCaseTask directly', async () => {
    const user = userEvent.setup();
    const createCaseTask = vi.fn();
    render(<NotetakerView cs={baseCase} cases={[baseCase]} saveCases={() => {}} createCaseTask={createCaseTask} openQuestions={[]} currentUser={{ name: 'Robin Notetaker' }} fmtDate={d => d} setScreen={() => {}} screens={screens} />);

    await user.type(screen.getByPlaceholderText('e.g. Chase the missing document'), 'Chase the CCTV footage');
    await user.click(screen.getByRole('button', { name: '+ Add' }));

    expect(createCaseTask).toHaveBeenCalledWith('c1', { name: 'Chase the CCTV footage', owner: 'Robin Notetaker' });
  });
});
