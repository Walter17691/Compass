import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CalendarScreen } from '../screens/CalendarScreen.jsx';

const cases = [{ id: 'c1', employeeName: 'Sarah Jones', caseType: 'misconduct' }];

describe('CalendarScreen — Schedule meeting (Phase 5, IP15)', () => {
  it('omits the Schedule meeting button when no handler is given', () => {
    render(<CalendarScreen cases={cases} setScreen={()=>{}} screens={{}} setActiveCaseId={()=>{}} setActiveCaseStage={()=>{}} />);
    expect(screen.queryByRole('button', { name: '+ Schedule meeting' })).not.toBeInTheDocument();
  });

  it('opens the scheduling modal and closes it on Cancel', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen cases={cases} setScreen={()=>{}} screens={{}} setActiveCaseId={()=>{}} setActiveCaseStage={()=>{}} onScheduleMeeting={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '+ Schedule meeting' }));
    expect(screen.getByRole('heading', { name: 'Schedule a meeting' })).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Cancel' }));
    expect(screen.queryByRole('heading', { name: 'Schedule a meeting' })).not.toBeInTheDocument();
  });

  it('lists every MEETING_TYPES entry and every case in the modal dropdowns', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen cases={cases} setScreen={()=>{}} screens={{}} setActiveCaseId={()=>{}} setActiveCaseStage={()=>{}} onScheduleMeeting={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '+ Schedule meeting' }));
    expect(screen.getByRole('option', { name: 'Grievance' })).toBeInTheDocument();
    expect(screen.getByRole('option', { name: 'Sarah Jones — misconduct' })).toBeInTheDocument();
  });

  it('keeps Schedule disabled until a date and start time are entered, then submits with those values', async () => {
    const user = userEvent.setup();
    const onScheduleMeeting = vi.fn().mockResolvedValue(true);
    render(<CalendarScreen cases={cases} setScreen={()=>{}} screens={{}} setActiveCaseId={()=>{}} setActiveCaseStage={()=>{}} onScheduleMeeting={onScheduleMeeting} />);
    await user.click(screen.getByRole('button', { name: '+ Schedule meeting' }));

    const scheduleButton = screen.getByRole('button', { name: 'Schedule' });
    expect(scheduleButton).toBeDisabled();

    const [dateInput, timeInput] = screen.getAllByDisplayValue('');
    await user.type(dateInput, '2026-08-20');
    await user.type(timeInput, '14:00');
    expect(scheduleButton).toBeEnabled();

    await user.click(scheduleButton);
    expect(onScheduleMeeting).toHaveBeenCalledWith(expect.objectContaining({ date: '2026-08-20', startTime: '14:00', durationMinutes: 60 }));
  });
});

