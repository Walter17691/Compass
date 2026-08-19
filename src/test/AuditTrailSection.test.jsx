import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AuditTrailSection } from '../screens/settings/AuditTrailSection.jsx';

// Integrations & Workflow Automation (Phase 5, IP30, §29) — the
// automation-provenance fields (aiPrepared/approvedBy/dataUsed) only
// ever render when present, so an ordinary human-triggered entry (the
// vast majority of this log) looks exactly as it did before this phase.
describe('AuditTrailSection — automation provenance (Phase 5, IP30)', () => {
  it('renders an ordinary entry with none of the new fields unchanged', () => {
    const auditLog = [{ id: '1', ts: '2026-08-19T10:00:00.000Z', user: 'Jo Smith', action: 'Task added', detail: 'Chase evidence', caseId: 'c1' }];
    render(<AuditTrailSection auditLog={auditLog} />);
    expect(screen.getByText('Task added')).toBeInTheDocument();
    expect(screen.getByText('Chase evidence')).toBeInTheDocument();
    expect(screen.queryByText('AI-PREPARED')).not.toBeInTheDocument();
    expect(screen.queryByText(/Approved by/)).not.toBeInTheDocument();
    expect(screen.queryByText(/Data used/)).not.toBeInTheDocument();
  });

  it('shows an AI-PREPARED badge for an automate-level entry, with the data used', () => {
    const auditLog = [{ id: '1', ts: '2026-08-19T10:00:00.000Z', user: 'HR Manager', action: 'Signature reminder resent', detail: 'Investigation', caseId: 'c1', aiPrepared: true, dataUsed: 'Investigation record dated 2026-08-10, unsigned since sent' }];
    render(<AuditTrailSection auditLog={auditLog} />);
    expect(screen.getByText('AI-PREPARED')).toBeInTheDocument();
    expect(screen.getByText(/Investigation record dated 2026-08-10/)).toBeInTheDocument();
    expect(screen.queryByText(/Approved by/)).not.toBeInTheDocument();
  });

  it('shows "Approved by" for a prepare-level entry, with no AI-PREPARED badge', () => {
    const auditLog = [{ id: '1', ts: '2026-08-19T10:00:00.000Z', user: 'Jo Smith', action: 'Signature reminder resent', detail: 'Investigation', caseId: 'c1', approvedBy: 'Jo Smith' }];
    render(<AuditTrailSection auditLog={auditLog} />);
    expect(screen.getByText('· Approved by Jo Smith')).toBeInTheDocument();
    expect(screen.queryByText('AI-PREPARED')).not.toBeInTheDocument();
  });
});
