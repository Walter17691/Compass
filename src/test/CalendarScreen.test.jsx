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
