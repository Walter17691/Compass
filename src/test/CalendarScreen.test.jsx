import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
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
