import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ManagerPortalScreen } from '../screens/ManagerPortalScreen.jsx';

// Manager Enablement (Phase 4, MP16, §1) — "My People Actions" only ever
// renders for a non-HR identity (AppSidebar.jsx's own !isHR gate on the
// nav link) — same restricted-view rationale as MP2/3/7/8/9/12's own
// component tests, the shared single-account E2E harness (always HR)
// can't reach this screen through any real navigation path.
const noop = () => {};
const currentUser = { user_id: 'u1', name: 'Alex Manager' };

const cases = [
  { id: 'c1', employeeName: 'Sam Employee', manager: 'Alex Manager', meetings: [] },
  { id: 'c2', employeeName: 'Jo Other', meetings: [] },
];
const caseAccess = [{ caseId: 'c1', userId: 'u1', role: 'investigator' }];

const baseProps = {
  cases, caseAccess,
  caseTasks: [], hrReviewRequests: [], concernReferrals: [], dueSoon: [],
  currentUser, fmtDate: d => d, setScreen: noop, setActiveCaseId: noop, setActiveCaseStage: noop,
};

describe('ManagerPortalScreen', () => {
  it('lists only cases I have case_access on, with my role(s)', () => {
    render(<ManagerPortalScreen {...baseProps} />);
    expect(screen.getByText('Cases assigned to me (1)')).toBeInTheDocument();
    // "Sam Employee" also appears under "Meetings to conduct" (this case's
    // own empty meetings list also qualifies as needing one) — at least
    // one match is the proof this section rendered the case at all.
    expect(screen.getAllByText('Sam Employee').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText(/Investigator/)).toBeInTheDocument();
    expect(screen.queryByText('Jo Other')).not.toBeInTheDocument();
  });

  it('shows an empty state for a section with nothing in it', () => {
    render(<ManagerPortalScreen {...baseProps} />);
    expect(screen.getByText('No open tasks assigned to you.')).toBeInTheDocument();
  });

  it('lists a task assigned to me by name', () => {
    const caseTasks = [{ id: 't1', caseId: 'c1', name: 'Chase the CCTV footage', owner: 'Alex Manager', status: 'open', dueDate: '2026-08-20' }];
    render(<ManagerPortalScreen {...baseProps} caseTasks={caseTasks} />);
    expect(screen.getByText('Tasks due (1)')).toBeInTheDocument();
    expect(screen.getByText('Chase the CCTV footage')).toBeInTheDocument();
  });

  it('lists a notetaker submission on a case I own', () => {
    const casesWithSubmission = [{ id: 'c1', employeeName: 'Sam Employee', manager: 'Alex Manager', meetings: [{ id: 'm1', type: 'Investigation', notetakerNotesStatus: 'submitted' }] }];
    render(<ManagerPortalScreen {...baseProps} cases={casesWithSubmission} />);
    expect(screen.getByText('Documents to review (1)')).toBeInTheDocument();
  });

  it('shows a resolved HR response with its status label', () => {
    const hrReviewRequests = [{ id: 'r1', case_id: 'c1', case_employee_name: 'Sam Employee', requested_by: 'u1', status: 'returned', comments: 'Please interview the witness', reviewed_at: '2026-08-14T00:00:00Z' }];
    render(<ManagerPortalScreen {...baseProps} hrReviewRequests={hrReviewRequests} />);
    expect(screen.getByText('Requests from HR (1)')).toBeInTheDocument();
    expect(screen.getByText(/Returned for further investigation/)).toBeInTheDocument();
  });

  it('lists a concern I submitted with its status badge', () => {
    const concernReferrals = [{ id: 'ref1', employeeName: 'Sam Employee', submittedBy: 'u1', status: 'new', createdAt: '2026-08-14T00:00:00Z' }];
    render(<ManagerPortalScreen {...baseProps} concernReferrals={concernReferrals} />);
    expect(screen.getByText('Concerns I\'ve submitted (1)')).toBeInTheDocument();
    expect(screen.getByText('New')).toBeInTheDocument();
  });

  it('lists an upcoming deadline scoped to my own cases only, grouped by how soon it is due', () => {
    const dueSoon = [
      { employeeName: 'Sam Employee', label: 'Appeal window', caseId: 'c1', overdue: false, daysLeft: 5, deadlineDate: '20/08/2026' },
      { employeeName: 'Jo Other', label: 'Unrelated', caseId: 'c2', overdue: false, daysLeft: 5, deadlineDate: '21/08/2026' },
    ];
    render(<ManagerPortalScreen {...baseProps} dueSoon={dueSoon} />);
    expect(screen.getByText('Upcoming deadlines (1)')).toBeInTheDocument();
    expect(screen.getByText('Later')).toBeInTheDocument();
    expect(screen.getByText(/Sam Employee — Appeal window/)).toBeInTheDocument();
    expect(screen.queryByText(/Jo Other/)).not.toBeInTheDocument();
  });

  it('groups an overdue deadline under its own heading, ahead of due-today/tomorrow/later', () => {
    const dueSoon = [{ employeeName: 'Sam Employee', label: 'Signature chase', caseId: 'c1', overdue: true, daysOverdue: 3, daysLeft: 0 }];
    render(<ManagerPortalScreen {...baseProps} dueSoon={dueSoon} />);
    expect(screen.getByText('Overdue')).toBeInTheDocument();
    expect(screen.getByText('3 days overdue')).toBeInTheDocument();
  });

  it('clicking a case row navigates to it', async () => {
    const user = userEvent.setup();
    const setActiveCaseId = vi.fn();
    const setScreen = vi.fn();
    render(<ManagerPortalScreen {...baseProps} setActiveCaseId={setActiveCaseId} setScreen={setScreen} />);
    // "Sam Employee" also appears under "Meetings to conduct" (this case's
    // own empty meetings list also qualifies as needing one) — the first
    // match is the "Cases assigned to me" row this test targets.
    await user.click(screen.getAllByText('Sam Employee')[0]);
    expect(setActiveCaseId).toHaveBeenCalledWith('c1');
    expect(setScreen).toHaveBeenCalled();
  });

  // Phase 6.5 hardening (Batch 9) — clickable rows were plain
  // <div onClick>, keyboard-unreachable with no accessible role. A
  // clickable row is now a real <button>; a display-only row (no
  // onClick given, e.g. concerns submitted) stays a plain <div>.
  it('renders a clickable row as a real, keyboard-reachable button', () => {
    render(<ManagerPortalScreen {...baseProps} />);
    expect(screen.getAllByText('Sam Employee')[0].closest('button')).not.toBeNull();
  });

  it('renders a display-only row (concerns submitted, no click target) as a plain non-button element', () => {
    const concernReferrals = [{ id: 'ref1', employeeName: 'Sam Employee', submittedBy: 'u1', status: 'new', createdAt: '2026-08-14T00:00:00Z' }];
    render(<ManagerPortalScreen {...baseProps} concernReferrals={concernReferrals} />);
    expect(screen.getByText('New').closest('button')).toBeNull();
  });
});
