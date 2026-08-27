import { describe, it, expect } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { TimelinePanel } from '../components/TimelinePanel.jsx';

// Phase 6.5 hardening (Batch 13) — the person/allegation filter selects
// had no accessible name at all; the inline description edit field had
// none either. Had no test coverage at all before this.
const noop = () => {};
const cs = {
  id: 'c1', dateReceived: '2026-01-01',
  meetings: [
    { id: 'm1', date: '2026-01-05', type: 'Investigation meeting', manager: 'Alex Manager', record: true },
    { id: 'm2', date: '2026-01-10', type: 'Disciplinary hearing', manager: 'Jo Chair', record: true },
  ],
};
const allegations = [{ id: 'a1', caseId: 'c1', title: 'Unauthorised absence', createdAt: '2026-01-02' }];

describe('TimelinePanel — field labelling (Phase 6.5, Batch 13)', () => {
  it('labels the person and allegation filter selects', () => {
    render(<TimelinePanel cs={cs} allegations={allegations} auditLog={[]} fmtDate={d=>d} onEditDescription={noop} />);
    expect(screen.getByLabelText('Filter by person')).toBeInTheDocument();
    expect(screen.getByLabelText('Filter by allegation')).toBeInTheDocument();
  });

  it('gives the inline description edit field an accessible name', async () => {
    const user = userEvent.setup();
    render(<TimelinePanel cs={cs} allegations={allegations} auditLog={[]} fmtDate={d=>d} onEditDescription={noop} />);
    const meetingRow = screen.getByText('Investigation meeting held').closest('div').parentElement;
    await user.click(within(meetingRow).getByRole('button', { name: 'Edit' }));
    expect(screen.getByLabelText('Edit description for Meeting entry')).toBeInTheDocument();
  });
});

// Phase 6.5 hardening (closes Prompt 11 audit finding 4.8, MEDIUM)
describe('TimelinePanel — incomplete-audit-history caveat (Prompt 11 audit, 4.8)', () => {
  it('shows a caveat for a case opened before audit_log reliably carried case_id', () => {
    render(<TimelinePanel cs={cs} allegations={allegations} auditLog={[]} fmtDate={d=>d} onEditDescription={noop} />);
    expect(screen.getByText(/some historic entries from that period may not appear/)).toBeInTheDocument();
  });

  it('does not show the caveat for a case opened after the cutoff', () => {
    const recentCase = { ...cs, dateReceived: '2026-08-22' };
    render(<TimelinePanel cs={recentCase} allegations={allegations} auditLog={[]} fmtDate={d=>d} onEditDescription={noop} />);
    expect(screen.queryByText(/some historic entries from that period may not appear/)).not.toBeInTheDocument();
  });
});
