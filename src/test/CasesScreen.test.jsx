import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CasesScreen } from '../screens/CasesScreen.jsx';

// Phase 6.5 hardening (Batch 13) — the six filter selects had no
// accessible name at all (only placeholder-style option text like "All
// types"); the per-row bulk-select checkbox had none either. Had no
// test coverage at all before this.
const noop = () => {};
const cases = [{ id: 'c1', employeeName: 'Sam Employee', caseType: 'misconduct', stage: 'open', ownerId: 'u1' }];

describe('CasesScreen — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels every filter select', () => {
    render(<CasesScreen cases={cases} locations={[{ id: 'l1', name: 'Manchester' }]} orgMembers={[{ user_id: 'u1', name: 'Alex' }]} setIntake={noop} setScreen={noop} getCaseStage={()=>"open"} setActiveCaseId={noop} setActiveCaseStage={noop} getNextStep={()=>null} getProceedingTitle={cs=>cs.employeeName} getCaseStatus={()=>"active"} saveCases={noop} confirmDialog={noop} showToast={noop} />);
    expect(screen.getByLabelText('Filter by case type')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by stage')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by status')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by location')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by owner')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by priority')).toBeInTheDocument();
  });

  it('labels the per-case bulk-select checkbox with the case\'s own name', () => {
    render(<CasesScreen cases={cases} locations={[]} orgMembers={[]} setIntake={noop} setScreen={noop} getCaseStage={()=>"open"} setActiveCaseId={noop} setActiveCaseStage={noop} getNextStep={()=>null} getProceedingTitle={cs=>cs.employeeName} getCaseStatus={()=>"active"} saveCases={noop} confirmDialog={noop} showToast={noop} />);
    expect(screen.getByLabelText('Select Sam Employee')).toBeInTheDocument();
  });
});

// Phase 6.5 hardening (P1, reliability review) — a large org's real case
// load now takes several sequential paginated requests (see
// loadCasesFromDB's own fetchAllPages fix) rather than the previous
// single, silently-truncating request. Without a distinct loading state,
// an empty cases array during that window was indistinguishable from
// "this org genuinely has zero cases," which showed a false "create your
// first case" prompt to an org that may already have thousands.
// Phase 6.5 hardening (closes Prompt 11 audit findings 5.10/5.11, MEDIUM)
describe('CasesScreen — bulk actions (Prompt 11 audit, 5.10/5.11)', () => {
  const baseProps = { locations: [], orgMembers: [], setIntake: noop, setScreen: noop, getCaseStage: ()=>"open", setActiveCaseId: noop, setActiveCaseStage: noop, getNextStep: ()=>null, getProceedingTitle: cs=>cs.employeeName, getCaseStatus: ()=>"active", saveCases: noop, showToast: noop };
  const soon = new Date(Date.now() + 3 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10); // 3 days from now — always within the 14-day due-soon window

  it('warns in the confirm dialog when a selected case has a live deadline (5.10)', async () => {
    const user = userEvent.setup();
    const casesWithDeadline = [{ id: 'c1', employeeName: 'Sam Employee', caseType: 'misconduct', stage: 'open', fitNoteEndDate: soon }];
    const confirmDialog = vi.fn().mockResolvedValue(false); // resolve false so the test doesn't also need to stub saveCases' real effect
    render(<CasesScreen {...baseProps} cases={casesWithDeadline} confirmDialog={confirmDialog} />);

    await user.click(screen.getByLabelText('Select Sam Employee'));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    expect(confirmDialog).toHaveBeenCalledTimes(1);
    const arg = confirmDialog.mock.calls[0][0];
    expect(arg.message).toContain('1 of these has a live deadline');
  });

  it('does not warn when no selected case has a live deadline (5.10)', async () => {
    const user = userEvent.setup();
    const casesNoDeadline = [{ id: 'c1', employeeName: 'Sam Employee', caseType: 'misconduct', stage: 'open' }];
    const confirmDialog = vi.fn().mockResolvedValue(false);
    render(<CasesScreen {...baseProps} cases={casesNoDeadline} confirmDialog={confirmDialog} />);

    await user.click(screen.getByLabelText('Select Sam Employee'));
    await user.click(screen.getByRole('button', { name: 'Close' }));

    const arg = confirmDialog.mock.calls[0][0];
    expect(arg.message).not.toContain('live deadline');
  });

  it('records an audit entry when bulk-exporting cases (5.11)', async () => {
    const user = userEvent.setup();
    const originalCreateObjectURL = URL.createObjectURL;
    const originalRevokeObjectURL = URL.revokeObjectURL;
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    const casesToExport = [{ id: 'c1', employeeName: 'Sam Employee', caseType: 'misconduct', stage: 'open' }];
    const audit = vi.fn();
    render(<CasesScreen {...baseProps} cases={casesToExport} confirmDialog={vi.fn()} audit={audit} />);

    await user.click(screen.getByLabelText('Select Sam Employee'));
    await user.click(screen.getByRole('button', { name: 'Export' }));

    expect(audit).toHaveBeenCalledWith('Bulk case export', '1 case exported as JSON', null, { dataUsed: 'Sam Employee' });
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
  });

  it('does not crash when no audit prop is passed', async () => {
    const user = userEvent.setup();
    URL.createObjectURL = vi.fn(() => 'blob:mock');
    URL.revokeObjectURL = vi.fn();
    const casesToExport = [{ id: 'c1', employeeName: 'Sam Employee', caseType: 'misconduct', stage: 'open' }];
    render(<CasesScreen {...baseProps} cases={casesToExport} confirmDialog={vi.fn()} />);

    await user.click(screen.getByLabelText('Select Sam Employee'));
    await expect(user.click(screen.getByRole('button', { name: 'Export' }))).resolves.not.toThrow();
  });
});

describe('CasesScreen — loading state (Phase 6.5, P1)', () => {
  const baseProps = { locations: [], orgMembers: [], setIntake: noop, setScreen: noop, getCaseStage: ()=>"open", setActiveCaseId: noop, setActiveCaseStage: noop, getNextStep: ()=>null, getProceedingTitle: cs=>cs.employeeName, getCaseStatus: ()=>"active", saveCases: noop, confirmDialog: noop, showToast: noop };

  it('shows a loading indicator, not "No cases yet", while the first case load is still in flight', () => {
    render(<CasesScreen {...baseProps} cases={[]} casesLoading={true} />);
    expect(screen.getByText('Loading cases…')).toBeInTheDocument();
    expect(screen.queryByText('No cases yet')).not.toBeInTheDocument();
  });

  it('shows the genuine empty state once loading has finished and there really are no cases', () => {
    render(<CasesScreen {...baseProps} cases={[]} casesLoading={false} />);
    expect(screen.getByText('No cases yet')).toBeInTheDocument();
    expect(screen.queryByText('Loading cases…')).not.toBeInTheDocument();
  });

  it('shows neither empty state once real cases have loaded', () => {
    render(<CasesScreen {...baseProps} cases={cases} casesLoading={false} />);
    expect(screen.queryByText('No cases yet')).not.toBeInTheDocument();
    expect(screen.queryByText('Loading cases…')).not.toBeInTheDocument();
  });
});
