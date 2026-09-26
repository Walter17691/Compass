import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PeopleScreen } from '../screens/PeopleScreen.jsx';

// Phase 6.5 hardening (Batch 13) — the search field relied on
// placeholder text alone, with no other accessible name. Had no test
// coverage at all before this.
const noop = () => {};

describe('PeopleScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the search field', () => {
    render(<PeopleScreen cases={[]} employeeRecords={[]} setActiveEmployeeId={noop} setScreen={noop} setMeetingSetup={noop} />);
    expect(screen.getByLabelText('Search people')).toBeInTheDocument();
  });
});

// IA & User Journey pass, §37 audit finding — a row's own "+ New meeting"
// used to prefill meetingSetup then navigate to plain Home, where Home's
// "Start meeting" button calls freshMeetingSetup() and wipes that prefill
// the instant it's clicked — a real dead end, not just an extra click.
// PersonViewScreen's own "+ New meeting" already goes straight to the
// meeting-setup screen with the prefill intact; this locks in the same
// behaviour here.
describe('PeopleScreen — identity is the roster, not names in cases (Phase E0.7)', () => {
  it('lists an employee with NO cases, who used to be invisible', () => {
    // 396 real employees had never had a case and so never appeared at all.
    render(<PeopleScreen cases={[]} employeeRecords={[{ id: 'u1', name: 'Never Had A Case' }]}
      setActiveEmployeeId={noop} setScreen={noop} setMeetingSetup={noop} />);
    expect(screen.getByText('Never Had A Case')).toBeInTheDocument();
  });

  it('does NOT invent a person from a name that appears only on a case', () => {
    // A typo in one case used to create a whole new "person".
    render(<PeopleScreen cases={[{ id: 'c1', employeeName: 'SmA Employee' }]} employeeRecords={[]}
      setActiveEmployeeId={noop} setScreen={noop} setMeetingSetup={noop} />);
    expect(screen.queryByText('SmA Employee')).not.toBeInTheDocument();
  });

  it('keeps two same-named employees as TWO rows, and navigates by uuid', async () => {
    const user = userEvent.setup();
    const setActiveEmployeeId = vi.fn();
    render(<PeopleScreen cases={[]}
      employeeRecords={[
        { id: 'u1', name: 'John Smith', location: 'Manchester' },
        { id: 'u2', name: 'John Smith', location: 'Leeds' },
      ]}
      setActiveEmployeeId={setActiveEmployeeId} setScreen={noop} setMeetingSetup={noop} />);
    // Two rows, both labelled, each flagged as sharing the name.
    expect(screen.getAllByText('John Smith')).toHaveLength(2);
    expect(screen.getAllByText(/another employee shares this name/)).toHaveLength(2);
    // Navigation carries a UUID, so the two are distinguishable.
    await user.click(screen.getAllByText('John Smith')[0].closest('button'));
    expect(setActiveEmployeeId).toHaveBeenCalledWith('u1');
    expect(setActiveEmployeeId).not.toHaveBeenCalledWith('John Smith');
  });

  it('counts only canonically attributed cases', () => {
    // A legacy name-only case must not inflate the roster row's count.
    render(<PeopleScreen
      cases={[
        { id: 'c1', employeeId: 'u1', employeeName: 'John Smith', stage: 'investigation' },
        { id: 'c2', employeeId: null, employeeName: 'John Smith', stage: 'investigation' },
      ]}
      employeeRecords={[{ id: 'u1', name: 'John Smith' }]}
      setActiveEmployeeId={noop} setScreen={noop} setMeetingSetup={noop} />);
    expect(screen.getByText(/· 1 case \(1 open\)/)).toBeInTheDocument();
  });
});

describe('PeopleScreen — "+ New meeting" (IA & User Journey pass, §37)', () => {
  it('prefills the employee and navigates straight to the meeting-setup screen, not plain Home', async () => {
    const user = userEvent.setup();
    const setMeetingSetup = vi.fn();
    const setScreen = vi.fn();
    // Phase E0.7 — People is the employee_records ROSTER now, so the roster is
    // what makes a row exist. Previously a row appeared because a case mentioned
    // a name, which is why a typo invented a person and two same-named
    // colleagues collapsed into one.
    const employeeRecords = [{ id: 'uuid-sam', name: 'Sam Employee', jobTitle: 'Analyst' }];
    const cases = [{ id: 'c1', employeeId: 'uuid-sam', employeeName: 'Sam Employee', meetings: [{ type: 'Investigation meeting', date: '01/01/2026' }] }];
    render(<PeopleScreen cases={cases} employeeRecords={employeeRecords} setActiveEmployeeId={noop} setScreen={setScreen} setMeetingSetup={setMeetingSetup} />);
    await user.click(screen.getByRole('button', { name: '+ New meeting' }));
    expect(setScreen).toHaveBeenCalledWith('home_meeting');
    const updater = setMeetingSetup.mock.calls[0][0];
    expect(updater({})).toEqual({ employee: 'Sam Employee' });
  });
});
