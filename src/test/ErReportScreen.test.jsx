import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ErReportScreen } from '../screens/ErReportScreen.jsx';

// Phase 6.5 hardening (closes Prompt 16 audit finding H2, HIGH) — the
// "Repeat cases" panel names individual employees by their own repeat-case
// history and links straight into their PersonView dossier, unlike every
// other panel on this screen (aggregate, non-identifying counts). Reports
// itself stays reachable by every role (InsightsScreen.jsx's own tab list
// only isHR-gates Manager Insights/Org Events/Risk Map/Improvement
// Initiatives), so this one panel needs its own internal gate.
const noop = () => {};
const baseProps = {
  cases: [
    { id: 'c1', employeeName: 'Ada Lovelace', caseType: 'Grievance', dateReceived: '2026-01-01' },
    { id: 'c2', employeeName: 'Ada Lovelace', caseType: 'Misconduct', dateReceived: '2026-02-01' },
  ],
  getCaseStage: () => 'open',
  employeeRecords: [],
  setReportNarrative: noop,
  reportNarrative: '',
  setActiveCaseId: noop,
  setActiveCaseStage: noop,
  setScreen: noop,
  setActivePerson: noop,
  getNextStep: () => null,
  fmtDate: d => d,
  loadJsPDF: vi.fn(),
  caseThemes: [],
  organisationThemes: [],
};

describe('ErReportScreen — Repeat cases panel gating (Prompt 16 audit, H2)', () => {
  it('shows the Repeat cases panel, naming the repeat employee, for HR', () => {
    render(<ErReportScreen {...baseProps} isHR={true} />);
    expect(screen.getByText('Repeat cases')).toBeInTheDocument();
    expect(screen.getAllByText('Ada Lovelace').length).toBeGreaterThan(0);
  });

  it('hides the Repeat cases panel entirely for non-HR', () => {
    render(<ErReportScreen {...baseProps} isHR={false} />);
    expect(screen.queryByText('Repeat cases')).not.toBeInTheDocument();
    expect(screen.queryByText('2 cases')).not.toBeInTheDocument();
  });
});
