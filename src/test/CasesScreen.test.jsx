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
  it('labels every filter select', async () => {
    const user = userEvent.setup();
    render(<CasesScreen cases={cases} locations={[{ id: 'l1', name: 'Manchester' }]} orgMembers={[{ user_id: 'u1', name: 'Alex' }]} setIntake={noop} setScreen={noop} getCaseStage={()=>"open"} setActiveCaseId={noop} setActiveCaseStage={noop} getNextStep={()=>null} getProceedingTitle={cs=>cs.employeeName} getCaseStatus={()=>"active"} saveCases={noop} confirmDialog={noop} showToast={noop} />);
    // Phase 2B — Case type/Stage/Status stay immediately visible;
    // Location/Owner/Priority moved behind "More filters" (Compass
    // Design Vision, Amendment 1). Same selects, same labels, same
    // matchesCaseFilters predicates — only default visibility changed.
    expect(screen.getByLabelText('Filter by case type')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by stage')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by status')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: /More filters/ }));
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

// IA & User Journey pass, §10 — Cases as a work inbox: a top-level
// All/Mine/Needs attention/Closed segment, additional to (not replacing)
// the existing type/stage/status filters. "Mine" reuses the ownerId a
// case is already stamped with at creation; "Needs attention" reuses
// getNextStep exactly as the row's own "Next: …" line already does.
describe('CasesScreen — quick segments (IA & User Journey pass, §10)', () => {
  const baseProps = { locations: [], orgMembers: [], setIntake: noop, setScreen: noop, setActiveCaseId: noop, setActiveCaseStage: noop, getProceedingTitle: cs=>cs.employeeName, getCaseStatus: ()=>"active", saveCases: noop, confirmDialog: noop, showToast: noop };
  const segmentCases = [
    { id: 'mine-open', employeeName: 'Mine Open', ownerId: 'me', stage: 'investigation' },
    { id: 'other-open', employeeName: 'Other Open', ownerId: 'someone-else', stage: 'investigation' },
    { id: 'mine-closed', employeeName: 'Mine Closed', ownerId: 'me', stage: 'closed' },
  ];
  const getCaseStage = cs => cs.stage;
  const getNextStep = cs => cs.id === 'other-open' ? { action: true, label: 'Do something' } : null;

  // getProceedingTitle returns the plain employee name in these tests,
  // and the same-employee group header above each row also shows that
  // name — so every case name legitimately appears twice in the DOM
  // (group header + row title). getAllByText/queryAllByText check
  // presence/absence by count rather than assuming a single match.
  it('shows All by default with every case and correct segment counts', () => {
    render(<CasesScreen {...baseProps} cases={segmentCases} getCaseStage={getCaseStage} getNextStep={getNextStep} currentUserId="me" />);
    expect(screen.getByRole('button', { name: 'All (3)' })).toBeInTheDocument();
    expect(screen.getAllByText('Mine Open').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Other Open').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mine Closed').length).toBeGreaterThan(0);
  });

  it('filters to only the current user\'s cases under Mine', async () => {
    const user = userEvent.setup();
    render(<CasesScreen {...baseProps} cases={segmentCases} getCaseStage={getCaseStage} getNextStep={getNextStep} currentUserId="me" />);
    await user.click(screen.getByRole('button', { name: 'Mine (2)' }));
    expect(screen.getAllByText('Mine Open').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Mine Closed').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Other Open').length).toBe(0);
  });

  it('filters to only cases with a next step, excluding closed cases, under Needs attention', async () => {
    const user = userEvent.setup();
    render(<CasesScreen {...baseProps} cases={segmentCases} getCaseStage={getCaseStage} getNextStep={getNextStep} currentUserId="me" />);
    await user.click(screen.getByRole('button', { name: 'Needs attention (1)' }));
    expect(screen.getAllByText('Other Open').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Mine Open').length).toBe(0);
    expect(screen.queryAllByText('Mine Closed').length).toBe(0);
  });

  it('filters to only closed cases under Closed', async () => {
    const user = userEvent.setup();
    render(<CasesScreen {...baseProps} cases={segmentCases} getCaseStage={getCaseStage} getNextStep={getNextStep} currentUserId="me" />);
    await user.click(screen.getByRole('button', { name: 'Closed (1)' }));
    expect(screen.getAllByText('Mine Closed').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Mine Open').length).toBe(0);
    expect(screen.queryAllByText('Other Open').length).toBe(0);
  });
});

