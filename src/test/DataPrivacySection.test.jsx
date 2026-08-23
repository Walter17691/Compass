import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { DataPrivacySection } from '../screens/settings/DataPrivacySection.jsx';

const noop = () => {};
const cases = [];
const baseProps = {
  isHR: true, exportCSV: noop, exportPDF: noop, cases, policies: [], auditLog: [],
  exportAllData: noop, deleteAllData: noop, setGdprAccepted: noop, setShowGdpr: noop, lsSet: noop,
  dataRetentionYears: null, saveDataRetentionYears: noop,
};

// Phase 6.5 hardening (data-lifecycle review) — a configurable retention
// period, with no automated enforcement (Compass never deletes/
// anonymises anything based on this value — see App.jsx's own
// saveDataRetentionYears comment on why not).
describe('DataPrivacySection — data retention field', () => {
  it('is hidden from non-HR staff, matching every other admin-only control on this screen', () => {
    render(<DataPrivacySection {...baseProps} isHR={false} />);
    expect(screen.queryByLabelText('Retention period (years)')).not.toBeInTheDocument();
  });

  it('shows "Not set" when no retention period has been configured', () => {
    render(<DataPrivacySection {...baseProps} dataRetentionYears={null} />);
    expect(screen.getByLabelText('Retention period (years)')).toHaveAttribute('placeholder', 'Not set');
  });

  it('shows the current retention period when one is set', () => {
    render(<DataPrivacySection {...baseProps} dataRetentionYears={6} />);
    expect(screen.getByLabelText('Retention period (years)')).toHaveValue(6);
  });

  it('saves the entered value when Save is clicked', async () => {
    const saveDataRetentionYears = vi.fn();
    const user = userEvent.setup();
    render(<DataPrivacySection {...baseProps} saveDataRetentionYears={saveDataRetentionYears} />);
    const field = screen.getByLabelText('Retention period (years)');
    await user.type(field, '6');
    await user.click(screen.getByRole('button', { name: 'Save' }));
    expect(saveDataRetentionYears).toHaveBeenCalledWith('6');
  });
});
