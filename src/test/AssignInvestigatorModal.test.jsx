import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AssignInvestigatorModal } from '../screens/AssignInvestigatorModal.jsx';

// Manager Enablement (Phase 4, MP7, §7) — this modal replaces the old
// plain <select> that called assignInvestigator with nothing but a member
// id. Real rendering, real user interaction (same tool as every other
// modal/component test in this suite) — HR is a reachable identity via
// the real E2E login too, but this modal's own defaulting/toggling logic
// is exactly the kind of thing better proven directly than re-derived
// from a slow, real-AI-adjacent E2E flow.
const cs = { id: 'c1', employeeName: 'Sam Employee' };
const allegations = [
  { id: 'a1', caseId: 'c1', title: 'Unauthorised absence' },
  { id: 'a2', caseId: 'c1', title: 'Falsified expenses' },
];
const orgMembers = [
  { id: 'm1', user_id: 'u1', name: 'Alex Manager', job_title: 'Ops Lead' },
  { id: 'm2', user_id: 'u2', name: 'Jordan Investigator' },
];

const baseProps = {
  cases: [cs],
  activeCaseId: 'c1',
  allegations,
  orgMembers,
  setShowAssignInvestigatorModal: () => {},
};

describe('AssignInvestigatorModal', () => {
  it('defaults every allegation to checked, matching the old implicit "sees everything" behaviour', () => {
    render(<AssignInvestigatorModal {...baseProps} assignInvestigator={() => {}} />);
    expect(screen.getByRole('checkbox', { name: /Unauthorised absence/ })).toBeChecked();
    expect(screen.getByRole('checkbox', { name: /Falsified expenses/ })).toBeChecked();
  });

  it('skips the allegations section entirely when the case has none', () => {
    render(<AssignInvestigatorModal {...baseProps} allegations={[]} assignInvestigator={() => {}} />);
    expect(screen.queryByText('Which allegations should they investigate?')).not.toBeInTheDocument();
  });

  it('assigning with an unchecked allegation narrows the scope passed to assignInvestigator', async () => {
    const user = userEvent.setup();
    const assignInvestigator = vi.fn();
    render(<AssignInvestigatorModal {...baseProps} assignInvestigator={assignInvestigator} />);

    await user.click(screen.getByRole('checkbox', { name: /Falsified expenses/ }));
    await user.type(screen.getByPlaceholderText('Anything specific they should focus on or avoid'), 'Check swipe-card logs first');
    await user.click(screen.getByRole('button', { name: 'Assign investigator' }));

    expect(assignInvestigator).toHaveBeenCalledWith('c1', 'u1', {
      allegationIds: ['a1'],
      targetCompletionDate: '',
      scopeNote: 'Check swipe-card logs first',
    });
  });

  it('shows a fallback message and no form when there are no eligible team members', () => {
    render(<AssignInvestigatorModal {...baseProps} orgMembers={[]} assignInvestigator={() => {}} />);
    expect(screen.getByText('No team members found. Add one in Organisation Settings first.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Assign investigator' })).not.toBeInTheDocument();
  });
});