describe('CalendarScreen — smart scheduling (Phase 5, IP16)', () => {
  const fillDateAndCase = async (user) => {
    await user.click(screen.getByRole('button', { name: '+ Schedule meeting' }));
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'c1');
    const [dateInput, timeInput] = screen.getAllByDisplayValue('');
    await user.type(dateInput, '2026-08-20');
    await user.type(timeInput, '14:00');
  };

  it('calls onCheckAvailability with the computed event times once a date and time are set', async () => {
    const user = userEvent.setup();
    const onCheckAvailability = vi.fn();
    render(<CalendarScreen cases={cases} setScreen={()=>{}} screens={{}} setActiveCaseId={()=>{}} setActiveCaseStage={()=>{}} onScheduleMeeting={vi.fn()} onCheckAvailability={onCheckAvailability} />);
    await fillDateAndCase(user);
    expect(onCheckAvailability).toHaveBeenCalledWith({ startISO: new Date('2026-08-20T14:00:00').toISOString(), endISO: new Date('2026-08-20T15:00:00').toISOString() });
  });

  it('shows a "no conflicts" note when the availability check comes back clean', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen cases={cases} setScreen={()=>{}} screens={{}} setActiveCaseId={()=>{}} setActiveCaseStage={()=>{}} onScheduleMeeting={vi.fn()} onCheckAvailability={()=>{}} availabilityCheck={{ checked: true, conflicts: [] }} />);
    await fillDateAndCase(user);
    expect(screen.getByText('No conflicts on your calendar')).toBeInTheDocument();
  });

  it('flags a calendar clash when the availability check finds one', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen cases={cases} setScreen={()=>{}} screens={{}} setActiveCaseId={()=>{}} setActiveCaseStage={()=>{}} onScheduleMeeting={vi.fn()} onCheckAvailability={()=>{}} availabilityCheck={{ checked: true, conflicts: [{ title: 'Team standup' }] }} />);
    await fillDateAndCase(user);
    expect(screen.getByText(/Clashes with 1 event on your calendar: Team standup/)).toBeInTheDocument();
  });

  it('suggests the case manager as chair by name and offers to add the employee/organiser as attendees', async () => {
    const user = userEvent.setup();
    const casesWithManager = [{ id: 'c1', employeeName: 'Sarah Jones', caseType: 'misconduct', manager: 'Jo Smith', email: 'sarah@company.com' }];
    render(<CalendarScreen cases={casesWithManager} setScreen={()=>{}} screens={{}} setActiveCaseId={()=>{}} setActiveCaseStage={()=>{}} onScheduleMeeting={vi.fn()} onCheckAvailability={()=>{}} organiserEmail="hr@company.com" />);
    await fillDateAndCase(user);
    expect(screen.getByText('Chair: Jo Smith — add their email above')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: '+ Add sarah@company.com, hr@company.com' })).toBeInTheDocument();
  });

  it('adds the suggested attendees to the field when the suggestion button is clicked', async () => {
    const user = userEvent.setup();
    const casesWithManager = [{ id: 'c1', employeeName: 'Sarah Jones', caseType: 'misconduct', email: 'sarah@company.com' }];
    render(<CalendarScreen cases={casesWithManager} setScreen={()=>{}} screens={{}} setActiveCaseId={()=>{}} setActiveCaseStage={()=>{}} onScheduleMeeting={vi.fn()} onCheckAvailability={()=>{}} />);
    await fillDateAndCase(user);
    await user.click(screen.getByRole('button', { name: '+ Add sarah@company.com' }));
    expect(screen.getByPlaceholderText('sarah@company.com, rep@union.org')).toHaveValue('sarah@company.com');
  });

  // Phase 6.5 hardening (P1, reliability review) — App.jsx's own
  // checkMeetingAvailability guards against a stale response overwriting
  // a newer one with a request-generation ref, but that guard only works
  // because clearAvailabilityCheck() (which bumps the ref) is called
  // BEFORE each new onCheckAvailability() fires — this is the piece of
  // that contract that lives here, in the modal's own effect.
  it('clears the previous availability result before firing a new check on every slot change', async () => {
    const user = userEvent.setup();
    const onCheckAvailability = vi.fn();
    const clearAvailabilityCheck = vi.fn();
    render(<CalendarScreen cases={cases} setScreen={()=>{}} screens={{}} setActiveCaseId={()=>{}} setActiveCaseStage={()=>{}} onScheduleMeeting={vi.fn()} onCheckAvailability={onCheckAvailability} clearAvailabilityCheck={clearAvailabilityCheck} />);
    await fillDateAndCase(user);
    expect(clearAvailabilityCheck).toHaveBeenCalled();
    expect(onCheckAvailability).toHaveBeenCalled();

    clearAvailabilityCheck.mockClear();
    onCheckAvailability.mockClear();
    // One atomic value-set (rather than user.type's keystroke-by-keystroke
    // events, which fire the effect once per intermediate, often-invalid
    // partial value) isolates exactly one slot change, matching what a
    // real "pick a different time" click produces.
    fireEvent.change(screen.getByLabelText('Start time'), { target: { value: '15:00' } });
    expect(clearAvailabilityCheck).toHaveBeenCalledTimes(1);
    expect(onCheckAvailability).toHaveBeenCalledTimes(1);
    // clearAvailabilityCheck must run first — it's what invalidates the
    // superseded request (by bumping App.jsx's request-generation ref)
    // before the new one is even issued.
    expect(clearAvailabilityCheck.mock.invocationCallOrder[0]).toBeLessThan(onCheckAvailability.mock.invocationCallOrder[0]);
  });

  it('flags a policy notice-period violation when the meeting is too soon', async () => {
    const user = userEvent.setup();
    const casesWithType = [{ id: 'c1', employeeName: 'Sarah Jones', caseType: 'misconduct' }];
    const policies = [{ category: 'disciplinary', clauses: [{ heading: 'Notice', text: "Employees are entitled to 48 hours' notice of a disciplinary hearing." }] }];
    render(<CalendarScreen cases={casesWithType} setScreen={()=>{}} screens={{}} setActiveCaseId={()=>{}} setActiveCaseStage={()=>{}} onScheduleMeeting={vi.fn()} onCheckAvailability={()=>{}} policies={policies} />);
    await user.click(screen.getByRole('button', { name: '+ Schedule meeting' }));
    await user.selectOptions(screen.getAllByRole('combobox')[0], 'c1');
    const soon = new Date(Date.now() + 3600000); // 1 hour from now — well short of 48
    const [dateInput, timeInput] = screen.getAllByDisplayValue('');
    await user.type(dateInput, soon.toISOString().slice(0, 10));
    await user.type(timeInput, `${String(soon.getHours()).padStart(2, '0')}:${String(soon.getMinutes()).padStart(2, '0')}`);
    expect(screen.getByText(/Policy requires 48 hours' notice/)).toBeInTheDocument();
  });
});

