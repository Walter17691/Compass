import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

const rpcMock = vi.fn();
vi.mock('../supabase', () => ({ supabase: { rpc: (...args) => rpcMock(...args) } }));

const { ImprovementInitiativesPanel } = await import('../components/ImprovementInitiativesPanel.jsx');

const baseInitiative = {
  id: 'init1', title: 'Reduce Manchester grievances', problemIdentified: 'Grievance volume rising at Manchester.',
  supportingInsights: ['Trend: grievance cases (last 90 days)'], owner: 'Priya Shah', targetCompletion: '2026-09-30',
  status: 'active', milestones: [], outcome: '', createdAt: '2026-08-01T00:00:00Z',
};

// Organisational ER Intelligence (Phase 6, OP22, §18)
describe('ImprovementInitiativesPanel', () => {
  beforeEach(() => { rpcMock.mockReset(); });

  it('shows an empty state when there are no initiatives', () => {
    render(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[]} isHR={true} onAdd={vi.fn()} onUpdate={vi.fn()} caseTasks={[]}/>);
    expect(screen.getByText('No improvement initiatives yet.')).toBeInTheDocument();
  });

  it('renders an initiative card with title, status, owner, and target completion', () => {
    render(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[baseInitiative]} isHR={true} onAdd={vi.fn()} onUpdate={vi.fn()} caseTasks={[]}/>);
    expect(screen.getByText('Reduce Manchester grievances')).toBeInTheDocument();
    expect(screen.getByText('Active')).toBeInTheDocument();
    expect(screen.getByText(/Priya Shah/)).toBeInTheDocument();
    expect(screen.getByText(/Target: 2026-09-30/)).toBeInTheDocument();
    expect(screen.getByText('Trend: grievance cases (last 90 days)')).toBeInTheDocument();
  });

  it('hides the New initiative control for non-HR', () => {
    render(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[]} isHR={false} onAdd={vi.fn()} onUpdate={vi.fn()} caseTasks={[]}/>);
    expect(screen.queryByRole('button', { name: '+ New initiative' })).not.toBeInTheDocument();
  });

  // Phase 6.5 hardening (Batch 9) — every "New initiative" field relied
  // on placeholder text alone, which isn't a reliable accessible name
  // for assistive tech. Proves each field is now reachable by its real
  // accessible label, not just its placeholder.
  it('labels every "New initiative" field with a real accessible name', async () => {
    const user = userEvent.setup();
    render(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[]} isHR={true} onAdd={vi.fn()} onUpdate={vi.fn()} caseTasks={[]}/>);
    await user.click(screen.getByRole('button', { name: '+ New initiative' }));
    expect(screen.getByLabelText('Initiative title')).toBeInTheDocument();
    expect(screen.getByLabelText('Problem identified')).toBeInTheDocument();
    expect(screen.getByLabelText('Supporting insights (comma-separated, optional)')).toBeInTheDocument();
    expect(screen.getByLabelText('Owner')).toBeInTheDocument();
    expect(screen.getByLabelText('Target completion date')).toBeInTheDocument();
  });

  it('creates an initiative with comma-separated supporting insights split into an array', async () => {
    const user = userEvent.setup();
    const onAdd = vi.fn();
    render(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[]} isHR={true} onAdd={onAdd} onUpdate={vi.fn()} caseTasks={[]}/>);
    await user.click(screen.getByRole('button', { name: '+ New initiative' }));
    await user.type(screen.getByPlaceholderText('Title'), 'Reduce Manchester grievances');
    await user.type(screen.getByPlaceholderText('Problem identified'), 'Grievance volume rising.');
    await user.type(screen.getByPlaceholderText('Supporting insights (comma-separated, optional)'), 'Trend: grievance cases, Risk flag: Manchester');
    await user.type(screen.getByPlaceholderText('Owner'), 'Priya Shah');
    await user.click(screen.getByRole('button', { name: 'Create initiative' }));
    expect(onAdd).toHaveBeenCalledWith(expect.objectContaining({
      title: 'Reduce Manchester grievances',
      problemIdentified: 'Grievance volume rising.',
      supportingInsights: ['Trend: grievance cases', 'Risk flag: Manchester'],
      owner: 'Priya Shah',
    }));
  });

  it('expands to show milestones and linked actions, and lets HR add a milestone', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const caseTasks = [{ id: 't1', name: 'Review rota policy', owner: 'Sam', dueDate: '', status: 'open', improvementInitiativeId: 'init1' }];
    render(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[baseInitiative]} isHR={true} onAdd={vi.fn()} onUpdate={onUpdate} caseTasks={caseTasks}/>);
    await user.click(screen.getByRole('button', { name: 'View details' }));
    expect(screen.getByText('No milestones set yet.')).toBeInTheDocument();
    expect(screen.getByText(/Review rota policy/)).toBeInTheDocument();

    await user.type(screen.getByPlaceholderText('New milestone'), 'Draft new rota policy');
    await user.click(screen.getByRole('button', { name: 'Add milestone' }));
    expect(onUpdate).toHaveBeenCalledWith('init1', { milestones: expect.arrayContaining([expect.objectContaining({ label: 'Draft new rota policy', done: false })]) });
  });

  it('toggles a milestone done and calls onUpdate with the toggled array', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    const withMilestone = { ...baseInitiative, milestones: [{ id: 'm1', label: 'Draft policy', targetDate: '', done: false }] };
    render(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[withMilestone]} isHR={true} onAdd={vi.fn()} onUpdate={onUpdate} caseTasks={[]}/>);
    await user.click(screen.getByRole('button', { name: 'View details' }));
    await user.click(screen.getByRole('checkbox'));
    expect(onUpdate).toHaveBeenCalledWith('init1', { milestones: [expect.objectContaining({ id: 'm1', done: true })] });
  });

  it('disables milestone checkboxes and hides add/remove controls for non-HR', async () => {
    const user = userEvent.setup();
    const withMilestone = { ...baseInitiative, milestones: [{ id: 'm1', label: 'Draft policy', targetDate: '', done: false }] };
    render(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[withMilestone]} isHR={false} onAdd={vi.fn()} onUpdate={vi.fn()} caseTasks={[]}/>);
    await user.click(screen.getByRole('button', { name: 'View details' }));
    expect(screen.getByRole('checkbox')).toBeDisabled();
    expect(screen.queryByRole('button', { name: 'Remove' })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText('New milestone')).not.toBeInTheDocument();
  });

  it('changes status and saves an outcome for HR', async () => {
    const user = userEvent.setup();
    const onUpdate = vi.fn();
    render(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[baseInitiative]} isHR={true} onAdd={vi.fn()} onUpdate={onUpdate} caseTasks={[]}/>);
    await user.click(screen.getByRole('button', { name: 'View details' }));
    await user.selectOptions(screen.getByDisplayValue('Active'), 'completed');
    expect(onUpdate).toHaveBeenCalledWith('init1', { status: 'completed' });

    const saveOutcomeBtn = screen.getByRole('button', { name: 'Save outcome' });
    expect(saveOutcomeBtn).toBeDisabled();
    await user.type(screen.getByPlaceholderText('What happened once this was implemented…'), 'Grievance volume dropped after the rota change.');
    await user.click(saveOutcomeBtn);
    expect(onUpdate).toHaveBeenCalledWith('init1', { outcome: 'Grievance volume dropped after the rota change.' });
  });

  // Organisational ER Intelligence (Phase 6, OP23, §19)
  describe('metric selection and impact tracking', () => {
    const cases = [{ id: 'c1', caseType: 'grievance' }, { id: 'c2', caseType: 'misconduct' }, { id: 'c3', caseType: 'grievance' }];
    const organisationThemes = [{ id: 'th1', name: 'Rota changes', active: true }, { id: 'th2', name: 'Retired theme', active: false }];

    it('lets HR set which metric this initiative addresses', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      render(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[baseInitiative]} isHR={true} onAdd={vi.fn()} onUpdate={onUpdate} caseTasks={[]} cases={cases} organisationThemes={organisationThemes}/>);
      await user.click(screen.getByRole('button', { name: 'View details' }));
      await user.selectOptions(screen.getByDisplayValue('Not set'), 'case_type');
      expect(onUpdate).toHaveBeenCalledWith('init1', { metricKind: 'case_type', metricValue: null });
    });

    it('offers real distinct case types once case_type is selected as the metric kind', async () => {
      const user = userEvent.setup();
      const onUpdate = vi.fn();
      const withKind = { ...baseInitiative, metricKind: 'case_type' };
      render(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[withKind]} isHR={true} onAdd={vi.fn()} onUpdate={onUpdate} caseTasks={[]} cases={cases} organisationThemes={organisationThemes}/>);
      await user.click(screen.getByRole('button', { name: 'View details' }));
      await user.selectOptions(screen.getByText('Select a case type…').closest('select'), 'grievance');
      expect(onUpdate).toHaveBeenCalledWith('init1', { metricKind: 'case_type', metricValue: 'grievance' });
    });

    it('only offers active themes for a theme metric', async () => {
      const user = userEvent.setup();
      const withKind = { ...baseInitiative, metricKind: 'theme' };
      render(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[withKind]} isHR={true} onAdd={vi.fn()} onUpdate={vi.fn()} caseTasks={[]} cases={cases} organisationThemes={organisationThemes}/>);
      await user.click(screen.getByRole('button', { name: 'View details' }));
      expect(screen.getByText('Rota changes')).toBeInTheDocument();
      expect(screen.queryByText('Retired theme')).not.toBeInTheDocument();
    });

    it('shows no Impact section until the initiative is completed with a metric set', async () => {
      const user = userEvent.setup();
      const withKindOnly = { ...baseInitiative, metricKind: 'case_type', metricValue: 'grievance', status: 'active' };
      render(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[withKindOnly]} isHR={true} onAdd={vi.fn()} onUpdate={vi.fn()} caseTasks={[]} cases={cases} organisationThemes={organisationThemes}/>);
      await user.click(screen.getByRole('button', { name: 'View details' }));
      expect(screen.queryByText('Impact')).not.toBeInTheDocument();
    });

    it('shows a "not enough time" message when completed too recently', async () => {
      const user = userEvent.setup();
      const recentlyCompleted = {
        ...baseInitiative, status: 'completed', metricKind: 'case_type', metricValue: 'grievance',
        completedAt: new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString(),
      };
      render(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[recentlyCompleted]} isHR={true} onAdd={vi.fn()} onUpdate={vi.fn()} caseTasks={[]} cases={cases} organisationThemes={organisationThemes}/>);
      await user.click(screen.getByRole('button', { name: 'View details' }));
      expect(screen.getByText(/Not enough time has passed since completion/)).toBeInTheDocument();
      expect(rpcMock).not.toHaveBeenCalled();
    });

    it('fetches and shows a real impact comparison once enough time has passed, visible to non-HR too', async () => {
      const user = userEvent.setup();
      rpcMock.mockResolvedValue({
        data: { by_type_trend: [{ caseType: 'grievance', currentCount: 2, previousCount: 8, byLocation: {} }], by_theme_trend: [] },
        error: null,
      });
      const completed = {
        ...baseInitiative, status: 'completed', metricKind: 'case_type', metricValue: 'grievance',
        completedAt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString(),
      };
      render(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[completed]} isHR={false} onAdd={vi.fn()} onUpdate={vi.fn()} caseTasks={[]} cases={cases} organisationThemes={organisationThemes}/>);
      await user.click(screen.getByRole('button', { name: 'View details' }));
      await waitFor(() => expect(screen.getByText(/grievance rates decreased/)).toBeInTheDocument());
      expect(screen.getByText(/not a confirmed causal outcome/)).toBeInTheDocument();
      expect(rpcMock).toHaveBeenCalledWith('org_trend_detection', { p_org_id: 'org1', p_period_days: 30 });
    });
  });

  // Phase 6.5 hardening (Batch 13) — the milestone checkbox, new-milestone
  // fields, metric-value selects, status select, and outcome textarea
  // either had no accessible name at all or a visual label with no
  // htmlFor/id association.
  describe('field labelling (Phase 6.5, Batch 13)', () => {
    const cases = [{ id: 'c1', caseType: 'grievance' }];
    const organisationThemes = [{ id: 'th1', name: 'Rota changes', active: true }];

    it('names the milestone done checkbox after the milestone', async () => {
      const user = userEvent.setup();
      const withMilestone = { ...baseInitiative, milestones: [{ id: 'm1', label: 'Draft policy', targetDate: '', done: false }] };
      render(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[withMilestone]} isHR={true} onAdd={vi.fn()} onUpdate={vi.fn()} caseTasks={[]}/>);
      await user.click(screen.getByRole('button', { name: 'View details' }));
      expect(screen.getByLabelText('Mark "Draft policy" done')).toBeInTheDocument();
    });

    it('labels the new-milestone label and target-date fields', async () => {
      const user = userEvent.setup();
      render(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[baseInitiative]} isHR={true} onAdd={vi.fn()} onUpdate={vi.fn()} caseTasks={[]}/>);
      await user.click(screen.getByRole('button', { name: 'View details' }));
      expect(screen.getByLabelText('New milestone')).toBeInTheDocument();
      expect(screen.getByLabelText('New milestone target date')).toBeInTheDocument();
    });

    it('labels the metric-kind select, status select, and outcome textarea', async () => {
      const user = userEvent.setup();
      render(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[baseInitiative]} isHR={true} onAdd={vi.fn()} onUpdate={vi.fn()} caseTasks={[]} cases={cases} organisationThemes={organisationThemes}/>);
      await user.click(screen.getByRole('button', { name: 'View details' }));
      expect(screen.getByLabelText(/Metric this initiative addresses/)).toBeInTheDocument();
      expect(screen.getByLabelText('Status')).toBeInTheDocument();
      expect(screen.getByLabelText('Outcome')).toBeInTheDocument();
    });

    it('labels the case-type and theme metric-value selects once a metric kind is chosen', async () => {
      const user = userEvent.setup();
      const withCaseType = { ...baseInitiative, metricKind: 'case_type' };
      const { rerender } = render(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[withCaseType]} isHR={true} onAdd={vi.fn()} onUpdate={vi.fn()} caseTasks={[]} cases={cases} organisationThemes={organisationThemes}/>);
      await user.click(screen.getByRole('button', { name: 'View details' }));
      expect(screen.getByLabelText('Case type value')).toBeInTheDocument();

      const withTheme = { ...baseInitiative, metricKind: 'theme' };
      rerender(<ImprovementInitiativesPanel orgId="org1" improvementInitiatives={[withTheme]} isHR={true} onAdd={vi.fn()} onUpdate={vi.fn()} caseTasks={[]} cases={cases} organisationThemes={organisationThemes}/>);
      expect(screen.getByLabelText('Theme value')).toBeInTheDocument();
    });
  });
});
