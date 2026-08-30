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
    render(<PeopleScreen cases={[]} setActivePerson={noop} setScreen={noop} setMeetingSetup={noop} />);
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
describe('PeopleScreen — "+ New meeting" (IA & User Journey pass, §37)', () => {
  it('prefills the employee and navigates straight to the meeting-setup screen, not plain Home', async () => {
    const user = userEvent.setup();
    const setMeetingSetup = vi.fn();
    const setScreen = vi.fn();
    const cases = [{ id: 'c1', employeeName: 'Sam Employee', meetings: [{ type: 'Investigation meeting', date: '01/01/2026' }] }];
    render(<PeopleScreen cases={cases} setActivePerson={noop} setScreen={setScreen} setMeetingSetup={setMeetingSetup} />);
    await user.click(screen.getByRole('button', { name: '+ New meeting' }));
    expect(setScreen).toHaveBeenCalledWith('home_meeting');
    const updater = setMeetingSetup.mock.calls[0][0];
    expect(updater({})).toEqual({ employee: 'Sam Employee' });
  });
});
