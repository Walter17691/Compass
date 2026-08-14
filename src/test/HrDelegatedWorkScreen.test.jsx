import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { HrDelegatedWorkScreen } from '../screens/HrDelegatedWorkScreen.jsx';

// Manager Enablement (Phase 4, MP18, §14) — unlike ManagerPortalScreen
// (only reachable as a non-HR identity), this screen is HR-only and
// therefore reachable by the real E2E login — real rendering/interaction
// tests here alongside a full E2E flow (hr-delegated-work.spec.js),
// rather than in place of it.
const noop = () => {};
const cases = [{ id: 'c1', employeeName: 'Sam Employee', meetings: [{ type: 'Investigation', record: 'x' }] }];
const caseAccess = [{ id: 'a1', caseId: 'c1', userId: 'u1', role: 'investigator', targetCompletionDate: '2026-09-01' }];
const orgMembers = [{ id: 'm1', user_id: 'u1', name: 'Alex Investigator' }];
const caseTasks = [{ id: 't1', caseId: 'c1', name: 'Review the allegation(s)', status: 'done' }];

const baseProps = {
  cases, caseAccess, orgMembers, caseTasks, allegations: [],
  fmtDate: d => d, setScreen: noop, setActiveCaseId: noop, setActiveCaseStage: noop,
};

describe('HrDelegatedWorkScreen', () => {
  it('shows an empty state when nothing is delegated', () => {
    render(<HrDelegatedWorkScreen {...baseProps} caseAccess={[]} />);
    expect(screen.getByText('No investigations currently delegated.')).toBeInTheDocument();
  });

  it('lists a delegated case with its investigator and progress', () => {
    render(<HrDelegatedWorkScreen {...baseProps} />);
    expect(screen.getByText('Sam Employee')).toBeInTheDocument();
    expect(screen.getByText('Investigator: Alex Investigator')).toBeInTheDocument();
    expect(screen.getByText('Progress: 1 of 7 steps')).toBeInTheDocument();
    expect(screen.getByText('Meetings completed: 1')).toBeInTheDocument();
    expect(screen.getByText('Target completion: 2026-09-01')).toBeInTheDocument();
  });

  it('shows no attention badge or reasons when nothing is flagged', () => {
    render(<HrDelegatedWorkScreen {...baseProps} />);
    expect(screen.queryByText('HR attention suggested')).not.toBeInTheDocument();
  });

  it('shows the attention badge and reasons when flagged', () => {
    const flaggedCaseTasks = [
      { id: 't1', caseId: 'c1', name: 'Interview witnesses', status: 'done' },
      { id: 't2', caseId: 'c1', name: 'Interview the employee', status: 'done' },
    ];
    const allegations = [{ id: 'al1', caseId: 'c1', status: 'unreviewed' }];
    render(<HrDelegatedWorkScreen {...baseProps} caseTasks={flaggedCaseTasks} allegations={allegations} />);
    expect(screen.getByText('HR attention suggested')).toBeInTheDocument();
    expect(screen.getByText(/Interviews are complete but an allegation is still unreviewed/)).toBeInTheDocument();
  });

  it('shows "Not set" when no target completion date was given', () => {
    render(<HrDelegatedWorkScreen {...baseProps} caseAccess={[{ id: 'a1', caseId: 'c1', userId: 'u1', role: 'investigator' }]} />);
    expect(screen.getByText('Target completion: Not set')).toBeInTheDocument();
  });

  it('clicking a row navigates to the case', async () => {
    const user = userEvent.setup();
    const setActiveCaseId = vi.fn();
    render(<HrDelegatedWorkScreen {...baseProps} setActiveCaseId={setActiveCaseId} />);
    await user.click(screen.getByText('Sam Employee'));
    expect(setActiveCaseId).toHaveBeenCalledWith('c1');
  });
});
