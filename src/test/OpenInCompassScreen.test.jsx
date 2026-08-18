import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { OpenInCompassScreen } from '../screens/OpenInCompassScreen.jsx';

const cases = [
  { id: 'c1', employeeName: 'Sarah Jones', caseType: 'Grievance', stage: 'investigation', createdAt: '2026-01-01' },
  { id: 'c2', employeeName: 'James Smith', caseType: 'Disciplinary', stage: 'closed', createdAt: '2026-02-01' },
];
const getCaseStage = cs => cs.stage;
const emptyConcernForm = { employeeName: '', description: '' };

function baseProps(overrides={}) {
  return {
    employeeName: 'Sarah Jones',
    cases,
    getCaseStage,
    getEmployeeRecord: () => null,
    setActiveCaseId: vi.fn(),
    setCaseViewInitialTab: vi.fn(),
    setScreen: vi.fn(),
    setConcernForm: vi.fn(),
    emptyConcernForm,
    setConcernFormAutoOpen: vi.fn(),
    setCasePromptName: vi.fn(),
    setShowCasePrompt: vi.fn(),
    fmtDate: d => d,
    ...overrides,
  };
}

describe('OpenInCompassScreen (Phase 5, IP21)', () => {
  it('shows the employee name and their one existing case', () => {
    render(<OpenInCompassScreen {...baseProps()} />);
    expect(screen.getByRole('heading', { name: 'Sarah Jones' })).toBeInTheDocument();
    expect(screen.getByText('Grievance')).toBeInTheDocument();
    expect(screen.queryByText('Disciplinary')).not.toBeInTheDocument();
  });

  it('shows a "no existing cases" message when the employee has none', () => {
    render(<OpenInCompassScreen {...baseProps({ employeeName: 'Nobody Here' })} />);
    expect(screen.getByText('No existing cases for this employee.')).toBeInTheDocument();
  });

  it('clicking an existing case opens it in the case view', async () => {
    const user = userEvent.setup();
    const setActiveCaseId = vi.fn();
    const setScreen = vi.fn();
    render(<OpenInCompassScreen {...baseProps({ setActiveCaseId, setScreen })} />);
    await user.click(screen.getByText('Grievance'));
    expect(setActiveCaseId).toHaveBeenCalledWith('c1');
    expect(setScreen).toHaveBeenCalledWith('case_view');
  });

  it('"Raise a concern" seeds the concern form with the employee name and navigates to Concerns', async () => {
    const user = userEvent.setup();
    const setConcernForm = vi.fn();
    const setConcernFormAutoOpen = vi.fn();
    const setScreen = vi.fn();
    render(<OpenInCompassScreen {...baseProps({ setConcernForm, setConcernFormAutoOpen, setScreen })} />);
    await user.click(screen.getByRole('button', { name: 'Raise a concern' }));
    expect(setConcernForm).toHaveBeenCalledWith({ ...emptyConcernForm, employeeName: 'Sarah Jones' });
    expect(setConcernFormAutoOpen).toHaveBeenCalledWith(true);
    expect(setScreen).toHaveBeenCalledWith('concerns');
  });

  it('"Create a case" seeds the case-prompt name and opens the modal', async () => {
    const user = userEvent.setup();
    const setCasePromptName = vi.fn();
    const setShowCasePrompt = vi.fn();
    render(<OpenInCompassScreen {...baseProps({ setCasePromptName, setShowCasePrompt })} />);
    await user.click(screen.getByRole('button', { name: 'Create a case' }));
    expect(setCasePromptName).toHaveBeenCalledWith('Sarah Jones');
    expect(setShowCasePrompt).toHaveBeenCalledWith(true);
  });

  it('"View active actions" opens the single matching case directly on its tasks tab', async () => {
    const user = userEvent.setup();
    const setActiveCaseId = vi.fn();
    const setCaseViewInitialTab = vi.fn();
    const setScreen = vi.fn();
    render(<OpenInCompassScreen {...baseProps({ setActiveCaseId, setCaseViewInitialTab, setScreen })} />);
    await user.click(screen.getByRole('button', { name: 'View active actions' }));
    expect(setActiveCaseId).toHaveBeenCalledWith('c1');
    expect(setCaseViewInitialTab).toHaveBeenCalledWith('tasks');
    expect(setScreen).toHaveBeenCalledWith('case_view');
  });

  it('"View active actions" does not navigate when there are zero or multiple matching cases', async () => {
    const user = userEvent.setup();
    const setActiveCaseId = vi.fn();
    const setScreen = vi.fn();
    render(<OpenInCompassScreen {...baseProps({ employeeName: 'Nobody Here', setActiveCaseId, setScreen })} />);
    await user.click(screen.getByRole('button', { name: 'View active actions' }));
    expect(setActiveCaseId).not.toHaveBeenCalled();
    expect(setScreen).not.toHaveBeenCalled();
  });
});