// Phase 6.5 hardening (Batch 9) — the month-grid day cell and the
// selected-day item row were both plain <div onClick>, keyboard-
// unreachable, with no accessible role at all. Both now render as a
// real <button> whenever they're genuinely interactive (a day with
// items, an item with a linked case), and a plain <div> when they're
// not (an empty day, an item with no case to open) — never a button
// that does nothing.
describe('CalendarScreen — day cell and item accessibility (Phase 6.5, Batch 9)', () => {
  it('renders a day with deadlines as a real button, opening the day detail on click', async () => {
    const user = userEvent.setup();
    const todayKey = new Date().toLocaleDateString('en-GB');
    const dueSoon = [{ employeeName: 'Sarah Jones', label: 'Investigation overrunning', category: 'investigation', deadlineDate: todayKey, caseId: 'c1', overdue: false, daysOverdue: 0 }];
    render(<CalendarScreen cases={cases} dueSoon={dueSoon} setScreen={()=>{}} screens={{}} setActiveCaseId={()=>{}} setActiveCaseStage={()=>{}} />);
    const dayButton = screen.getByText('Sarah Jones').closest('button');
    expect(dayButton).not.toBeNull();
    await user.click(dayButton);
    expect(screen.getByText(todayKey)).toBeInTheDocument();
  });

  it('renders an empty day (no deadlines) as a plain non-interactive cell, not a button', () => {
    render(<CalendarScreen cases={cases} dueSoon={[]} setScreen={()=>{}} screens={{}} setActiveCaseId={()=>{}} setActiveCaseStage={()=>{}} />);
    // With no dueSoon items at all, no day cell in the grid should be a button.
    const gridButtons = screen.queryAllByRole('button').filter(b => /^\d+$/.test(b.textContent));
    expect(gridButtons).toHaveLength(0);
  });

  it('renders a selected-day item with a linked case as a real button that opens the case', async () => {
    const user = userEvent.setup();
    const todayKey = new Date().toLocaleDateString('en-GB');
    const dueSoon = [{ employeeName: 'Sarah Jones', label: 'Investigation overrunning', category: 'investigation', deadlineDate: todayKey, caseId: 'c1', overdue: false, daysOverdue: 0 }];
    const setActiveCaseId = vi.fn();
    const setScreen = vi.fn();
    render(<CalendarScreen cases={cases} dueSoon={dueSoon} setScreen={setScreen} screens={{ CASE_VIEW: 'case-view' }} setActiveCaseId={setActiveCaseId} setActiveCaseStage={()=>{}} />);
    await user.click(screen.getByText('Sarah Jones').closest('button'));
    const itemButton = screen.getByText('Investigation overrunning').closest('button');
    expect(itemButton).not.toBeNull();
    await user.click(itemButton);
    expect(setActiveCaseId).toHaveBeenCalledWith('c1');
    expect(setScreen).toHaveBeenCalledWith('case-view');
  });

  it('renders a selected-day item with no linked case as a plain, non-clickable row', async () => {
    const user = userEvent.setup();
    const todayKey = new Date().toLocaleDateString('en-GB');
    const dueSoon = [{ employeeName: 'DSAR request', label: 'DSAR response due', category: 'dsar', deadlineDate: todayKey, caseId: null, overdue: false, daysOverdue: 0 }];
    render(<CalendarScreen cases={cases} dueSoon={dueSoon} setScreen={()=>{}} screens={{}} setActiveCaseId={()=>{}} setActiveCaseStage={()=>{}} />);
    await user.click(screen.getByText('DSAR request').closest('button'));
    expect(screen.getByText('DSAR response due').closest('button')).toBeNull();
  });
});

// Phase 6.5 hardening (Batch 13) — every field in the schedule-meeting
// modal had a visual <label> with no htmlFor/id association.
describe('CalendarScreen — schedule-meeting field labelling (Phase 6.5, Batch 13)', () => {
  it('associates every field in the modal with its own visible label', async () => {
    const user = userEvent.setup();
    render(<CalendarScreen cases={cases} setScreen={()=>{}} screens={{}} setActiveCaseId={()=>{}} setActiveCaseStage={()=>{}} onScheduleMeeting={vi.fn()} />);
    await user.click(screen.getByRole('button', { name: '+ Schedule meeting' }));
    expect(screen.getByLabelText('Case (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Meeting type')).toBeInTheDocument();
    expect(screen.getByLabelText('Date')).toBeInTheDocument();
    expect(screen.getByLabelText('Start time')).toBeInTheDocument();
    expect(screen.getByLabelText('Duration')).toBeInTheDocument();
    expect(screen.getByLabelText('Attendees (optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Description (optional)')).toBeInTheDocument();
  });
});