// Insights Phase 2 (Overview Intelligence, drill-down) — deepLink is an
// optional, additive one-shot seed (same shape/convention as
// InsightsScreen.jsx's own deepLink.initialSection). No second case-list
// implementation: every assertion below still reads from this same
// screen's existing filteredCases pipeline, just pre-seeded.
describe('CasesScreen — Insights drill-down (Insights Phase 2)', () => {
  const baseProps = { locations: [], orgMembers: [], setIntake: noop, setScreen: noop, getCaseStage: ()=>"open", setActiveCaseId: noop, setActiveCaseStage: noop, getNextStep: ()=>null, getProceedingTitle: cs=>cs.employeeName, getCaseStatus: ()=>"active", saveCases: noop, confirmDialog: noop, showToast: noop };
  const drillCases = [
    { id: 'c1', employeeName: 'Misconduct Employee', caseType: 'misconduct', stage: 'open' },
    { id: 'c2', employeeName: 'Grievance Employee', caseType: 'grievance', stage: 'open' },
  ];

  it('seeds the type filter from deepLink.initialFilters and shows only matching cases', () => {
    const clearInitialFilters = vi.fn();
    render(<CasesScreen {...baseProps} cases={drillCases}
      deepLink={{ initialFilters: { type: 'misconduct' }, clearInitialFilters }} />);
    expect(screen.getAllByText('Misconduct Employee').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Grievance Employee').length).toBe(0);
    expect(screen.getByLabelText('Filter by case type')).toHaveValue('misconduct');
  });

  it('seeds an exact case-id allowlist from deepLink.initialFilters.caseIds', () => {
    render(<CasesScreen {...baseProps} cases={drillCases}
      deepLink={{ initialFilters: { caseIds: ['c2'] }, clearInitialFilters: noop }} />);
    expect(screen.getAllByText('Grievance Employee').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Misconduct Employee').length).toBe(0);
  });

  it('calls clearInitialFilters exactly once on mount when a deep link was supplied', () => {
    const clearInitialFilters = vi.fn();
    render(<CasesScreen {...baseProps} cases={drillCases}
      deepLink={{ initialFilters: { type: 'misconduct' }, clearInitialFilters }} />);
    expect(clearInitialFilters).toHaveBeenCalledTimes(1);
  });

  it('never calls clearInitialFilters when no deep link was supplied (ordinary nav-rail visit)', () => {
    const clearInitialFilters = vi.fn();
    render(<CasesScreen {...baseProps} cases={drillCases} deepLink={{ initialFilters: null, clearInitialFilters }} />);
    expect(clearInitialFilters).not.toHaveBeenCalled();
  });

  it('renders normally with every case visible when deepLink is omitted entirely', () => {
    render(<CasesScreen {...baseProps} cases={drillCases} />);
    expect(screen.getAllByText('Misconduct Employee').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Grievance Employee').length).toBeGreaterThan(0);
  });

  it('shows a removable "From Insights" chip for a case-id drill-down, and removing it restores every case', async () => {
    const user = userEvent.setup();
    render(<CasesScreen {...baseProps} cases={drillCases}
      deepLink={{ initialFilters: { caseIds: ['c1'] }, clearInitialFilters: noop }} />);
    expect(screen.queryAllByText('Grievance Employee').length).toBe(0);
    const chip = screen.getByRole('button', { name: /Remove filter: From Insights/ });
    await user.click(chip);
    expect(screen.getAllByText('Misconduct Employee').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Grievance Employee').length).toBeGreaterThan(0);
  });

  it('"Clear filters" also clears an active case-id drill-down', async () => {
    const user = userEvent.setup();
    render(<CasesScreen {...baseProps} cases={drillCases}
      deepLink={{ initialFilters: { caseIds: ['c1'] }, clearInitialFilters: noop }} />);
    expect(screen.queryAllByText('Grievance Employee').length).toBe(0);
    await user.click(screen.getByRole('button', { name: /Clear filters/ }));
    expect(screen.getAllByText('Grievance Employee').length).toBeGreaterThan(0);
  });
});

// Insights Phase 3 (Emerging Patterns drill-down) — createdFrom/createdTo
// are a deliberately SEPARATE deep-link key pair from the existing
// caseIds/type keys above: bound to cs.createdAt, never cs.dateReceived.
// Not exposed as a manual UI control anywhere — deep-link-only.
describe('CasesScreen — Insights creation-date drill-down (Insights Phase 3)', () => {
  const baseProps = { locations: [], orgMembers: [], setIntake: noop, setScreen: noop, getCaseStage: ()=>"open", setActiveCaseId: noop, setActiveCaseStage: noop, getNextStep: ()=>null, getProceedingTitle: cs=>cs.employeeName, getCaseStatus: ()=>"active", saveCases: noop, confirmDialog: noop, showToast: noop };
  const dateRangeCases = [
    { id: 'c1', employeeName: 'Inside Range', caseType: 'misconduct', stage: 'open', createdAt: '2026-06-10T00:00:00.000Z' },
    { id: 'c2', employeeName: 'Before Range', caseType: 'misconduct', stage: 'open', createdAt: '2026-01-01T00:00:00.000Z' },
    { id: 'c3', employeeName: 'Quick-Start No Date-Received', caseType: '', dateReceived: null, stage: 'open', createdAt: '2026-06-15T00:00:00.000Z' },
  ];
  const range = { createdFrom: '2026-06-01T00:00:00.000Z', createdTo: '2026-07-01T00:00:00.000Z' };

  it('includes cases created inside the range and excludes those outside it', () => {
    render(<CasesScreen {...baseProps} cases={dateRangeCases}
      deepLink={{ initialFilters: range, clearInitialFilters: noop }} />);
    expect(screen.getAllByText('Inside Range').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Before Range').length).toBe(0);
  });

  it('includes a "+ New meeting" quick-start-shaped case (dateReceived null) purely by createdAt', () => {
    render(<CasesScreen {...baseProps} cases={dateRangeCases}
      deepLink={{ initialFilters: range, clearInitialFilters: noop }} />);
    expect(screen.getAllByText('Quick-Start No Date-Received').length).toBeGreaterThan(0);
  });

  it('shows a human-readable "From Insights" chip, never the raw createdFrom/createdTo field names', () => {
    render(<CasesScreen {...baseProps} cases={dateRangeCases}
      deepLink={{ initialFilters: range, clearInitialFilters: noop }} />);
    const chip = screen.getByRole('button', { name: /Remove filter: From Insights/ });
    expect(chip.textContent).not.toContain('createdFrom');
    expect(chip.textContent).not.toContain('createdTo');
  });

  it('removing the "From Insights" chip restores the full list', async () => {
    const user = userEvent.setup();
    render(<CasesScreen {...baseProps} cases={dateRangeCases}
      deepLink={{ initialFilters: range, clearInitialFilters: noop }} />);
    expect(screen.queryAllByText('Before Range').length).toBe(0);
    await user.click(screen.getByRole('button', { name: /Remove filter: From Insights/ }));
    expect(screen.getAllByText('Before Range').length).toBeGreaterThan(0);
  });

  it('"Clear filters" also clears an active creation-date drill-down', async () => {
    const user = userEvent.setup();
    render(<CasesScreen {...baseProps} cases={dateRangeCases}
      deepLink={{ initialFilters: range, clearInitialFilters: noop }} />);
    expect(screen.queryAllByText('Before Range').length).toBe(0);
    await user.click(screen.getByRole('button', { name: /Clear filters/ }));
    expect(screen.getAllByText('Before Range').length).toBeGreaterThan(0);
  });

  it('a later, ordinary Cases visit (no deep link) retains no residual creation-date filter', () => {
    render(<CasesScreen {...baseProps} cases={dateRangeCases} />);
    expect(screen.getAllByText('Before Range').length).toBeGreaterThan(0);
    expect(screen.queryByRole('button', { name: /Remove filter: From Insights/ })).not.toBeInTheDocument();
  });

  it('composes a type + creation-date drill-down (Signal 2 shape), and removing the chip clears type too when it was seeded together', async () => {
    const user = userEvent.setup();
    const cases = [
      { id: 'c1', employeeName: 'Grievance Inside', caseType: 'grievance', stage: 'open', createdAt: '2026-06-10T00:00:00.000Z' },
      { id: 'c2', employeeName: 'Misconduct Inside', caseType: 'misconduct', stage: 'open', createdAt: '2026-06-10T00:00:00.000Z' },
    ];
    render(<CasesScreen {...baseProps} cases={cases}
      deepLink={{ initialFilters: { type: 'grievance', ...range }, clearInitialFilters: noop }} />);
    expect(screen.getAllByText('Grievance Inside').length).toBeGreaterThan(0);
    expect(screen.queryAllByText('Misconduct Inside').length).toBe(0);
    expect(screen.getByLabelText('Filter by case type')).toHaveValue('grievance');
    await user.click(screen.getByRole('button', { name: /Remove filter: From Insights/ }));
    expect(screen.getByLabelText('Filter by case type')).toHaveValue(''); // type cleared alongside the date range
    expect(screen.getAllByText('Misconduct Inside').length).toBeGreaterThan(0);
  });

  it('does NOT clear type when it was not seeded together with a creation-date range (Phase 2 type-only drill-down, unaffected)', () => {
    const cases = [
      { id: 'c1', employeeName: 'Grievance Employee', caseType: 'grievance', stage: 'open' },
      { id: 'c2', employeeName: 'Misconduct Employee', caseType: 'misconduct', stage: 'open' },
    ];
    render(<CasesScreen {...baseProps} cases={cases}
      deepLink={{ initialFilters: { type: 'grievance' }, clearInitialFilters: noop }} />);
    expect(screen.getByLabelText('Filter by case type')).toHaveValue('grievance');
    expect(screen.queryByRole('button', { name: /Remove filter: From Insights/ })).not.toBeInTheDocument();
  });
});
